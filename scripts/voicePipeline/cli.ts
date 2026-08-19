// Entry point.
//
//   tsx scripts/voicePipeline/cli.ts --file input/test.wav --sequence hiragana-gojuon-46 --analyze-only
//   tsx scripts/voicePipeline/cli.ts --file input/test.wav --sequence hiragana-gojuon-46 --split-only
//   tsx scripts/voicePipeline/cli.ts --file input/test.wav --sequence hiragana-gojuon-46
//   tsx scripts/voicePipeline/cli.ts --all
//
// See package.json's voice:analyze / voice:split / voice:process scripts
// for the shorthand versions, and scripts/voicePipeline/README.md for the
// full walkthrough. --sequence can be omitted once an entry exists in
// voicePipeline.manifest.json for the file's basename.
import path from 'node:path'
import { applyRepairs, detectBreaths, detectClicks, type MarginCandidate } from './clickBreath'
import { CONFIG } from './config'
import { decodeToMonoPcm, probe, writePcmAsWav } from './ffmpeg'
import { buildLoudnessFilter } from './loudness'
import { loadManifest, sequenceNameForFile } from './manifest'
import { buildAfftdnFilter, shouldDenoise } from './noise'
import { resolveSequence } from './sequences'
import { detectSegments } from './segment'
import { buildSegmentEntries, printConsoleTable, writeHtmlReport, writeJsonReport, type PipelineReport } from './report'

type Mode = 'analyze' | 'split' | 'process'

interface Args {
  files: string[]
  sequence?: string
  mode: Mode
  outDir?: string
}

function parseArgs(argv: string[]): Args {
  const fileIdx = argv.indexOf('--file')
  const sequenceIdx = argv.indexOf('--sequence')
  const outIdx = argv.indexOf('--out')
  const all = argv.includes('--all')
  const analyzeOnly = argv.includes('--analyze-only')
  const splitOnly = argv.includes('--split-only')

  if (!all && fileIdx === -1) {
    throw new Error('Pass --file <path> or --all. See scripts/voicePipeline/README.md.')
  }

  const mode: Mode = analyzeOnly ? 'analyze' : splitOnly ? 'split' : 'process'
  const files = all ? discoverManifestFiles() : [argv[fileIdx + 1]]

  return {
    files,
    sequence: sequenceIdx !== -1 ? argv[sequenceIdx + 1] : undefined,
    mode,
    outDir: outIdx !== -1 ? argv[outIdx + 1] : undefined,
  }
}

function discoverManifestFiles(): string[] {
  return Object.keys(loadManifest()).map((basename) => path.join('input', `${basename}.wav`))
}

async function runOne(inputPath: string, sequenceOverride: string | undefined, mode: Mode, outDirOverride: string | undefined): Promise<void> {
  const basename = path.basename(inputPath, path.extname(inputPath))
  const probed = await probe(inputPath)
  const samples = await decodeToMonoPcm(inputPath, probed.sampleRate)

  const { segments, floorDb } = detectSegments(samples, probed.sampleRate)
  const sequenceName = sequenceNameForFile(inputPath, sequenceOverride)
  const ids = resolveSequence(sequenceName)

  const candidatesBySegment: MarginCandidate[][] = segments.map((seg) => [
    ...detectClicks(samples, probed.sampleRate, seg),
    ...detectBreaths(samples, probed.sampleRate, seg, floorDb),
  ])

  const denoiseApplied = mode !== 'analyze' && shouldDenoise(floorDb)
  const countMismatch = ids.length !== segments.length

  const report: PipelineReport = {
    mode,
    inputFile: path.basename(inputPath),
    sampleRate: probed.sampleRate,
    channels: probed.channels,
    durationSec: probed.durationSec,
    floorDb,
    denoiseApplied,
    sequenceName,
    expectedCount: ids.length,
    detectedCount: segments.length,
    countMismatch,
    segments: buildSegmentEntries(segments, [...ids], probed.sampleRate, candidatesBySegment),
  }

  printConsoleTable(report)

  const outDir = outDirOverride ?? path.join('output', basename)
  const originalRelativePath = path.relative(outDir, inputPath).split(path.sep).join('/')
  writeJsonReport(report, outDir)
  writeHtmlReport(report, outDir, samples, { hasRaw: mode !== 'analyze', hasProcessed: mode === 'process', originalRelativePath })

  if (mode === 'analyze') return

  if (countMismatch) {
    console.error(`\n${basename}: segment count (${segments.length}) does not match sequence "${sequenceName}" length (${ids.length}).`)
    console.error(`No audio was written. Check ${path.join(outDir, 'report.html')}, adjust config.ts thresholds, or fix the recording.`)
    process.exitCode = 1
    return
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const id = ids[i]
    const rawSlice = samples.subarray(seg.startSample, seg.endSample)
    await writePcmAsWav(rawSlice, probed.sampleRate, path.join(outDir, 'raw', `${id}.wav`))
  }

  if (mode === 'split') return

  const loudnessFilter = denoiseApplied ? `${buildAfftdnFilter(floorDb)},${buildLoudnessFilter()}` : buildLoudnessFilter()
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const id = ids[i]
    const rawSlice = samples.subarray(seg.startSample, seg.endSample)
    const shiftedCandidates = candidatesBySegment[i].map((c) => ({
      ...c,
      startSample: c.startSample - seg.startSample,
      endSample: c.endSample - seg.startSample,
    }))
    const repaired = applyRepairs(rawSlice, shiftedCandidates)
    await writePcmAsWav(repaired, probed.sampleRate, path.join(outDir, 'processed', `${id}.wav`), {
      filter: loudnessFilter,
      outputSampleRateHz: CONFIG.loudness.outputSampleRateHz,
    })
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  for (const file of args.files) {
    await runOne(file, args.sequence, args.mode, args.outDir)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
