import { useEffect, useRef, useState } from 'react'
import type { RestaurantDish } from '../data/restaurantDishes'
import { useTTS } from './useTTS'
import { pickIncorrectFeedback, pickResultFeedback } from '../lib/feedbackVoice'
import { menuKey, pickCappedTarget, pickRoundFromPools, shuffleRestaurantChoices, type RestaurantRound } from '../lib/restaurantRound'
import { checkMultipleDishOrderAlternatives, checkOrderAlternatives, type OrderCheckResult } from '../lib/restaurantMatching'

// Shared "order the target dish(es) from a 4-item menu" state machine behind
// both Restaurant (routes/games/RestaurantPage.tsx) and Cafe
// (routes/games/CafePage.tsx). The two mini-games differ only in
// presentation (Cafe hides the dish image/English before an answer, and
// never repeats the English translation under romaji in the feedback row —
// see each page's own render code) — every rule below (8 questions, Q5-8
// two-item rounds, one speech retry, Romaji rescue, mistake/reveal
// semantics, shared Tamamizu feedback voice lines) is identical for both,
// so this hook exists to avoid a second, silently-diverging copy of that
// logic rather than to build a general game framework. Neither game reads
// or writes curriculum/Review/SRS/Recommended-Path state — see
// restaurantDishes.ts's top comment for why that isolation matters.

// Minimal ambient typing for the (still-experimental, vendor-prefixed) Web
// Speech API — not present in the TS DOM lib. Deliberately only the surface
// this hook actually uses.
type SpeechRecognitionAlternative = { transcript: string }
type SpeechRecognitionResultLike = { [index: number]: SpeechRecognitionAlternative; length: number }
type SpeechRecognitionEventLike = { results: { [index: number]: SpeechRecognitionResultLike; length: number } }
type SpeechRecognitionErrorEventLike = { error: string }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function abortRecognition(ref: { current: SpeechRecognitionLike | null }) {
  ref.current?.abort()
  ref.current = null
}

function invalidateSequence(ref: { current: number }) {
  ref.current++
}

export type OrderingResultState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'result'; source: 'speech' | 'romaji'; transcript: string | null; check: OrderCheckResult; revealed?: boolean }

export type OrderingSessionResult = { dishes: RestaurantDish[]; correct: boolean }

export type UseOrderingGameOptions = {
  dishes: RestaurantDish[]
  menuDishes: RestaurantDish[]
  greetingAudioKey: string
  greetingText: string
  successAudioKey: string
  successText: string
}

export function useOrderingGame({ dishes, menuDishes, greetingAudioKey, greetingText, successAudioKey, successText }: UseOrderingGameOptions) {
  const { speak, speakAndWait, stop } = useTTS()
  const sequenceIdRef = useRef(0)
  const [round, setRound] = useState<RestaurantRound>(() => pickRoundFromPools(dishes, menuDishes))
  const [targets, setTargets] = useState<RestaurantDish[]>([round.target])
  const [romajiChoices, setRomajiChoices] = useState<RestaurantDish[]>(() => shuffleRestaurantChoices(round.menu))
  const [state, setState] = useState<OrderingResultState>({ kind: 'idle' })
  const [questionNumber, setQuestionNumber] = useState(1)
  const [sessionResults, setSessionResults] = useState<OrderingSessionResult[]>([])
  const [completed, setCompleted] = useState(false)
  const [started, setStarted] = useState(false)
  const greetedIntroRef = useRef(false)
  const [showRomaji, setShowRomaji] = useState(false)
  const [isRomajiRescue, setIsRomajiRescue] = useState(false)
  const [selectedRomaji, setSelectedRomaji] = useState<RestaurantDish[]>([])
  const usedTargetIdsRef = useRef<string[]>([round.target.id])
  const usedPairKeysRef = useRef<string[]>([])
  const lastMenuKeyRef = useRef(menuKey(round.menu))
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recognitionTokenRef = useRef(0)
  const speechRetryUsedRef = useRef(false)
  const [speechRetryUsed, setSpeechRetryUsed] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  // Shared Practice incorrect-reaction pool/picker (lib/feedbackVoice.ts) —
  // reused as-is rather than a per-game pool. Tracked so the same line never
  // repeats back-to-back, same rule as normal Practice.
  const lastWrongFeedbackIdRef = useRef<string | null>(null)
  // Guards the shared end-of-session Tamamizu result line (pickResultFeedback)
  // so it plays exactly once per completed session, even across StrictMode's
  // double-invoked effects or an unrelated re-render while `completed` is true.
  const resultAnnouncedRef = useRef(false)

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null)
  }, [speak])

  useEffect(() => {
    if (!started && !greetedIntroRef.current) {
      speak(greetingAudioKey, greetingText)
      greetedIntroRef.current = true
    }
    if (started) greetedIntroRef.current = false
  }, [started, speak, greetingAudioKey, greetingText])

  useEffect(() => {
    return () => {
      invalidateSequence(recognitionTokenRef)
      abortRecognition(recognitionRef)
      invalidateSequence(sequenceIdRef)
      stop()
    }
  }, [stop])

  // Same shared end-of-session Tamamizu voice line Practice's results screen
  // uses (lib/feedbackVoice.ts's pickResultFeedback, judged on accuracy out
  // of 8 questions).
  useEffect(() => {
    if (!completed || resultAnnouncedRef.current) return
    resultAnnouncedRef.current = true
    const correctCount = sessionResults.filter((result) => result.correct).length
    const { id, text } = pickResultFeedback(correctCount, 8)
    speak(`feedback/${id}`, text)
  }, [completed, sessionResults, speak])

  function finalizeQuestion(correct: boolean) {
    setSessionResults((previous) => {
      const index = questionNumber - 1
      if (previous[index]) return previous
      const next = [...previous]
      next[index] = { dishes: targets, correct }
      return next
    })
  }

  function finalizeWrong() {
    finalizeQuestion(false)
    const { id, text } = pickIncorrectFeedback(lastWrongFeedbackIdRef.current)
    lastWrongFeedbackIdRef.current = id
    speak(`feedback/${id}`, text)
  }

  function evaluate(source: 'speech' | 'romaji', transcript: string | null, check: OrderCheckResult) {
    if (check.outcome === 'success') {
      setState({ kind: 'result', source, transcript, check, revealed: false })
      finalizeQuestion(true)
      speak(successAudioKey, successText)
    } else if (source === 'romaji') {
      // A wrong Romaji pick (whether the initial choice or the post-speech-
      // failure rescue) is always definitively final — there is no further
      // retry/rescue path from here — so auto-reveal the correct answer
      // immediately instead of showing a "Show Answer" button.
      finalizeWrong()
      setState({ kind: 'result', source, transcript, check, revealed: true })
    } else {
      // A speech-recognition miss is NOT final yet — Try Again / Romaji
      // rescue may still be available, so leave it unrevealed.
      setState({ kind: 'result', source, transcript, check, revealed: false })
    }
  }

  function revealAnswer() {
    if (state.kind !== 'result' || state.revealed) return
    finalizeWrong()
    setState({ ...state, revealed: true })
  }

  function startListening() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setSpeechSupported(false)
      return
    }
    recognitionTokenRef.current++
    recognitionRef.current?.abort()
    const token = recognitionTokenRef.current
    let settled = false
    const settle = (callback: () => void) => {
      if (settled || token !== recognitionTokenRef.current) return
      settled = true
      callback()
    }
    setShowRomaji(false)
    setIsRomajiRescue(false)
    setState({ kind: 'listening' })
    const recognition = new Ctor()
    recognitionRef.current = recognition
    recognition.lang = 'ja-JP'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3
    recognition.onresult = (event) => {
      if (settled || token !== recognitionTokenRef.current || !event.results || !event.results[0]) return
      const result = event.results[0]
      const alternatives: string[] = []
      const resultLength = Number.isInteger(result.length) && result.length > 0 ? result.length : 0
      for (let i = 0; i < resultLength; i++) {
        const transcript = result[i]?.transcript
        if (typeof transcript === 'string' && transcript.trim()) alternatives.push(transcript)
      }
      const check = targets.length === 1 ? checkOrderAlternatives(alternatives, round.menu, targets[0]) : checkMultipleDishOrderAlternatives(alternatives, round.menu, targets)
      settle(() => evaluate('speech', alternatives[0] ?? null, check))
    }
    recognition.onerror = () => {
      settle(() => evaluate('speech', null, { outcome: 'unrecognized' }))
    }
    recognition.onend = () => {
      settle(() => evaluate('speech', null, { outcome: 'unrecognized' }))
    }
    try {
      recognition.start()
    } catch {
      settle(() => evaluate('speech', null, { outcome: 'unrecognized' }))
    }
  }

  function chooseRomaji(dish: RestaurantDish) {
    if (targets.length === 2) {
      setSelectedRomaji((selected) => selected.some((item) => item.id === dish.id) ? selected.filter((item) => item.id !== dish.id) : selected.length < 2 ? [...selected, dish] : selected)
      return
    }
    const check: OrderCheckResult = dish.id === round.target.id ? { outcome: 'success' } : { outcome: 'wrong-dish', identified: dish }
    evaluate('romaji', null, check)
  }

  function submitRomajiOrder() {
    const correct = selectedRomaji.length === targets.length && targets.every((target) => selectedRomaji.some((dish) => dish.id === target.id))
    evaluate('romaji', null, correct ? { outcome: 'success' } : { outcome: 'wrong-dish', identified: selectedRomaji[0] ?? round.menu[0] })
  }

  function nextOrder() {
    if (questionNumber >= 8) {
      setCompleted(true)
      return
    }
    sequenceIdRef.current++
    stop()
    recognitionTokenRef.current++
    recognitionRef.current?.abort()
    recognitionRef.current = null
    const nextRound = pickRoundFromPools(dishes, menuDishes, Math.random, round.target.id, usedTargetIdsRef.current, lastMenuKeyRef.current)
    usedTargetIdsRef.current = [...usedTargetIdsRef.current, nextRound.target.id]
    const isTwoTargetRound = questionNumber + 1 >= 5
    let secondTarget: RestaurantDish | null = null
    let nextMenu = nextRound.menu
    if (isTwoTargetRound) {
      const pairAvoidIds = dishes
        .filter((dish) => usedPairKeysRef.current.includes([nextRound.target.id, dish.id].sort().join('|')))
        .map((dish) => dish.id)
      const selectedSecondTarget = pickCappedTarget(dishes, usedTargetIdsRef.current, [nextRound.target.id], pairAvoidIds, Math.random)
      secondTarget = selectedSecondTarget

      const fillerPool = menuDishes.filter((dish) => dish.id !== nextRound.target.id && dish.id !== selectedSecondTarget.id)
      const buildFinalMenu = () => shuffleRestaurantChoices([
        nextRound.target,
        selectedSecondTarget,
        ...shuffleRestaurantChoices(fillerPool).slice(0, 2),
      ])
      nextMenu = buildFinalMenu()
      for (let attempt = 0; attempt < 4 && menuKey(nextMenu) === lastMenuKeyRef.current; attempt++) {
        nextMenu = buildFinalMenu()
      }
      if (menuKey(nextMenu) === lastMenuKeyRef.current) {
        outer: for (let first = 0; first < fillerPool.length; first++) {
          for (let second = first + 1; second < fillerPool.length; second++) {
            const alternative = [nextRound.target, selectedSecondTarget, fillerPool[first], fillerPool[second]]
            if (menuKey(alternative) !== lastMenuKeyRef.current) {
              nextMenu = shuffleRestaurantChoices(alternative)
              break outer
            }
          }
        }
      }

      usedTargetIdsRef.current = [...usedTargetIdsRef.current, selectedSecondTarget.id]
      usedPairKeysRef.current = [...usedPairKeysRef.current, [nextRound.target.id, selectedSecondTarget.id].sort().join('|')]
    }
    const orderRound = { ...nextRound, menu: nextMenu }
    lastMenuKeyRef.current = menuKey(orderRound.menu)
    setRound(orderRound)
    setTargets(secondTarget ? [orderRound.target, secondTarget] : [orderRound.target])
    setRomajiChoices(shuffleRestaurantChoices(orderRound.menu))
    setShowRomaji(false)
    setIsRomajiRescue(false)
    setSelectedRomaji([])
    speechRetryUsedRef.current = false
    setSpeechRetryUsed(false)
    setQuestionNumber((number) => number + 1)
    setState({ kind: 'idle' })
  }

  function playAgain() {
    sequenceIdRef.current++
    stop()
    recognitionTokenRef.current++
    recognitionRef.current?.abort()
    recognitionRef.current = null
    const firstRound = pickRoundFromPools(dishes, menuDishes)
    usedTargetIdsRef.current = [firstRound.target.id]
    usedPairKeysRef.current = []
    setRound(firstRound)
    lastMenuKeyRef.current = menuKey(firstRound.menu)
    setTargets([firstRound.target])
    setRomajiChoices(shuffleRestaurantChoices(firstRound.menu))
    setQuestionNumber(1)
    setSessionResults([])
    setCompleted(false)
    setStarted(false)
    setShowRomaji(false)
    setIsRomajiRescue(false)
    setSelectedRomaji([])
    speechRetryUsedRef.current = false
    setSpeechRetryUsed(false)
    lastWrongFeedbackIdRef.current = null
    resultAnnouncedRef.current = false
    setState({ kind: 'idle' })
  }

  async function hearFullOrder(sumimasenKey: string, sumimasenText: string, toKey: string, toText: string, onegaishimasuKey: string, onegaishimasuText: string) {
    const sequenceId = ++sequenceIdRef.current
    stop()
    const play = (key: string, text: string) => speakAndWait ? speakAndWait(key, text) : Promise.resolve(speak(key, text))
    await play(sumimasenKey, sumimasenText)
    if (sequenceId !== sequenceIdRef.current) return
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    if (sequenceId !== sequenceIdRef.current) return
    for (let i = 0; i < targets.length; i++) {
      await play(targets[i].audioPath.replace(/^\/audio\//, '').replace(/\.mp3$/, ''), targets[i].displayKana)
      if (sequenceId !== sequenceIdRef.current) return
      if (i < targets.length - 1) await play(toKey, toText)
      if (sequenceId !== sequenceIdRef.current) return
      await new Promise((resolve) => window.setTimeout(resolve, 400))
      if (sequenceId !== sequenceIdRef.current) return
    }
    await play(onegaishimasuKey, onegaishimasuText)
  }

  function tryAgain() {
    if (speechRetryUsedRef.current) return
    speechRetryUsedRef.current = true
    setSpeechRetryUsed(true)
    startListening()
  }

  function showRomajiRescue() {
    setIsRomajiRescue(true)
    setShowRomaji(true)
    setSelectedRomaji([])
    setState({ kind: 'idle' })
  }

  function revealRomajiRescueAnswer() {
    finalizeWrong()
    setState({ kind: 'result', source: 'romaji', transcript: null, check: { outcome: 'wrong-dish', identified: round.menu[0] }, revealed: true })
    setShowRomaji(false)
  }

  function hearDish(dish: RestaurantDish) {
    sequenceIdRef.current++
    stop()
    speak(dish.audioPath.replace(/^\/audio\//, '').replace(/\.mp3$/, ''), dish.displayKana)
  }

  const isResult = state.kind === 'result'
  const isSuccess = isResult && state.kind === 'result' && state.check.outcome === 'success'
  const isSpeechFailure = isResult && state.kind === 'result' && state.source === 'speech' && !isSuccess && !state.revealed
  const mistakes = sessionResults.filter((result) => !result.correct)

  return {
    round, targets, romajiChoices, state, questionNumber, sessionResults, completed, started, showRomaji, isRomajiRescue,
    selectedRomaji, speechRetryUsed, speechSupported, isResult, isSuccess, isSpeechFailure, mistakes,
    setStarted, startListening, chooseRomaji, submitRomajiOrder, nextOrder, playAgain, hearFullOrder, tryAgain,
    showRomajiRescue, revealRomajiRescueAnswer, revealAnswer, hearDish, setShowRomaji,
  }
}
