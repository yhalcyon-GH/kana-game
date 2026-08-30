// Speech-region detection. Deliberately NOT a plain silence-gap splitter:
// uses a relative (floor-adaptive) hysteresis threshold plus minimum
// sustain durations on both edges, so a brief energy dip inside one
// syllable (e.g. す's devoiced vowel) doesn't get mistaken for a boundary,
// and a single-frame spike doesn't get mistaken for speech onset. Margins
// are added AFTER core detection and are asymmetric (short before, long
// after) to protect vowel release/resonance tails — see config.ts.
import { CONFIG } from './config'
import { computeRmsEnvelope, msToSamples, percentile, toDbfs } from './pcm'

export interface CoreSegment {
  coreStartSample: number
  coreEndSample: number
}

export interface Segment extends CoreSegment {
  /** Final boundaries including pre/post margin, clamped against neighbors. */
  startSample: number
  endSample: number
}

export interface SegmentationResult {
  segments: Segment[]
  floorDb: number
  totalSamples: number
}

const MIN_DB = -90

export function detectSegments(samples: Int16Array, sampleRate: number): SegmentationResult {
  const cfg = CONFIG.segmentation
  const envelope = computeRmsEnvelope(samples, sampleRate, cfg.windowMs, cfg.hopMs)
  const windowSizeSamples = msToSamples(cfg.windowMs, sampleRate)
  const dbValues = envelope.map((f) => Math.max(MIN_DB, toDbfs(f.rms)))

  const floorDb = Math.max(MIN_DB, percentile(dbValues, cfg.floorPercentile))
  const enterThreshold = floorDb + cfg.enterThresholdDb
  const exitThreshold = floorDb + cfg.exitThresholdDb

  const hopMs = cfg.hopMs
  const minSpeechFrames = Math.max(1, Math.ceil(cfg.minSpeechMs / hopMs))
  const minSilenceFrames = Math.max(1, Math.ceil(cfg.minSilenceMs / hopMs))

  const sustainedAbove = (fromIdx: number, threshold: number, count: number): boolean => {
    const end = Math.min(dbValues.length, fromIdx + count)
    for (let i = fromIdx; i < end; i++) if (dbValues[i] <= threshold) return false
    return true
  }
  const sustainedBelow = (fromIdx: number, threshold: number, count: number): boolean => {
    const end = Math.min(dbValues.length, fromIdx + count)
    for (let i = fromIdx; i < end; i++) if (dbValues[i] >= threshold) return false
    return true
  }

  const coreSegments: CoreSegment[] = []
  let inSpeech = false
  let speechStartFrame = -1
  for (let i = 0; i < dbValues.length; i++) {
    if (!inSpeech) {
      if (dbValues[i] > enterThreshold && sustainedAbove(i, exitThreshold, minSpeechFrames)) {
        inSpeech = true
        speechStartFrame = i
      }
    } else if (dbValues[i] < exitThreshold && sustainedBelow(i, exitThreshold, minSilenceFrames)) {
      coreSegments.push({
        coreStartSample: envelope[speechStartFrame].startSample,
        coreEndSample: envelope[i].startSample + windowSizeSamples,
      })
      inSpeech = false
    }
  }
  if (inSpeech) {
    const lastFrame = dbValues.length - 1
    coreSegments.push({
      coreStartSample: envelope[speechStartFrame].startSample,
      coreEndSample: envelope[lastFrame].startSample + windowSizeSamples,
    })
  }

  const mergeGapSamples = msToSamples(cfg.mergeGapMs, sampleRate)
  const merged: CoreSegment[] = []
  for (const seg of coreSegments) {
    const prev = merged[merged.length - 1]
    if (prev && seg.coreStartSample - prev.coreEndSample < mergeGapSamples) {
      prev.coreEndSample = seg.coreEndSample
    } else {
      merged.push({ ...seg })
    }
  }

  const preMarginSamples = msToSamples(cfg.preMarginMs, sampleRate)
  const postMarginSamples = msToSamples(cfg.postMarginMs, sampleRate)
  const segments: Segment[] = merged.map((seg) => ({
    ...seg,
    startSample: Math.max(0, seg.coreStartSample - preMarginSamples),
    endSample: Math.min(samples.length, seg.coreEndSample + postMarginSamples),
  }))

  // Resolve any margin overlap between neighbors by clamping both to the
  // midpoint of the gap between their core regions — never let a margin
  // eat into the next segment's actual detected speech.
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]
    const cur = segments[i]
    if (cur.startSample < prev.endSample) {
      const midpoint = Math.floor((prev.coreEndSample + cur.coreStartSample) / 2)
      prev.endSample = Math.min(prev.endSample, midpoint)
      cur.startSample = Math.max(cur.startSample, midpoint)
    }
  }

  return { segments, floorDb, totalSamples: samples.length }
}
