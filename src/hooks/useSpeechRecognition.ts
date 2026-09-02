import { useEffect, useRef, useState } from 'react'

// Generic browser SpeechRecognition wrapper, extracted from
// useOrderingGame.ts's inline Restaurant/Cafe implementation (Issue #189)
// but decoupled from RestaurantDish/menu concepts, so the Word Reading
// assessment question can reuse the same speech-recognition PLUMBING
// (support detection, one-shot listen, up-to-3 alternatives, treating any
// infra failure as "no alternatives" rather than throwing) without pulling
// in Restaurant/Cafe's menu/order state machine. useOrderingGame.ts itself
// is left untouched — this is a fresh, bounded helper, not a refactor of
// existing game pages.

type SpeechRecognitionAlternative = { transcript: string }
type SpeechRecognitionResultLike = { [index: number]: SpeechRecognitionAlternative; length: number }
type SpeechRecognitionEventLike = { results: { [index: number]: SpeechRecognitionResultLike; length: number } }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Extracted into its own function (rather than accessed inline in the
// effect cleanup below) purely so the ref access isn't a direct `.current`
// read inside the cleanup closure — same shape as useOrderingGame.ts's
// abortRecognition helper.
function abortRecognition(ref: { current: SpeechRecognitionLike | null }) {
  ref.current?.abort()
  ref.current = null
}

function invalidateSequence(ref: { current: number }) {
  ref.current++
}

export function useSpeechRecognition() {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null)
    return () => {
      invalidateSequence(tokenRef)
      abortRecognition(recognitionRef)
    }
  }, [])

  // Listens once and resolves with up to 3 transcript alternatives (best
  // first) — resolves to an empty array on ANY infra failure (unsupported
  // browser, recognition error, no match, or start() throwing), never
  // rejects. The caller alone decides how to treat an empty result (Issue
  // #189: "speech-recognition infrastructure failure / no-match must not
  // automatically count as a knowledge error") — this hook has no opinion on
  // scoring.
  function listen(): Promise<string[]> {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setSupported(false)
      return Promise.resolve([])
    }
    tokenRef.current++
    recognitionRef.current?.abort()
    const token = tokenRef.current
    setListening(true)
    return new Promise((resolve) => {
      let settled = false
      const settle = (alternatives: string[]) => {
        if (settled || token !== tokenRef.current) return
        settled = true
        setListening(false)
        resolve(alternatives)
      }
      const recognition = new Ctor()
      recognitionRef.current = recognition
      recognition.lang = 'ja-JP'
      recognition.continuous = false
      recognition.interimResults = false
      recognition.maxAlternatives = 3
      recognition.onresult = (event) => {
        if (!event.results || !event.results[0]) {
          settle([])
          return
        }
        const result = event.results[0]
        const alternatives: string[] = []
        const resultLength = Number.isInteger(result.length) && result.length > 0 ? result.length : 0
        for (let i = 0; i < resultLength; i++) {
          const transcript = result[i]?.transcript
          if (typeof transcript === 'string' && transcript.trim()) alternatives.push(transcript)
        }
        settle(alternatives)
      }
      recognition.onerror = () => settle([])
      recognition.onend = () => settle([])
      try {
        recognition.start()
      } catch {
        settle([])
      }
    })
  }

  return { supported, listening, listen }
}
