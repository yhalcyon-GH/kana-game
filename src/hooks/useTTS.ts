import { useCallback, useEffect } from 'react'
import { StaticFileProvider } from '../audio/staticFileProvider'
import { pickJapaneseVoice, WebSpeechProvider } from '../audio/webSpeechProvider'
import { useProgressStore } from '../store/progressStore'

// Module-level singletons: every useTTS() consumer (CharacterCard, WordCard,
// LearnPage, the various Guides, etc.) shares ONE StaticFileProvider and ONE
// WebSpeechProvider for the whole app, instead of each hook instance creating
// its own via `useState(() => new X())`. StaticFileProvider lazily builds a
// single <audio>/AudioContext/GainNode chain on first use and reuses it for
// every subsequent clip (see its own comment) — but that only helps if there
// really is only one instance. With many cards on screen each previously
// getting its own provider, tapping enough different cards accumulated one
// real browser audio graph per card ever tapped. Sharing one instance across
// the app means there is always exactly one graph, no matter how many cards
// exist or have been tapped.
const staticProvider = new StaticFileProvider()
const webSpeechProvider = new WebSpeechProvider()

// The voiceschanged listener only needs to be registered once for the shared
// webSpeechProvider, not once per component. Guarded at module scope (rather
// than via a ref-counted subscribe/unsubscribe) so it's naturally safe against
// StrictMode's double-invoke of effects and repeated test mount/unmount: the
// listener itself is idempotent to re-add, but there's no reason to.
let voiceListenerRegistered = false
function ensureVoiceListener() {
  if (voiceListenerRegistered) return
  if (!('speechSynthesis' in window)) return
  voiceListenerRegistered = true
  const updateVoice = () => {
    webSpeechProvider.voice = pickJapaneseVoice(window.speechSynthesis.getVoices())
  }
  updateVoice()
  window.speechSynthesis.addEventListener('voiceschanged', updateVoice)
}

// The one place game code touches audio. Speaks in terms of a content key +
// fallback text (see audio/types.ts's SpeechRequest) — never a specific
// voice, vendor, or file format. Tries the static-file provider first (see
// scripts/generateAudioElevenLabs.ts for how those clips are produced —
// currently two dedicated ElevenLabs voices, one for character/word
// narration and a separate one for Tamamizu's in-game reactions) and falls
// back to the browser's Web Speech API only if a clip is missing or fails
// to play. Swapping the primary provider for a different TTS vendor or a
// live-synthesis backend means adding/changing a SpeechProvider — nothing
// in src/routes or src/components needs to change, since they only ever
// call `speak(key, fallbackText)`.
//
// The Settings speed slider is deliberately kept to a gentle 0.75x-1.5x
// range (see SettingsPage.tsx) rather than stretching a single clip much
// further: playback keeps preservesPitch on (the browser's pitch-correcting
// phase vocoder) so speed changes don't also shift pitch, and that
// correction only stays clean within a modest stretch — pushed further it
// smears consonant onsets when slowed and turns shrill when sped up.
export function useTTS() {
  const audioEnabled = useProgressStore((s) => s.audioEnabled)
  const audioVolume = useProgressStore((s) => s.audioVolume)
  const audioSpeed = useProgressStore((s) => s.audioSpeed)
  const mascotVoiceEnabled = useProgressStore((s) => s.mascotVoiceEnabled)
  const mascotVoiceVolume = useProgressStore((s) => s.mascotVoiceVolume)

  useEffect(() => {
    ensureVoiceListener()
  }, [])

  // audioKey identifies a pre-generated clip, e.g. "characters/a" or
  // "words/a-ai" (matching the folders scripts/generateAudioElevenLabs.ts
  // writes to). fallbackText is only used if that clip can't be played.
  const speak = useCallback(
    (audioKey: string, fallbackText: string, lang?: string) => {
      if (!audioEnabled) return
      const isFeedback = audioKey.startsWith('feedback/')
      if (isFeedback && !mascotVoiceEnabled) return
      const request = { key: audioKey, text: fallbackText, lang }
      const options = { volume: isFeedback ? mascotVoiceVolume : audioVolume, rate: audioSpeed }
      staticProvider.speak(request, options).catch(() => {
        webSpeechProvider.speak(request, options).catch(() => {})
      })
    },
    [audioEnabled, audioVolume, audioSpeed, mascotVoiceEnabled, mascotVoiceVolume],
  )

  // Static-only variant for contexts (e.g. the Intro Guide) where falling
  // back to a different voice reading the text would be jarring/wrong —
  // e.g. Tamamizu's narration must never be replaced by a generic Web
  // Speech voice. Resolves true if playback started, false otherwise
  // (clip missing, or blocked by the browser's autoplay policy); callers
  // are expected to surface their own retry UI on false rather than
  // falling back to Web Speech.
  const speakStaticOnly = useCallback(
    (audioKey: string, fallbackText: string, lang?: string) => {
      if (!audioEnabled) return Promise.resolve(false)
      const request = { key: audioKey, text: fallbackText, lang }
      const options = { volume: audioVolume, rate: audioSpeed }
      return staticProvider
        .speak(request, options)
        .then(() => true)
        .catch(() => false)
    },
    [audioEnabled, audioVolume, audioSpeed],
  )

  const stop = useCallback(() => {
    staticProvider.stop()
    webSpeechProvider.stop()
  }, [])

  return { speak, speakStaticOnly, stop, supported: true }
}
