// Click and breath handling — restricted ENTIRELY to the pre/post margin
// ranges around a detected core segment (see segment.ts). The core speech
// region itself is never touched here, which is what makes this safe to
// run by default: even a false-positive detection can only ever affect
// padding that would otherwise just be silence/room tone, never a consonant
// or vowel attack.
import { CONFIG } from './config'
import { computeRmsEnvelope, msToSamples, samplesToMs, toDbfs } from './pcm'
import type { Segment } from './segment'

export interface ClickCandidate {
  kind: 'click'
  startSample: number
  endSample: number
}

export interface BreathCandidate {
  kind: 'breath'
  startSample: number
  endSample: number
}

export type MarginCandidate = ClickCandidate | BreathCandidate

function marginRanges(seg: Segment): Array<[number, number]> {
  return [
    [seg.startSample, seg.coreStartSample],
    [seg.coreEndSample, seg.endSample],
  ]
}

export function detectClicks(samples: Int16Array, sampleRate: number, seg: Segment): ClickCandidate[] {
  const cfg = CONFIG.clickRepair
  if (!cfg.enabled) return []
  const windowSamples = Math.max(4, msToSamples(2, sampleRate))
  const step = Math.max(1, Math.floor(windowSamples / 2))
  const candidates: ClickCandidate[] = []

  for (const [rangeStart, rangeEnd] of marginRanges(seg)) {
    if (rangeEnd - rangeStart < windowSamples * 2) continue
    const peaks: Array<{ startSample: number; peak: number }> = []
    for (let s = rangeStart; s + windowSamples <= rangeEnd; s += step) {
      let peak = 0
      for (let i = s; i < s + windowSamples; i++) peak = Math.max(peak, Math.abs(samples[i]))
      peaks.push({ startSample: s, peak: peak / 32768 })
    }
    if (peaks.length === 0) continue
    const sortedPeaks = [...peaks.map((p) => p.peak)].sort((a, b) => a - b)
    const baseline = Math.max(sortedPeaks[Math.floor(sortedPeaks.length / 2)], 1 / 32768)
    const thresholdLinear = baseline * 10 ** (cfg.minProminenceDb / 20)

    let runStart = -1
    for (let i = 0; i <= peaks.length; i++) {
      const over = i < peaks.length && peaks[i].peak > thresholdLinear
      if (over && runStart === -1) {
        runStart = i
      } else if (!over && runStart !== -1) {
        const startSample = peaks[runStart].startSample
        const endSample = peaks[i - 1].startSample + windowSamples
        if (samplesToMs(endSample - startSample, sampleRate) <= cfg.maxDurationMs) {
          candidates.push({ kind: 'click', startSample, endSample })
        }
        runStart = -1
      }
    }
  }
  return candidates
}

export function detectBreaths(samples: Int16Array, sampleRate: number, seg: Segment, floorDb: number): BreathCandidate[] {
  const cfg = CONFIG.breathAttenuation
  if (!cfg.enabled) return []
  const candidates: BreathCandidate[] = []
  const breathLowDb = floorDb + 3
  const breathHighDb = floorDb + CONFIG.segmentation.enterThresholdDb - 2

  for (const [rangeStart, rangeEnd] of marginRanges(seg)) {
    if (rangeEnd - rangeStart < msToSamples(cfg.minDurationMs, sampleRate)) continue
    const rangeSamples = samples.subarray(rangeStart, rangeEnd)
    const envelope = computeRmsEnvelope(rangeSamples, sampleRate, 10, 5)
    let runStart = -1
    for (let i = 0; i <= envelope.length; i++) {
      const db = i < envelope.length ? toDbfs(envelope[i].rms) : -Infinity
      const inBand = db > breathLowDb && db < breathHighDb
      if (inBand && runStart === -1) {
        runStart = i
      } else if (!inBand && runStart !== -1) {
        const startSample = rangeStart + envelope[runStart].startSample
        const endSample = rangeStart + (i < envelope.length ? envelope[i].startSample : rangeSamples.length)
        const durationMs = samplesToMs(endSample - startSample, sampleRate)
        if (durationMs >= cfg.minDurationMs && durationMs <= cfg.maxDurationMs) {
          candidates.push({ kind: 'breath', startSample, endSample })
        }
        runStart = -1
      }
    }
  }
  return candidates
}

// Returns a NEW Int16Array with the given candidates repaired — never
// mutates the input, so callers can always fall back to the untouched
// buffer (e.g. for the raw/ export).
export function applyRepairs(samples: Int16Array, candidates: MarginCandidate[]): Int16Array {
  const out = Int16Array.from(samples)
  for (const c of candidates) {
    if (c.kind === 'click') repairClick(out, c.startSample, c.endSample)
    else attenuateBreath(out, c.startSample, c.endSample)
  }
  return out
}

function repairClick(samples: Int16Array, start: number, end: number): void {
  const before = samples[Math.max(0, start - 1)]
  const after = samples[Math.min(samples.length - 1, end)]
  const span = end - start
  for (let i = 0; i < span; i++) {
    const t = span <= 1 ? 0 : i / (span - 1)
    // Cosine crossfade for a smooth bridge rather than a linear ramp.
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * t)
    samples[start + i] = Math.round(before + (after - before) * eased)
  }
}

function attenuateBreath(samples: Int16Array, start: number, end: number): void {
  const fadeSamples = Math.min(Math.floor((end - start) / 4), 200)
  const gain = 10 ** (-CONFIG.breathAttenuation.attenuationDb / 20)
  for (let i = start; i < end; i++) {
    const distFromEdge = Math.min(i - start, end - 1 - i)
    const fadeT = fadeSamples > 0 ? Math.min(1, distFromEdge / fadeSamples) : 1
    const appliedGain = 1 - fadeT * (1 - gain)
    samples[i] = Math.round(samples[i] * appliedGain)
  }
}
