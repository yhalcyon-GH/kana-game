// Normalizes PERCEIVED loudness across every audio clip actually used by the
// app: kana single-sound clips (public/audio/characters), vocabulary clips
// (public/audio/words, Azure- and ElevenLabs-generated), Tamamizu voice
// lines (public/audio/feedback, public/audio/guide, public/audio/restaurant/**).
//
// Method
// ------
// Normal speech clips (everything except public/audio/characters) use
// two-pass ffmpeg `loudnorm` (EBU R128):
//   1. Measure pass: `loudnorm=print_format=json` reports each clip's
//      integrated loudness (LUFS), true peak, and loudness range.
//   2. Correction pass: those EXACT measured values are fed back into a
//      second `loudnorm` call (`measured_I`/`measured_TP`/`measured_LRA`/
//      `measured_thresh` + `linear=true` where the correction stays within
//      loudnorm's linear-gain range) so the filter applies one precise
//      linear gain instead of guessing from a single-pass heuristic.
//   Target: I=-16 LUFS, TP=-1.5 dBTP, LRA=11 (same target already
//   established by the prior characters/words-only pass in
//   scripts/normalizeAudioVolume.mjs, extended here to every spoken-line
//   category).
//
// Kana single-sound clips (public/audio/characters) are 0.3-1.2s — far too
// short for integrated LUFS to be a stable measurement (EBU R128 needs a
// few seconds of program to settle). Instead:
//   - Measure each clip's mean volume (`volumedetect`) and max/peak volume.
//   - Compute a single per-file gain that moves the clip's mean volume to a
//     reference mean-volume level derived from the ALREADY-normalized
//     speech clips (so kana clips sound level-matched against vocabulary/
//     Tamamizu by ear, not by a shaky short-clip LUFS number).
//   - Cap that gain so the clip's resulting peak never exceeds the same
//     -1.5 dBFS ceiling used for speech clips (no clipping).
//
// Hard constraints (do not change): no clipping, no pitch/duration/tempo
// change, no silence trimming, no renaming, no resampling/rechannelling —
// every ffmpeg call below preserves the source sample rate and channel
// layout (no `-ar`/`-ac`).
//
//   node scripts/normalizeAudioLoudness.mjs [--dry-run] [--report=path.json]
import { execFile } from 'node:child_process'
import { readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'

const DRY_RUN = process.argv.includes('--dry-run')
const reportArg = process.argv.find((a) => a.startsWith('--report='))
const REPORT_PATH = reportArg ? reportArg.slice('--report='.length) : null

// Same EBU R128 target used by the prior characters/words normalization
// pass (scripts/normalizeAudioVolume.mjs) — kept identical so this run is a
// consistent continuation, not a competing target.
const TARGET_I = -16 // LUFS
const TARGET_TP = -1.5 // dBTP
const TARGET_LRA = 11

// Speech categories: two-pass EBU R128 loudnorm.
const SPEECH_DIRS = [
  'public/audio/words',
  'public/audio/feedback',
  'public/audio/guide',
  'public/audio/restaurant',
]
// Kana single-sound clips: RMS/peak-ceiling matched against the speech
// clips' target, not integrated LUFS.
const SHORT_CLIP_DIR = 'public/audio/characters'

async function listWavFiles(dir) {
  const out = []
  async function walk(current) {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.wav')) out.push(full)
    }
  }
  await walk(dir)
  return out
}

async function probeFormat(file) {
  const { stdout } = await execFileAsync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'stream=sample_rate,channels,codec_name',
    '-show_entries', 'format=duration',
    '-of', 'json',
    file,
  ])
  const parsed = JSON.parse(stdout)
  const stream = parsed.streams?.[0] ?? {}
  return {
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
    codec: stream.codec_name,
    duration: Number(parsed.format?.duration ?? 0),
  }
}

// Runs loudnorm in measure-only mode and parses the JSON block it prints to
// stderr (ffmpeg's loudnorm always reports on stderr regardless of -v).
async function measureLoudnorm(file) {
  const args = [
    '-hide_banner', '-nostats', '-i', file,
    '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
    '-f', 'null', '-',
  ]
  let stderr = ''
  try {
    const result = await execFileAsync(FFMPEG, args)
    stderr = result.stderr ?? ''
  } catch (err) {
    stderr = err.stderr ?? ''
  }
  const jsonMatch = stderr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`loudnorm measurement failed to produce JSON for ${file}`)
  return JSON.parse(jsonMatch[0])
}

async function measureVolume(file) {
  const args = ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']
  let stderr = ''
  try {
    const result = await execFileAsync(FFMPEG, args)
    stderr = result.stderr ?? ''
  } catch (err) {
    stderr = err.stderr ?? ''
  }
  const mean = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)
  const max = stderr.match(/max_volume:\s*(-?[\d.]+) dB/)
  return {
    meanVolume: mean ? Number(mean[1]) : null,
    maxVolume: max ? Number(max[1]) : null,
  }
}

// ffmpeg's loudnorm filter internally oversamples to 192kHz for true-peak
// detection; without an explicit `-ar` it silently emits the output at that
// internal rate. Every write below pins `-ar`/`-ac` back to the SOURCE
// file's own sample rate/channel count (probed per-file, since characters/
// words mix 44100Hz and 24000Hz clips) so this normalization pass changes
// loudness only — never sample rate, channel layout, or container.
async function applyMeasuredLoudnorm(file, measured, format) {
  const tmp = `${file}.tmp.wav`
  const filter = [
    `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}`,
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
    'print_format=summary',
  ].join(':')
  await execFileAsync(FFMPEG, [
    '-y', '-hide_banner', '-nostats', '-i', file,
    '-af', filter,
    '-ar', String(format.sampleRate),
    '-ac', String(format.channels),
    tmp,
  ])
  await rename(tmp, file)
}

async function applyGain(file, gainDb, format) {
  if (Math.abs(gainDb) < 0.05) return // not worth a lossy re-encode round-trip for a negligible change
  const tmp = `${file}.tmp.wav`
  await execFileAsync(FFMPEG, [
    '-y', '-hide_banner', '-nostats', '-i', file,
    '-af', `volume=${gainDb.toFixed(3)}dB`,
    '-ar', String(format.sampleRate),
    '-ac', String(format.channels),
    tmp,
  ])
  await rename(tmp, file)
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function processSpeechCategory(dir, report) {
  const files = await listWavFiles(path.join(root, dir))
  console.log(`\n== ${dir} (${files.length} files) ==`)
  const before = []
  for (const file of files) {
    const measured = await measureLoudnorm(file)
    before.push({ file, measured, format: await probeFormat(file) })
  }
  const beforeLufs = before.map((b) => Number(b.measured.input_i)).filter(Number.isFinite)
  console.log(`  before: median ${median(beforeLufs).toFixed(1)} LUFS, range ${Math.min(...beforeLufs).toFixed(1)} to ${Math.max(...beforeLufs).toFixed(1)}`)

  const skipped = []
  if (!DRY_RUN) {
    for (const { file, measured, format } of before) {
      // A handful of speech clips are short enough (well under EBU R128's
      // 400ms gating block) that loudnorm's gated integrated measurement
      // never registers a loud-enough block and reports -inf/non-finite —
      // there is no valid linear correction to apply in that case. Leave
      // those clips' loudness untouched rather than feed loudnorm a
      // non-finite value (which ffmpeg rejects outright) — they're listed
      // in the report as excluded-from-LUFS-correction.
      if (!Number.isFinite(Number(measured.input_i))) {
        skipped.push(file)
        continue
      }
      await applyMeasuredLoudnorm(file, measured, format)
    }
    if (skipped.length) console.log(`  skipped (non-finite measured loudness, too short to gate): ${skipped.length}`)
  }

  const afterLufs = []
  if (!DRY_RUN) {
    for (const { file } of before) {
      if (skipped.includes(file)) continue
      const remeasured = await measureLoudnorm(file)
      const value = Number(remeasured.input_i)
      if (Number.isFinite(value)) afterLufs.push(value)
    }
    console.log(`  after:  median ${median(afterLufs).toFixed(1)} LUFS, range ${Math.min(...afterLufs).toFixed(1)} to ${Math.max(...afterLufs).toFixed(1)}`)
  }

  report.categories[dir] = {
    fileCount: files.length,
    beforeLufsMedian: median(beforeLufs),
    beforeLufsRange: [Math.min(...beforeLufs), Math.max(...beforeLufs)],
    afterLufsMedian: DRY_RUN ? null : median(afterLufs),
    afterLufsRange: DRY_RUN ? null : [Math.min(...afterLufs), Math.max(...afterLufs)],
    skippedTooShortToGate: skipped.map((f) => path.relative(root, f)),
  }
  return { beforeLufs, afterLufs }
}

async function processShortClips(dir, referenceMeanVolumeDb, report) {
  const files = await listWavFiles(path.join(root, dir))
  console.log(`\n== ${dir} (${files.length} files, RMS/peak-matched, not LUFS) ==`)
  const before = []
  for (const file of files) {
    const vol = await measureVolume(file)
    const format = await probeFormat(file)
    before.push({ file, vol, format })
  }
  const beforeMean = before.map((b) => b.vol.meanVolume).filter((v) => v !== null)
  console.log(`  before mean_volume: median ${median(beforeMean).toFixed(1)} dB, range ${Math.min(...beforeMean).toFixed(1)} to ${Math.max(...beforeMean).toFixed(1)}`)
  console.log(`  target reference mean_volume (from normalized speech clips): ${referenceMeanVolumeDb.toFixed(1)} dB`)

  const applied = []
  for (const { file, vol, format } of before) {
    if (vol.meanVolume === null || vol.maxVolume === null) continue
    let gain = referenceMeanVolumeDb - vol.meanVolume
    // Peak ceiling: never push this clip's peak past -1.5 dBFS, matching
    // the same true-peak ceiling used for speech clips (no clipping/no
    // audible distortion).
    const resultingPeak = vol.maxVolume + gain
    if (resultingPeak > TARGET_TP) gain -= resultingPeak - TARGET_TP
    applied.push({ file, gain })
    if (!DRY_RUN) await applyGain(file, gain, format)
  }

  const afterMean = []
  if (!DRY_RUN) {
    for (const { file } of applied) {
      const vol = await measureVolume(file)
      if (vol.meanVolume !== null) afterMean.push(vol.meanVolume)
    }
    console.log(`  after mean_volume:  median ${median(afterMean).toFixed(1)} dB, range ${Math.min(...afterMean).toFixed(1)} to ${Math.max(...afterMean).toFixed(1)}`)
  }

  report.categories[dir] = {
    fileCount: files.length,
    method: 'rms-peak-matched (short-clip fallback, not integrated LUFS)',
    referenceMeanVolumeDb,
    beforeMeanVolumeMedian: median(beforeMean),
    beforeMeanVolumeRange: [Math.min(...beforeMean), Math.max(...beforeMean)],
    afterMeanVolumeMedian: DRY_RUN ? null : median(afterMean),
    afterMeanVolumeRange: DRY_RUN ? null : [Math.min(...afterMean), Math.max(...afterMean)],
    gainAppliedRange: applied.length ? [Math.min(...applied.map((a) => a.gain)), Math.max(...applied.map((a) => a.gain))] : null,
  }
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (measure only, no files modified)' : 'APPLY'}`)
  const report = { target: { I: TARGET_I, TP: TARGET_TP, LRA: TARGET_LRA }, categories: {} }

  for (const dir of SPEECH_DIRS) {
    await processSpeechCategory(dir, report)
  }

  // Establish the short-clip reference AFTER speech categories are
  // normalized, by re-measuring mean_volume on a sample of the
  // already-normalized words/feedback clips (or, on a dry run, on their
  // current un-normalized state — the dry run is diagnostic only).
  const wordsSample = (await listWavFiles(path.join(root, 'public/audio/words'))).slice(0, 40)
  const sampleMeans = []
  for (const file of wordsSample) {
    const vol = await measureVolume(file)
    if (vol.meanVolume !== null) sampleMeans.push(vol.meanVolume)
  }
  const referenceMeanVolumeDb = median(sampleMeans)

  await processShortClips(SHORT_CLIP_DIR, referenceMeanVolumeDb, report)

  if (REPORT_PATH) {
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2))
    console.log(`\nReport written to ${REPORT_PATH}`)
  }
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
