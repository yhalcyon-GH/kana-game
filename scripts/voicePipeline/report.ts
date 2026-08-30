// Human-facing output for every run mode. segments.json is the
// machine-readable form; report.html is what STEP 11 (human review) is
// meant to be checked against — a waveform with segment/margin markers,
// plus raw-vs-processed audio players so a mistake is audible, not just
// theoretical.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { formatTimestamp } from './pcm'
import type { MarginCandidate } from './clickBreath'
import type { Segment } from './segment'

export interface SegmentReportEntry {
  index: number
  id: string
  segment: Segment
  startTime: string
  endTime: string
  coreStartTime: string
  coreEndTime: string
  durationMs: number
  clickRepairs: number
  breathAttenuations: number
}

export interface PipelineReport {
  mode: 'analyze' | 'split' | 'process'
  inputFile: string
  sampleRate: number
  channels: number
  durationSec: number
  floorDb: number
  denoiseApplied: boolean
  sequenceName: string
  expectedCount: number
  detectedCount: number
  countMismatch: boolean
  segments: SegmentReportEntry[]
}

export function buildSegmentEntries(
  segments: Segment[],
  ids: string[],
  sampleRate: number,
  candidatesBySegment: MarginCandidate[][],
): SegmentReportEntry[] {
  return segments.map((segment, i) => {
    const candidates = candidatesBySegment[i] ?? []
    return {
      index: i,
      id: ids[i] ?? `unmatched-${i}`,
      segment,
      startTime: formatTimestamp(segment.startSample, sampleRate),
      endTime: formatTimestamp(segment.endSample, sampleRate),
      coreStartTime: formatTimestamp(segment.coreStartSample, sampleRate),
      coreEndTime: formatTimestamp(segment.coreEndSample, sampleRate),
      durationMs: Math.round(((segment.endSample - segment.startSample) / sampleRate) * 1000),
      clickRepairs: candidates.filter((c) => c.kind === 'click').length,
      breathAttenuations: candidates.filter((c) => c.kind === 'breath').length,
    }
  })
}

export function printConsoleTable(report: PipelineReport): void {
  console.log(`\n${report.inputFile} — ${report.sampleRate}Hz, ${report.channels}ch, ${report.durationSec.toFixed(2)}s`)
  console.log(`noise floor: ${report.floorDb.toFixed(1)} dBFS  |  denoise: ${report.denoiseApplied ? 'applied' : 'skipped (already quiet)'}`)
  console.log(`sequence: ${report.sequenceName}  (expected ${report.expectedCount}, detected ${report.detectedCount})`)
  if (report.countMismatch) {
    console.log(`\n!!! COUNT MISMATCH — refusing to write output. Check report.html and adjust config.ts thresholds. !!!\n`)
  }
  console.log('')
  report.segments.forEach((s) => {
    const idx = String(s.index + 1).padStart(2, '0')
    const label = s.id.padEnd(16, ' ')
    const clickNote = s.clickRepairs > 0 ? ` click x${s.clickRepairs}` : ''
    const breathNote = s.breathAttenuations > 0 ? ` breath x${s.breathAttenuations}` : ''
    console.log(`${idx}  ${label} ${s.startTime} - ${s.endTime}  (${s.durationMs}ms)${clickNote}${breathNote}`)
  })
}

export function writeJsonReport(report: PipelineReport, outDir: string): void {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'segments.json'), JSON.stringify(report, null, 2))
}

function buildWaveformSvg(samples: Int16Array, segments: Segment[], width: number, height: number): string {
  const buckets = width
  const bucketSize = Math.max(1, Math.floor(samples.length / buckets))
  const points: string[] = []
  for (let b = 0; b < buckets; b++) {
    const start = b * bucketSize
    const end = Math.min(samples.length, start + bucketSize)
    let peak = 0
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]))
    const norm = peak / 32768
    const y = height / 2 - (norm * height) / 2
    points.push(`${b},${y.toFixed(1)}`)
  }
  const topPath = points.join(' ')
  const bottomPath = points
    .map((p) => {
      const [x, y] = p.split(',')
      const yNum = Number(y)
      const mirrored = height - yNum
      return `${x},${mirrored.toFixed(1)}`
    })
    .reverse()
    .join(' ')

  const markers = segments
    .map((seg) => {
      const toX = (sample: number) => (sample / samples.length) * width
      const coreX1 = toX(seg.coreStartSample)
      const coreX2 = toX(seg.coreEndSample)
      const marginX1 = toX(seg.startSample)
      const marginX2 = toX(seg.endSample)
      return `
        <rect x="${marginX1.toFixed(1)}" y="0" width="${(marginX2 - marginX1).toFixed(1)}" height="${height}" fill="var(--margin)" />
        <rect x="${coreX1.toFixed(1)}" y="0" width="${(coreX2 - coreX1).toFixed(1)}" height="${height}" fill="var(--core)" />
      `
    })
    .join('')

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${markers}
    <polygon points="${topPath} ${bottomPath}" fill="var(--wave)" />
  </svg>`
}

export function writeHtmlReport(
  report: PipelineReport,
  outDir: string,
  samples: Int16Array,
  opts: { hasRaw: boolean; hasProcessed: boolean; originalRelativePath?: string },
): void {
  mkdirSync(outDir, { recursive: true })
  const svg = buildWaveformSvg(samples, report.segments.map((s) => s.segment), 1600, 160)

  const rows = report.segments
    .map((s) => {
      const rawSrc = opts.hasRaw ? `raw/${s.id}.wav` : ''
      const processedSrc = opts.hasProcessed ? `processed/${s.id}.wav` : ''
      const startSec = (s.segment.startSample / report.sampleRate).toFixed(3)
      const seekButton = opts.originalRelativePath ? `<button class="seek" data-t="${startSec}">▶ ${s.startTime}</button>` : `${s.startTime} – ${s.endTime}`
      return `<tr>
        <td>${s.index + 1}</td>
        <td>${s.id}</td>
        <td>${seekButton}</td>
        <td>${s.durationMs}ms</td>
        <td>${s.clickRepairs > 0 ? `click×${s.clickRepairs}` : ''} ${s.breathAttenuations > 0 ? `breath×${s.breathAttenuations}` : ''}</td>
        <td>${rawSrc ? `<audio controls src="${rawSrc}"></audio>` : ''}</td>
        <td>${processedSrc ? `<audio controls src="${processedSrc}"></audio>` : ''}</td>
      </tr>`
    })
    .join('\n')

  const player = opts.originalRelativePath
    ? `<audio id="player" controls src="${opts.originalRelativePath}" style="width:100%; margin-bottom: 8px;"></audio>
       <div class="hint">波形をクリックするとその位置から再生します。表の▶ボタンでも同じことができます。</div>`
    : ''

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>voice pipeline report — ${report.inputFile}</title>
<style>
  :root { --wave: #6b7280; --core: rgba(34,197,94,0.35); --margin: rgba(234,179,8,0.25); --bg: #0b0d10; --fg: #e5e7eb; --border: #2a2f36; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 24px; }
  h1 { font-size: 1.1rem; font-weight: 600; }
  .meta { color: #9ca3af; font-size: 0.85rem; margin-bottom: 16px; }
  .mismatch { background: #7f1d1d; color: #fecaca; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { border-bottom: 1px solid var(--border); padding: 6px 10px; text-align: left; }
  audio { height: 28px; width: 180px; }
  .legend span { display: inline-block; width: 12px; height: 12px; margin-right: 4px; vertical-align: middle; }
  .hint { color: #9ca3af; font-size: 0.8rem; margin-bottom: 12px; }
  #waveform { cursor: pointer; }
  button.seek { background: none; border: 1px solid var(--border); color: var(--fg); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 0.8rem; }
  button.seek:hover { background: #1f2937; }
</style>
</head>
<body>
  <h1>${report.inputFile}</h1>
  <div class="meta">
    ${report.sampleRate}Hz / ${report.channels}ch / ${report.durationSec.toFixed(2)}s —
    noise floor ${report.floorDb.toFixed(1)} dBFS (${report.denoiseApplied ? 'denoised' : 'not denoised'}) —
    sequence "${report.sequenceName}" (expected ${report.expectedCount}, detected ${report.detectedCount})
  </div>
  ${report.countMismatch ? `<div class="mismatch">COUNT MISMATCH — automatic output was NOT written. Adjust config.ts thresholds or check the recording.</div>` : ''}
  ${player}
  <div class="legend">
    <span style="background: var(--core)"></span> detected speech
    <span style="background: var(--margin)"></span> margin (pre/post)
  </div>
  <div id="waveform">${svg}</div>
  <table>
    <thead><tr><th>#</th><th>id</th><th>time</th><th>dur</th><th>touched</th><th>raw</th><th>processed</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>
    const player = document.getElementById('player');
    const totalDurationSec = ${report.durationSec};
    if (player) {
      const waveform = document.getElementById('waveform');
      waveform.addEventListener('click', (e) => {
        const rect = waveform.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        player.currentTime = frac * totalDurationSec;
        player.play();
      });
      document.querySelectorAll('button.seek').forEach((btn) => {
        btn.addEventListener('click', () => {
          player.currentTime = parseFloat(btn.dataset.t);
          player.play();
        });
      });
    }
  </script>
</body>
</html>`

  writeFileSync(path.join(outDir, 'report.html'), html)
}
