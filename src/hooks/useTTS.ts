import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgressStore } from '../store/progressStore'

const VOICEVOX_BASE_URL = 'http://localhost:50021'
const VOICEVOX_SPEAKER_ID = 3 // ずんだもん・ノーマル

async function synthesizeWithVoicevox(text: string, signal: AbortSignal): Promise<Blob> {
  const queryRes = await fetch(
    `${VOICEVOX_BASE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${VOICEVOX_SPEAKER_ID}`,
    { method: 'POST', signal },
  )
  if (!queryRes.ok) throw new Error(`audio_query failed: ${queryRes.status}`)
  const query = await queryRes.json()

  const synthesisRes = await fetch(`${VOICEVOX_BASE_URL}/synthesis?speaker=${VOICEVOX_SPEAKER_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    signal,
  })
  if (!synthesisRes.ok) throw new Error(`synthesis failed: ${synthesisRes.status}`)
  return synthesisRes.blob()
}

// Prefers a local VOICEVOX engine (ずんだもん) for playback when it's
// reachable, since it sounds far more natural/characterful than any OS TTS
// voice. Falls back to the Web Speech API — either because VOICEVOX isn't
// running, or a synthesis call fails — so the app still works with just a
// browser and no extra software installed.
export function useTTS() {
  const audioEnabled = useProgressStore((s) => s.audioEnabled)
  const [webSpeechSupported, setWebSpeechSupported] = useState(false)
  const [voicevoxAvailable, setVoicevoxAvailable] = useState(false)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${VOICEVOX_BASE_URL}/version`, { signal: controller.signal })
      .then((res) => setVoicevoxAvailable(res.ok))
      .catch(() => setVoicevoxAvailable(false))
    return () => controller.abort()
  }, [])

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
      if (voiceRef.current) utterance.voice = voiceRef.current
      window.speechSynthesis.speak(utterance)
    },
    [webSpeechSupported],
  )

  const speak = useCallback(
    (text: string) => {
      if (!audioEnabled) return

      if (voicevoxAvailable) {
        const controller = new AbortController()
        synthesizeWithVoicevox(text, controller.signal)
          .then((blob) => {
            const url = URL.createObjectURL(blob)
            if (!audioElRef.current) audioElRef.current = new Audio()
            const audioEl = audioElRef.current
            audioEl.onended = () => URL.revokeObjectURL(url)
            audioEl.src = url
            void audioEl.play()
          })
          .catch(() => speakWithWebSpeech(text))
        return
      }

      speakWithWebSpeech(text)
    },
    [audioEnabled, voicevoxAvailable, speakWithWebSpeech],
  )

  return { speak, supported: webSpeechSupported || voicevoxAvailable }
}
