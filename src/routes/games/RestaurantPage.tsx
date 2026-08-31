import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { PracticeScoreVisual } from '../../components/PracticeScoreVisual'
import { RESTAURANT_DISHES, type RestaurantDish, type RestaurantStageId } from '../../data/restaurantDishes'
import { useTTS } from '../../hooks/useTTS'
import { pickIncorrectFeedback, pickResultFeedback } from '../../lib/feedbackVoice'
import { menuKey, pickRoundFromPools, shuffleRestaurantChoices, type RestaurantRound } from '../../lib/restaurantRound'
import { checkMultipleDishOrderAlternatives, checkOrderAlternatives, type OrderCheckResult } from '../../lib/restaurantMatching'

// Minimal ambient typing for the (still-experimental, vendor-prefixed) Web
// Speech API — not present in the TS DOM lib. Deliberately only the surface
// this component actually uses; no dependency on the newer
// SpeechRecognition.available()/install()/processLocally() APIs per spec.
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

type ResultState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'result'; source: 'speech' | 'romaji'; transcript: string | null; check: OrderCheckResult; revealed?: boolean }

type SessionResult = { dishes: RestaurantDish[]; correct: boolean }

// A small, standalone, repeatable "order the dish from the menu" mini-game.
// Deliberately outside the
// curriculum/row/Recommended-Path/Review/SRS/Saved system entirely — see
// data/restaurantDishes.ts's comment and this component's total lack of any
// useProgressStore/useCurriculum/savedItemsStore import. It never marks
// anything taught, mastered, reviewed, or completed; it's just a repeatable
// vocabulary-recognition game the learner can play as many times as they
// like from the Hiragana overview page.
export function RestaurantPage({ stage = 'hiragana' }: { stage?: RestaurantStageId }) {
  const { speak, speakAndWait, stop } = useTTS()
  const sequenceIdRef = useRef(0)
  const dishes = RESTAURANT_DISHES.filter((dish) => dish.stage === stage)
  const menuDishes = RESTAURANT_DISHES.filter((dish) => ['hiragana', 'katakana', 'other', 'special-katakana'].indexOf(dish.stage) <= ['hiragana', 'katakana', 'other', 'special-katakana'].indexOf(stage))
  const [round, setRound] = useState<RestaurantRound>(() => pickRoundFromPools(dishes, menuDishes))
  const [targets, setTargets] = useState<RestaurantDish[]>([round.target])
  const [romajiChoices, setRomajiChoices] = useState<RestaurantDish[]>(() => shuffleRestaurantChoices(round.menu))
  const [state, setState] = useState<ResultState>({ kind: 'idle' })
  const [questionNumber, setQuestionNumber] = useState(1)
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([])
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
  // reused as-is rather than a Restaurant-only pool. Tracked so the same
  // line never repeats back-to-back, same rule as normal Practice.
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
      speak('restaurant/staff/irasshaimase', 'いらっしゃいませ。')
      greetedIntroRef.current = true
    }
    if (started) greetedIntroRef.current = false
  }, [started, speak])

  useEffect(() => {
    return () => {
      recognitionTokenRef.current++
      recognitionRef.current?.abort()
      recognitionRef.current = null
      sequenceIdRef.current++
      stop()
    }
  }, [stop])

  // Same shared end-of-session Tamamizu voice line Practice's results screen
  // uses (lib/feedbackVoice.ts's pickResultFeedback, judged on accuracy out
  // of 8 questions — see useAnswerFeedback.onFinish for the Practice-side
  // equivalent), reused rather than a parallel Restaurant judgment table.
  // Guarded by a ref (not just the `completed` dependency) so it plays
  // exactly once even under StrictMode's double-invoked effects.
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

  // Records the mistake (exactly once, via finalizeQuestion's existing
  // index-guard) and plays the SAME shared Tamamizu incorrect-reaction pool
  // normal Practice uses (see lib/feedbackVoice.ts's pickIncorrectFeedback /
  // useAnswerFeedback's onWrong) — reused directly rather than duplicated,
  // per every place a Restaurant answer becomes definitively wrong.
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
      speak('restaurant/staff/kashikomarimashita', 'かしこまりました。')
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

  // Manual "give up" reveal, only reachable while a speech-failure retry/
  // rescue path is still technically available (see the isSpeechFailure
  // render branch) — the learner opts out early rather than retrying.
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
      // If neither onresult nor onerror fired (e.g. aborted), fall back to
      // an unrecognized result rather than leaving the UI stuck listening.
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
      const candidates = dishes.filter((dish) => dish.id !== nextRound.target.id)
      const unseenTargets = candidates.filter((dish) => !usedTargetIdsRef.current.includes(dish.id))
      const targetPool = unseenTargets.length ? unseenTargets : candidates
      const unusedPairs = targetPool.filter((dish) => !usedPairKeysRef.current.includes([nextRound.target.id, dish.id].sort().join('|')))
      const secondPool = unusedPairs.length ? unusedPairs : targetPool
      const selectedSecondTarget = secondPool[Math.min(secondPool.length - 1, Math.floor(Math.random() * secondPool.length))]
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

  async function hearFullOrder() {
    const sequenceId = ++sequenceIdRef.current
    stop()
    const play = (key: string, text: string) => speakAndWait ? speakAndWait(key, text) : Promise.resolve(speak(key, text))
    await play('restaurant/phrases/sumimasen', 'すみません。')
    if (sequenceId !== sequenceIdRef.current) return
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    if (sequenceId !== sequenceIdRef.current) return
    for (let i = 0; i < targets.length; i++) {
      await play(targets[i].audioPath.replace(/^\/audio\//, '').replace(/\.wav$/, ''), targets[i].displayKana)
      if (sequenceId !== sequenceIdRef.current) return
      if (i < targets.length - 1) await play('restaurant/phrases/to', 'と')
      if (sequenceId !== sequenceIdRef.current) return
      await new Promise((resolve) => window.setTimeout(resolve, 400))
      if (sequenceId !== sequenceIdRef.current) return
    }
    await play('restaurant/phrases/onegaishimasu', 'おねがいします。')
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

  const isResult = state.kind === 'result'
  const backPath = stage === 'hiragana' ? '/hiragana' : stage === 'katakana' ? '/katakana' : stage === 'other' ? '/other' : '/youon'
  const isSuccess = isResult && state.kind === 'result' && state.check.outcome === 'success'
  const isSpeechFailure = isResult && state.kind === 'result' && state.source === 'speech' && !isSuccess && !state.revealed
  const mistakes = sessionResults.filter((result) => !result.correct)
  if (completed) {
    const correct = sessionResults.filter((result) => result.correct).length
    return <SessionSummary correct={correct} mistakes={mistakes} onPlayAgain={playAgain} backPath={backPath} />
  }
  if (!started) {
    return <RestaurantIntro onStart={() => setStarted(true)} backPath={backPath} />
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link
          to={backPath}
          className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:border-blue-400 hover:text-neutral-900 dark:border-neutral-600 dark:text-neutral-300 dark:hover:text-neutral-100"
        >
          ← Back
        </Link>
        <p className="text-center text-xs text-neutral-500">Question {questionNumber} / 8</p>
        <span className="w-16" aria-hidden="true" />
      </div>

      {/* Tamamizu + speech bubble showing ONLY the target dish's
          image-or-emoji — no kana/romaji/English inside the bubble, since
          the whole point is the learner has to read the menu to figure out
          what to say. */}
      <div className="flex w-full max-w-md items-end gap-3">
        <img src={`${import.meta.env.BASE_URL}mascot/order.png`} alt="Tamamizu" className="h-28 w-28 shrink-0 object-contain sm:h-32 sm:w-32" />
        <div
          className="relative flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
          data-testid="restaurant-target-bubble"
          aria-label="What Tamamizu wants to order"
        >
          <div className="flex min-w-0 items-center justify-center gap-1">{targets.map((dish, index) => <span key={dish.id} data-testid={`restaurant-target-${dish.id}`} className="flex min-w-0 items-center"><DishGlyph dish={dish} className={targets.length === 2 ? 'h-20 w-20 max-w-[40vw] text-3xl' : 'h-24 w-24 text-4xl'} target />{index < targets.length - 1 && <span className="font-kana shrink-0 px-0.5 text-2xl">と</span>}</span>)}</div>
        </div>
      </div>

      <p data-testid="restaurant-order-template" className="font-kana w-full whitespace-nowrap text-center text-[clamp(.8rem,4vw,1.125rem)]" lang="ja">
        {targets.length === 1 ? 'すみません、＿＿＿＿ おねがいします。' : 'すみません、＿＿＿＿ と ＿＿＿＿ おねがいします。'}
      </p>

      <RestaurantMenuSheet dishes={round.menu} />

      {isResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900">
          {state.kind === 'result' && state.transcript !== null && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">I heard: 「{state.transcript}」</p>
          )}
          {isSuccess || state.revealed ? (
            <>
              {isSuccess && <p className="text-lg font-bold text-green-600 dark:text-green-400">Great!</p>}
              <p className="text-xl font-bold">{targets.map((dish) => dish.romaji).join(' + ')}</p>
              {targets.map((dish) => <p key={dish.id} className="text-sm text-neutral-600 dark:text-neutral-300">{dish.english}</p>)}
              <div className="flex gap-2">
                {targets.map((dish) => <button key={dish.id} type="button" onClick={() => { sequenceIdRef.current++; stop(); speak(dish.audioPath.replace(/^\/audio\//, '').replace(/\.wav$/, ''), dish.displayKana) }} className="rounded-full border px-3 py-1 text-sm">Hear {dish.romaji}</button>)}
                <button type="button" onClick={hearFullOrder} className="rounded-full border px-3 py-1 text-sm">Hear the full order</button>
              </div>
              <AnswerFeedbackRow mood={isSuccess ? 'correct' : 'incorrect'} showNext onNext={nextOrder} />
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {state.kind === 'result' && state.check.outcome === 'wrong-dish' ? "That's not quite it." : "I couldn't catch that."}
              </p>
              {isSpeechFailure && !speechRetryUsed && <button
                type="button"
                onClick={tryAgain}
                className="mt-1 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95"
              >
                Try Again
              </button>}
              {isSpeechFailure && <button type="button" onClick={showRomajiRescue} className="rounded-full border px-5 py-2 text-sm font-semibold">Choose in Romaji</button>}
              <button type="button" onClick={revealAnswer} className="rounded-full border px-5 py-2 text-sm font-semibold">Show Answer</button>
              <AnswerFeedbackRow mood="incorrect" showNext={false} onNext={nextOrder} />
            </>
          )}
        </div>
      )}

      {!isResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          {(!showRomaji || !isRomajiRescue) && <>
            <button
              type="button"
              onClick={startListening}
              disabled={!speechSupported || state.kind === 'listening'}
              data-testid="restaurant-speak-button"
              className="rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.kind === 'listening' ? '🎤 Listening…' : '🎤 Speak'}
            </button>
            {!speechSupported && (
              <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
                Voice input isn't available in this browser — use the buttons below instead.
              </p>
            )}
            {!showRomaji && <button type="button" onClick={() => setShowRomaji(true)} className="rounded-full border px-5 py-2 text-sm font-semibold">Choose in Romaji</button>}
          </>}

          {showRomaji && <div className="flex w-full flex-col items-center gap-2" data-testid="restaurant-romaji-fallback">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Choose the romaji instead</p>
            <div className="grid w-full grid-cols-2 gap-2">
              {romajiChoices.map((dish) => (
                <button
                  key={dish.id}
                  type="button"
                  onClick={() => chooseRomaji(dish)}
                  data-testid={`restaurant-romaji-${dish.id}`}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold hover:border-blue-400 active:scale-95 dark:border-neutral-600 ${selectedRomaji.some((item) => item.id === dish.id) ? 'border-blue-500 bg-blue-50' : 'border-neutral-300'}`}
                >
                  {dish.romaji}
                </button>
              ))}
            </div>
            {targets.length === 2 && <button type="button" disabled={selectedRomaji.length !== 2} onClick={submitRomajiOrder} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Order</button>}
            {isRomajiRescue && <button type="button" onClick={revealRomajiRescueAnswer} className="rounded-full border px-5 py-2 text-sm font-semibold">Show Answer</button>}
          </div>}
        </div>
      )}
    </div>
  )
}

function RestaurantMenuSheet({ dishes }: { dishes: RestaurantDish[] }) {
  return (
    <section
      aria-labelledby="restaurant-menu-title"
      data-testid="restaurant-menu"
      className="w-full max-w-md overflow-hidden rounded-lg border border-amber-300/70 bg-[#fff8e7] shadow-[0_8px_24px_rgba(120,75,25,0.12)] dark:border-amber-800/80 dark:bg-[#2b2118] dark:shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
    >
      <header className="px-4 pt-3 pb-1 sm:px-6">
        <h2 id="restaurant-menu-title" className="font-kana text-center text-xs font-semibold tracking-[0.14em] text-amber-800/80 dark:text-amber-200/70">
          メニュー
        </h2>
      </header>
      <div className="divide-y divide-amber-200/90 px-3 sm:px-5 dark:divide-amber-800/80">
        {dishes.map((dish) => (
          <div
            key={dish.id}
            data-testid={`restaurant-dish-${dish.id}`}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5 text-left sm:grid-cols-[4.25rem_minmax(0,1fr)_auto] sm:gap-3 sm:py-3"
          >
            <DishGlyph dish={dish} className="h-12 w-12 text-2xl sm:h-14 sm:w-14 sm:text-3xl" menu />
            <span className="font-kana min-w-0 break-words text-[clamp(1.25rem,6vw,1.75rem)] leading-snug font-bold text-amber-950 dark:text-amber-100">
              {dish.displayKana}
            </span>
            <span className="whitespace-nowrap text-right text-xs font-medium tabular-nums text-amber-900/75 sm:text-sm dark:text-amber-200/75">
              ¥{dish.priceYen}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function DishGlyph({ dish, className, target = false, menu = false }: { dish: RestaurantDish; className: string; target?: boolean; menu?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (dish.image && !failed) {
    return <img src={`${import.meta.env.BASE_URL}${dish.image}`} alt={target ? 'Target dish' : menu ? dish.displayKana : ''} onError={() => setFailed(true)} className={`object-contain ${className}`} />
  }
  return (
    <div className={`flex items-center justify-center ${className}`} aria-hidden="true">
      {dish.placeholderEmoji}
    </div>
  )
}

function RestaurantIntro({ onStart, backPath }: { onStart: () => void; backPath: string }) {
  const tenpura = RESTAURANT_DISHES.find((dish) => dish.id === 'tenpura')!
  const misoshiru = RESTAURANT_DISHES.find((dish) => dish.id === 'misoshiru')!
  return <div className="flex w-full flex-col items-center gap-4">
    <Link to={backPath} className="self-start rounded-full border px-4 py-1.5 text-sm font-semibold">← Back</Link>
    <p className="whitespace-nowrap text-center text-lg font-bold">Let's order at a restaurant.</p>
    <img src={`${import.meta.env.BASE_URL}mascot/restaurant-intro.png`} alt="Restaurant introduction" className="h-auto w-full max-w-md rounded-2xl object-contain" />
    <p className="text-sm">When ordering, say:</p>
    <div className="font-kana text-center text-lg"><p>すみません</p><p className="font-sans text-xs">(Excuse me)</p></div>
    <div className="flex items-center gap-2"><DishGlyph dish={tenpura} className="h-16 w-16" menu /><div className="text-center"><p className="font-kana text-2xl">と</p><p className="text-xs">and</p></div><DishGlyph dish={misoshiru} className="h-16 w-16" menu /></div>
    <div className="font-kana text-center text-lg"><p>おねがいします</p><p className="font-sans text-xs">(please)</p></div>
    <button type="button" onClick={onStart} className="rounded-full bg-blue-600 px-6 py-3 font-semibold text-white">Start</button>
  </div>
}

function SessionSummary({ correct, mistakes, onPlayAgain, backPath }: { correct: number; mistakes: SessionResult[]; onPlayAgain: () => void; backPath: string }) {
  const percent = Math.round((correct / 8) * 100)
  const comment = percent === 100 ? "Perfect! You're ready to order!" : percent >= 75 ? "Great job! You're getting the hang of it!" : percent >= 50 ? "Nice work! Let's practice a little more." : "Keep practicing! You'll get it!"
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Completed!</h1>
      <PracticeScoreVisual correct={correct} total={8} />
      <p data-testid="restaurant-result-comment" className="max-w-sm text-center text-lg font-semibold text-amber-800 dark:text-amber-200">{comment}</p>
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="font-bold">Mistakes</h2>
        {mistakes.length === 0 ? <p className="mt-2 text-sm text-neutral-500">None — excellent work!</p> : (
          <>
            <p className="mt-2 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Missed this round ({mistakes.length})</p>
            <div className="mt-2 divide-y divide-neutral-200 text-left dark:divide-neutral-700">
            {mistakes.map(({ dishes }, index) => <div key={`${dishes.map((dish) => dish.id).join('-')}-${index}`} className="flex items-center gap-3 py-2">{dishes.map((dish) => <DishGlyph key={dish.id} dish={dish} className="h-12 w-12 text-2xl" menu />)}<div>{dishes.map((dish) => <p key={dish.id} className="font-kana font-bold">{dish.displayKana} <span className="font-sans text-sm font-normal">{dish.romaji}</span></p>)}</div></div>)}
            </div>
          </>
        )}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onPlayAgain} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Play Again</button>
        <Link to={backPath} className="rounded-full border px-5 py-2 text-sm font-semibold">Back</Link>
      </div>
    </div>
  )
}
