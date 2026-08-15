// Score thresholds and ASR/regeneration knobs for scripts/checkVoiceQuality.ts.
// Kept out of the comparison logic itself (src/lib/voiceQuality.ts) so they
// can be retuned without touching scoring code — see
// docs/2026-08-15-voice-quality-check-design.md's "PASS / WARNING / FAIL"
// section for why these aren't hardcoded.
import type { VoiceCheckThresholds } from '../src/lib/voiceQuality'

export const DEFAULT_THRESHOLDS: VoiceCheckThresholds = {
  passScore: 90,
  warningScore: 70,
}

// 'medium' balances Japanese accuracy against local download size/CPU time.
// Bump to 'large-v3' if WARNING volume turns out too high in practice.
export const WHISPER_MODEL = 'medium'

export const MAX_REGENERATE_ATTEMPTS = 3
