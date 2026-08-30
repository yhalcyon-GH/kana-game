import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mascot } from '../../components/Mascot'
import { RESTAURANT_DISHES, type RestaurantDish, type RestaurantStageId } from '../../data/restaurantDishes'
import { useTTS } from '../../hooks/useTTS'
import { pickRound, type RestaurantRound } from '../../lib/restaurantRound'
import { checkOrderAlternatives, type OrderCheckResult } from '../../lib/restaurantMatching'

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
  | { kind: 'result'; transcript: string | null; check: OrderCheckResult }

// A small, standalone, repeatable "order the dish from the menu" mini-game
// (Issue: Hiragana Restaurant prototype). Deliberately outside the
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
  const [round, setRound] = useState<RestaurantRound>(() => pickRound(dishes))
  const [state, setState] = useState<ResultState>({ kind: 'idle' })
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [speechSupported, setSpeechSupported] = useState(false)

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null)
  }, [speak])

  // Staff greeting, once per screen mount — same useTTS abstraction as
  // everywhere else in the app; if there's no static clip for this key the
  // existing WebSpeechProvider fallback in useTTS just speaks the fallback
  // text, no new fallback plumbing needed here.
  useEffect(() => {
    speak('restaurant/staff/irasshaimase', 'いらっしゃいませ。')
    // Only on mount for this screen instance — not re-fired on every round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      sequenceIdRef.current++
      stop()
    }
  }, [stop])

  function evaluate(transcript: string | null, check: OrderCheckResult) {
    setState({ kind: 'result', transcript, check })
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
    setState({ kind: 'listening' })
    const recognition = new Ctor()
    recognitionRef.current = recognition
    recognition.lang = 'ja-JP'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3
    recognition.onresult = (event) => {
      const result = event.results[0]
      const alternatives: string[] = []
      for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript)
      const check = checkOrderAlternatives(alternatives, round.menu, round.target)
      evaluate(alternatives[0] ?? null, check)
    }
    recognition.onerror = () => {
      evaluate(null, { outcome: 'unrecognized' })
    }
    recognition.onend = () => {
      // If neither onresult nor onerror fired (e.g. aborted), fall back to
      // an unrecognized result rather than leaving the UI stuck listening.
      setState((prev) => (prev.kind === 'listening' ? { kind: 'result', transcript: null, check: { outcome: 'unrecognized' } } : prev))
    }
    try {
      recognition.start()
    } catch {
      evaluate(null, { outcome: 'unrecognized' })
    }
  }

  function chooseRomaji(dish: RestaurantDish) {
    const check: OrderCheckResult = dish.id === round.target.id ? { outcome: 'success' } : { outcome: 'wrong-dish', identified: dish }
    evaluate(null, check)
  }

  function nextOrder() {
    sequenceIdRef.current++
    stop()
    setRound(pickRound(dishes, Math.random, round.target.id))
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
    await play(round.target.audioPath.replace(/^\/audio\//, '').replace(/\.wav$/, ''), round.target.displayKana)
    if (sequenceId !== sequenceIdRef.current) return
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    if (sequenceId !== sequenceIdRef.current) return
    await play('restaurant/phrases/onegaishimasu', 'おねがいします。')
  }

  function tryAgain() {
    setState({ kind: 'idle' })
  }

  const isResult = state.kind === 'result'
  const backPath = stage === 'hiragana' ? '/hiragana' : stage === 'katakana' ? '/katakana' : stage === 'other' ? '/other' : '/youon'
  const isSuccess = isResult && state.kind === 'result' && state.check.outcome === 'success'

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link
          to={backPath}
          className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:border-blue-400 hover:text-neutral-900 dark:border-neutral-600 dark:text-neutral-300 dark:hover:text-neutral-100"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-bold">{stage === 'hiragana' ? 'ひらがなレストラン' : `${stage === 'katakana' ? 'カタカナ' : stage === 'other' ? 'Sokuon & Long Vowel' : 'Special Katakana'} Restaurant`}</h1>
        <span className="w-16" aria-hidden="true" />
      </div>

      {/* Tamamizu + speech bubble showing ONLY the target dish's
          image-or-emoji — no kana/romaji/English inside the bubble, since
          the whole point is the learner has to read the menu to figure out
          what to say. */}
      <div className="flex w-full max-w-md items-end gap-3">
        <Mascot mood="normal" />
        <div
          className="relative flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
          data-testid="restaurant-target-bubble"
          aria-label="What Tamamizu wants to order"
        >
            <DishGlyph dish={round.target} className="mx-auto h-16 w-16 text-4xl" target />
        </div>
      </div>

      <p className="text-center text-lg" lang="ja">
        すみません、＿＿＿＿、おねがいします。
      </p>

      <div className="grid w-full max-w-md grid-cols-2 gap-3" data-testid="restaurant-menu">
        {round.menu.map((dish) => (
          <div
            key={dish.id}
            data-testid={`restaurant-dish-${dish.id}`}
            className="flex flex-col items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-3 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
          >
            <DishGlyph dish={dish} className="h-12 w-12 text-3xl" menu />
            <span className="font-kana text-xl font-bold">{dish.displayKana}</span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">¥{dish.priceYen}</span>
          </div>
        ))}
      </div>

      {isResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900">
          {state.kind === 'result' && state.transcript !== null && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">I heard: 「{state.transcript}」</p>
          )}
          {isSuccess ? (
            <>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">Great!</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { sequenceIdRef.current++; stop(); speak(round.target.audioPath.replace(/^\/audio\//, '').replace(/\.wav$/, ''), round.target.displayKana) }} className="rounded-full border px-3 py-1 text-sm">Hear the dish</button>
                <button type="button" onClick={hearFullOrder} className="rounded-full border px-3 py-1 text-sm">Hear the full order</button>
              </div>
              <button
                type="button"
                onClick={nextOrder}
                className="mt-1 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95"
              >
                Next order
              </button>
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
                Try again
              </button>
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

          <div className="flex w-full flex-col items-center gap-2" data-testid="restaurant-romaji-fallback">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Choose the romaji instead</p>
            <div className="grid w-full grid-cols-2 gap-2">
              {round.menu.map((dish) => (
                <button
                  key={dish.id}
                  type="button"
                  onClick={() => chooseRomaji(dish)}
                  data-testid={`restaurant-romaji-${dish.id}`}
                  className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold hover:border-blue-400 active:scale-95 dark:border-neutral-600"
                >
                  {dish.romaji}
                </button>
              ))}
            </div>
          </div>
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
