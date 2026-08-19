// Small, framework-free helpers for working with raw mono 16-bit PCM. Kept
// dependency-free deliberately (see README.md) — this is simple enough that
// pulling in a DSP library would be more risk (license/maintenance) than
// benefit.
const INT16_MAX = 32768

export function toDbfs(linear: number): number {
  if (linear <= 0) return -Infinity
  return 20 * Math.log10(linear)
}

export function fromDbfs(db: number): number {
  return 10 ** (db / 20)
}

export interface EnvelopeFrame {
  /** Sample index at the start of this window. */
  startSample: number
  /** RMS amplitude, linear 0..1 scale relative to int16 full-scale. */
  rms: number
}

export function computeRmsEnvelope(samples: Int16Array, sampleRate: number, windowMs: number, hopMs: number): EnvelopeFrame[] {
  const windowSize = Math.max(1, Math.round((windowMs / 1000) * sampleRate))
  const hopSize = Math.max(1, Math.round((hopMs / 1000) * sampleRate))
  const frames: EnvelopeFrame[] = []
  for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
    let sumSquares = 0
    for (let i = start; i < start + windowSize; i++) {
      const v = samples[i] / INT16_MAX
      sumSquares += v * v
    }
    frames.push({ startSample: start, rms: Math.sqrt(sumSquares / windowSize) })
  }
  return frames
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[idx]
}

export function msToSamples(ms: number, sampleRate: number): number {
  return Math.round((ms / 1000) * sampleRate)
}

export function samplesToMs(samples: number, sampleRate: number): number {
  return (samples / sampleRate) * 1000
}

export function formatTimestamp(samples: number, sampleRate: number): string {
  const totalMs = Math.round(samplesToMs(samples, sampleRate))
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}
