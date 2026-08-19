// Stationary background noise (AC hum, PC fan) — conditional only. Reuses
// the same floor estimate segment.ts already computed rather than measuring
// twice. Deliberately does NOT touch anything if the recording is already
// quiet (see config.ts's floorThresholdDbfs) — "don't process what doesn't
// need it" per the project brief.
import { CONFIG } from './config'

export function shouldDenoise(floorDb: number): boolean {
  return floorDb > CONFIG.environmentNoise.floorThresholdDbfs
}

// ffmpeg's afftdn filter: nr = reduction amount (dB), nf = assumed noise
// floor (dB). Clamped to afftdn's accepted ranges (nr: 0.01-97, nf: -80..-20).
export function buildAfftdnFilter(floorDb: number): string {
  const nf = Math.min(-20, Math.max(-80, Math.round(floorDb)))
  const nr = CONFIG.environmentNoise.reductionDb
  return `afftdn=nr=${nr}:nf=${nf}`
}
