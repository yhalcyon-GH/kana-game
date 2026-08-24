import type { SpeechPlaybackOptions, SpeechProvider, SpeechRequest } from './types'

// Last-resort fallback using the browser's built-in Web Speech API — no
// pre-generated assets needed, but lower quality than the static clips this
// app ships normally. `voice` is set from outside (see hooks/useTTS.ts,
// which owns the React lifecycle for picking/updating it as the browser's
// voice list loads asynchronously) rather than picked internally, so this
// class has no React dependency of its own.
export class WebSpeechProvider implements SpeechProvider {
  voice: SpeechSynthesisVoice | null = null

  stop() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  speak(request: SpeechRequest, options: SpeechPlaybackOptions): Promise<void> {
    if (!('speechSynthesis' in window)) return Promise.reject(new Error('Web Speech API not supported'))
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(request.text)
    const lang = request.lang ?? 'ja-JP'
    utterance.lang = lang
    // Web Speech's volume caps natively at 1.0 (no gain-boost equivalent).
    utterance.volume = Math.min(1, options.volume)
    utterance.rate = options.rate
    // `this.voice` is always the picked JAPANESE voice (see pickJapaneseVoice
    // below) — assigning it for a non-Japanese request would override
    // `utterance.lang` with a Japanese accent, so only apply it for the
    // app's default Japanese narration and let the browser pick its own
    // default voice for any other language.
    if (this.voice && lang.startsWith('ja')) utterance.voice = this.voice
    window.speechSynthesis.speak(utterance)
    return Promise.resolve()
  }
}

// Prefers an OS-provided "Natural"/"Online" voice (e.g. Windows' neural
// voice pack) over the legacy desktop SAPI voices, which sound far more
// robotic — falls back to any Japanese voice at all, or null if none exist.
export function pickJapaneseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const japanese = voices.filter((v) => v.lang === 'ja-JP' || v.lang.startsWith('ja'))
  return japanese.find((v) => /natural|online/i.test(v.name)) ?? japanese[0] ?? null
}
