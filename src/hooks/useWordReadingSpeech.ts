import { useEffect, useRef, useState } from 'react'
import type { AnchorWord } from '../data/types'
import { checkWordReadingAlternatives, type WordReadingCheckResult } from '../lib/wordReadingMatching'

// Speech-recognition state machine for the new Word Reading assessment
// family (Issue #189's Family 4) — deliberately a smaller, standalone
// cousin of hooks/useOrderingGame.ts's Restaurant/Cafe speech handling, NOT
// a reuse of that hook directly: useOrderingGame owns a whole session's
// worth of menu/round/order state that Word Reading has no equivalent of
// (a single word target per question, no menu, no "order" concept). What
// IS reused is the same recovery philosophy the issue calls for — speech
// attempt -> retry/Romaji fallback -> final answer evaluation, with a
// speech-recognition FAILURE never itself counting as a final wrong answer
// — and the same vendor-prefixed SpeechRecognition detection approach.
//
// See useOrderingGame.ts's identical ambient SpeechRecognition typing
// comment for why this is hand-typed rather than pulled from the DOM lib.
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

// Indirected through a helper (mirrors useOrderingGame.ts's identical
// abortRecognition/invalidateSequence pattern) rather than accessing
// `ref.current` directly inside the effect cleanup below — same rationale:
// avoids the exhaustive-deps lint warning about a ref's value having
// possibly changed by cleanup time, which doesn't apply here since this
// only ever runs on unmount.
function abortRecognition(ref: { current: SpeechRecognitionLike | null }) {
  ref.current?.abort()
  ref.current = null
}

function invalidateToken(ref: { current: number }) {
  ref.current++
}

export type WordReadingState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'result'; result: WordReadingCheckResult; transcript: string | null }

// One round's worth of speech-attempt state for a single target word.
// `reset()` must be called by the caller whenever the target word changes
// (a new question) — this hook has no knowledge of the question queue.
export function useWordReadingSpeech(target: AnchorWord | undefined) {
  const [state, setState] = useState<WordReadingState>({ kind: 'idle' })
  const [speechSupported, setSpeechSupported] = useState(false)
  const [retryUsed, setRetryUsed] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null)
  }, [])

  useEffect(() => {
    return () => {
      invalidateToken(tokenRef)
      abortRecognition(recognitionRef)
    }
  }, [])

  function reset() {
    tokenRef.current++
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setState({ kind: 'idle' })
    setRetryUsed(false)
  }

  function startListening() {
    if (!target) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setSpeechSupported(false)
      return
    }
    tokenRef.current++
    recognitionRef.current?.abort()
    const token = tokenRef.current
    let settled = false
    const settle = (callback: () => void) => {
      if (settled || token !== tokenRef.current) return
      settled = true
      callback()
    }
    setState({ kind: 'listening' })
    const recognition = new Ctor()
    recognitionRef.current = recognition
    recognition.lang = 'ja-JP'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3
    recognition.onresult = (event) => {
      if (settled || token !== tokenRef.current || !event.results || !event.results[0]) return
      const result = event.results[0]
      const alternatives: string[] = []
      const resultLength = Number.isInteger(result.length) && result.length > 0 ? result.length : 0
      for (let i = 0; i < resultLength; i++) {
        const transcript = result[i]?.transcript
        if (typeof transcript === 'string' && transcript.trim()) alternatives.push(transcript)
      }
      const check = checkWordReadingAlternatives(alternatives, target)
      settle(() => setState({ kind: 'result', result: check, transcript: alternatives[0] ?? null }))
    }
    recognition.onerror = () => {
      settle(() => setState({ kind: 'result', result: { outcome: 'unrecognized' }, transcript: null }))
    }
    recognition.onend = () => {
      settle(() => setState({ kind: 'result', result: { outcome: 'unrecognized' }, transcript: null }))
    }
    try {
      recognition.start()
    } catch {
      settle(() => setState({ kind: 'result', result: { outcome: 'unrecognized' }, transcript: null }))
    }
  }

  // Speech recognition failing (unrecognized) is NOT itself a final wrong
  // answer — the caller offers Try Again (once, via this) or Romaji
  // fallback before any final evaluation, matching Restaurant/Cafe's
  // recovery philosophy (see this hook's top comment).
  function tryAgain() {
    if (retryUsed) return
    setRetryUsed(true)
    startListening()
  }

  return { state, speechSupported, retryUsed, startListening, tryAgain, reset }
}
