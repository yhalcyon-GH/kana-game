import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgressStore } from '../store/progressStore'

// Plays pre-generated audio shipped as static files under public/audio/ (see
// scripts/generateAudioElevenLabs.ts for character/word clips — voiced by a
// dedicated ElevenLabs narrator, distinct from the ElevenLabs voice used for
// Tamamizu's in-game reaction lines) — every clip is baked in ahead of time,
// so playback works for any visitor with just a browser, no TTS engine
// needed at runtime. Falls back to the Web Speech API only if a clip is
// missing or fails to play.
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
  const [webSpeechSupported, setWebSpeechSupported] = useState(false)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setWebSpeechSupported(false)
      return
    }
    setWebSpeechSupported(true)

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      const japanese = voices.filter((v) => v.lang === 'ja-JP' || v.lang.startsWith('ja'))
      // OS-provided "Natural"/"Online" voices (e.g. Windows' neural voice
      // pack) sound far less robotic than the legacy desktop SAPI voices —
      // prefer one of those when installed, otherwise fall back to any
      // Japanese voice at all.
      voiceRef.current =
        japanese.find((v) => /natural|online/i.test(v.name)) ?? japanese[0] ?? null
    }
    pickVoice()
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickVoice)
  }, [])

  const speakWithWebSpeech = useCallback(
    (text: string) => {
      if (!webSpeechSupported) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'ja-JP'
      utterance.volume = audioVolume
      utterance.rate = audioSpeed
      if (voiceRef.current) utterance.voice = voiceRef.current
      window.speechSynthesis.speak(utterance)
    },
    [webSpeechSupported, audioVolume, audioSpeed],
  )

  // audioKey identifies a pre-generated clip, e.g. "characters/a" or
  // "words/a-ai" (matching the folders scripts/generateAudio.ts writes to).
  // fallbackText is only used if that clip can't be played.
  const speak = useCallback(
    (audioKey: string, fallbackText: string) => {
      if (!audioEnabled) return

      if (!audioElRef.current) audioElRef.current = new Audio()
      const audioEl = audioElRef.current
      audioEl.onerror = () => speakWithWebSpeech(fallbackText)
      audioEl.src = `${import.meta.env.BASE_URL}audio/${audioKey}.wav`
      // Setting these after assigning `src` (which triggers an implicit
      // load) is the order that reliably sticks across browsers — setting
      // them first can get silently reset by the load.
      audioEl.volume = audioVolume
      audioEl.defaultPlaybackRate = audioSpeed
      audioEl.playbackRate = audioSpeed
      audioEl.preservesPitch = true
      audioEl.play().catch(() => speakWithWebSpeech(fallbackText))
    },
    [audioEnabled, audioVolume, audioSpeed, speakWithWebSpeech],
  )

  return { speak, supported: true }
}
