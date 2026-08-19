// Final loudness stage: FFmpeg's loudnorm (EBU R128) + a safety limiter.
// Single-pass, same as scripts/normalizeAudioVolume.mjs already uses for
// the shipped catalog — matching that convention (rather than switching to
// two-pass loudnorm) keeps every clip's processing consistent and is
// accurate enough for short isolated syllable/word clips.
import { CONFIG } from './config'

export function buildLoudnessFilter(): string {
  const { integratedLufs, truePeakDb, loudnessRangeLu, limiterCeiling } = CONFIG.loudness
  return `loudnorm=I=${integratedLufs}:TP=${truePeakDb}:LRA=${loudnessRangeLu},alimiter=limit=${limiterCeiling}`
}
