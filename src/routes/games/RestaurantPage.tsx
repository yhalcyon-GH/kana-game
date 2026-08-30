import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { RESTAURANT_DISHES, type RestaurantDish, type RestaurantStageId } from '../../data/restaurantDishes'
import { useTTS } from '../../hooks/useTTS'
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
  | { kind: 'result'; transcript: string | null; check: OrderCheckResult; revealed?: boolean }

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
  const [selectedRomaji, setSelectedRomaji] = useState<RestaurantDish[]>([])
  const usedTargetIdsRef = useRef<string[]>([round.target.id])
  const usedPairKeysRef = useRef<string[]>([])
  const lastMenuKeyRef = useRef(menuKey(round.menu))
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recognitionTokenRef = useRef(0)
  const [speechSupported, setSpeechSupported] = useState(false)

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

  function evaluate(transcript: string | null, check: OrderCheckResult) {
    setState({ kind: 'result', transcript, check, revealed: false })
    setSessionResults((previous) => {
      const next = [...previous]
      const index = questionNumber - 1
      const earlier = next[index]
      next[index] = { dishes: targets, correct: Boolean(earlier?.correct) || (check.outcome === 'success' && !earlier) }
      return next
    })
    if (check.outcome === 'success') {
      speak('restaurant/staff/kashikomarimashita', 'かしこまりました。')
    }
  }

  function startListening() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setSpeechSupported(false)
      return
    }
    recognitionTokenRef.current++
    recognitionRef.current?.abort()
    recognitionRef.current = null
    const token = recognitionTokenRef.current
    let settled = false
    const settle = (callback: () => void) => {
      if (settled || token !== recognitionTokenRef.current) return
      settled = true
      recognitionRef.current = null
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
      if (settled || token !== recognitionTokenRef.current || !event.results || !event.results[0]) return
      const result = event.results[0]
      const alternatives: string[] = []
      const resultLength = Number.isInteger(result.length) && result.length > 0 ? result.length : 0
      for (let i = 0; i < resultLength; i++) {
        const transcript = result[i]?.transcript
        if (typeof transcript === 'string' && transcript.trim()) alternatives.push(transcript)
      }
      const check = targets.length === 1 ? checkOrderAlternatives(alternatives, round.menu, targets[0]) : checkMultipleDishOrderAlternatives(alternatives, round.menu, targets)
      settle(() => evaluate(alternatives[0] ?? null, check))
    }
    recognition.onerror = () => {
      settle(() => evaluate(null, { outcome: 'unrecognized' }))
    }
    recognition.onend = () => {
      if (settled || token !== recognitionTokenRef.current) return
      settled = true
      recognitionRef.current = null
      // If neither onresult nor onerror fired (e.g. aborted), fall back to
      // an unrecognized result rather than leaving the UI stuck listening.
      setState((prev) => (prev.kind === 'listening' ? { kind: 'result', transcript: null, check: { outcome: 'unrecognized' } } : prev))
    }
    try {
      recognition.start()
    } catch {
      settle(() => evaluate(null, { outcome: 'unrecognized' }))
    }
  }

  function chooseRomaji(dish: RestaurantDish) {
    if (targets.length === 2) {
      setSelectedRomaji((selected) => selected.some((item) => item.id === dish.id) ? selected.filter((item) => item.id !== dish.id) : selected.length < 2 ? [...selected, dish] : selected)
      return
    }
    const check: OrderCheckResult = dish.id === round.target.id ? { outcome: 'success' } : { outcome: 'wrong-dish', identified: dish }
    evaluate(null, check)
  }

  function submitRomajiOrder() {
    const correct = selectedRomaji.length === targets.length && targets.every((target) => selectedRomaji.some((dish) => dish.id === target.id))
    evaluate(null, correct ? { outcome: 'success' } : { outcome: 'wrong-dish', identified: selectedRomaji[0] ?? round.menu[0] })
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
    const candidates = dishes.filter((dish) => dish.id !== nextRound.target.id)
    const unseenPairs = candidates.filter((dish) => !usedPairKeysRef.current.includes([nextRound.target.id, dish.id].sort().join('|')))
    const secondPool = unseenPairs.length ? unseenPairs : candidates
    const secondTarget = secondPool[Math.floor(Math.random() * secondPool.length)]
    const nextMenu = questionNumber + 1 >= 5
      ? shuffleRestaurantChoices([nextRound.target, secondTarget, ...nextRound.menu.filter((dish) => dish.id !== secondTarget.id && dish.id !== nextRound.target.id)].slice(0, 4))
      : nextRound.menu
    usedPairKeysRef.current = [...usedPairKeysRef.current, [nextRound.target.id, secondTarget.id].sort().join('|')]
    usedTargetIdsRef.current = [...usedTargetIdsRef.current, secondTarget.id]
    const orderRound = { ...nextRound, menu: nextMenu }
    lastMenuKeyRef.current = menuKey(orderRound.menu)
    setRound(orderRound)
    setTargets(questionNumber + 1 >= 5 ? [orderRound.target, secondTarget] : [orderRound.target])
    setRomajiChoices(shuffleRestaurantChoices(orderRound.menu))
    setShowRomaji(false)
    setSelectedRomaji([])
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
    setSelectedRomaji([])
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
    recognitionTokenRef.current++
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setState({ kind: 'idle' })
  }

  const isResult = state.kind === 'result'
  const backPath = stage === 'hiragana' ? '/hiragana' : stage === 'katakana' ? '/katakana' : stage === 'other' ? '/other' : '/youon'
  const isSuccess = isResult && state.kind === 'result' && state.check.outcome === 'success'
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

      <div className="w-full max-w-md divide-y divide-amber-200 rounded-xl border border-amber-200 bg-amber-50/40 px-3 shadow-sm dark:divide-amber-900 dark:border-amber-900 dark:bg-amber-950/20" data-testid="restaurant-menu">
        <h2 className="font-kana px-2 py-3 text-center text-xl font-bold">メニュー</h2>
        {round.menu.map((dish) => (
          <div
            key={dish.id}
            data-testid={`restaurant-dish-${dish.id}`}
            className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 px-2 py-3 text-left transition hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
          >
            <DishGlyph dish={dish} className="h-16 w-16 text-3xl" menu />
            <span className="font-kana text-xl font-bold">{dish.displayKana}</span>
            <span className="text-sm text-neutral-600 dark:text-neutral-300">¥{dish.priceYen}</span>
          </div>
        ))}
      </div>

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
              <button
                type="button"
                onClick={tryAgain}
                className="mt-1 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95"
              >
                Try Again
              </button>
              <button type="button" onClick={() => setState({ ...state, revealed: true })} className="rounded-full border px-5 py-2 text-sm font-semibold">Show Answer</button>
            </>
          )}
        </div>
      )}

      {!isResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-4">
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

          {!showRomaji ? <button type="button" onClick={() => setShowRomaji(true)} className="rounded-full border px-5 py-2 text-sm font-semibold">Choose in Romaji</button> : <div className="flex w-full flex-col items-center gap-2" data-testid="restaurant-romaji-fallback">
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
          </div>}
        </div>
      )}
    </div>
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
  const accuracy = Math.round((correct / 8) * 100)
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <h1 className="text-2xl font-bold">Completed!</h1>
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-lg font-semibold">Correct: {correct} / 8</p>
        <p>Mistakes: {mistakes.length}</p>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Accuracy: {accuracy}%</p>
        <h2 className="mt-5 font-bold">Mistakes</h2>
        {mistakes.length === 0 ? <p className="mt-2 text-sm text-neutral-500">None — excellent work!</p> : (
          <div className="mt-2 divide-y divide-neutral-200 text-left dark:divide-neutral-700">
            {mistakes.map(({ dishes }, index) => <div key={`${dishes.map((dish) => dish.id).join('-')}-${index}`} className="flex items-center gap-3 py-2">{dishes.map((dish) => <DishGlyph key={dish.id} dish={dish} className="h-12 w-12 text-2xl" menu />)}<div>{dishes.map((dish) => <p key={dish.id} className="font-kana font-bold">{dish.displayKana} <span className="font-sans text-sm font-normal">{dish.romaji}</span></p>)}</div></div>)}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onPlayAgain} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Play Again</button>
        <Link to={backPath} className="rounded-full border px-5 py-2 text-sm font-semibold">Back</Link>
      </div>
    </div>
  )
}
