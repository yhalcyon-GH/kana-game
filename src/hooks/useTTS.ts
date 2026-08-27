import { useCallback, useEffect, useState } from 'react'
import { StaticFileProvider } from '../audio/staticFileProvider'
import { pickJapaneseVoice, WebSpeechProvider } from '../audio/webSpeechProvider'
import { useProgressStore } from '../store/progressStore'

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

  const [staticProvider] = useState(() => new StaticFileProvider())
  const [webSpeechProvider] = useState(() => new WebSpeechProvider())

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const updateVoice = () => {
      webSpeechProvider.voice = pickJapaneseVoice(window.speechSynthesis.getVoices())
    }
    updateVoice()
    window.speechSynthesis.addEventListener('voiceschanged', updateVoice)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoice)
  }, [webSpeechProvider])

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
    [audioEnabled, audioVolume, audioSpeed, mascotVoiceEnabled, mascotVoiceVolume, staticProvider, webSpeechProvider],
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
    [audioEnabled, audioVolume, audioSpeed, staticProvider],
  )

  const stop = useCallback(() => {
    staticProvider.stop()
    webSpeechProvider.stop()
  }, [staticProvider, webSpeechProvider])

  return { speak, speakStaticOnly, stop, supported: true }
}
