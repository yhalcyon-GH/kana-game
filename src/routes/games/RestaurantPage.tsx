import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { PracticeScoreVisual } from '../../components/PracticeScoreVisual'
import { PRACTICE_CHECKPOINTS_BY_ID } from '../../data/practiceCheckpoints'
import { RESTAURANT_DISHES, type RestaurantDish } from '../../data/restaurantDishes'
import { useOrderingGame, type OrderingSessionResult } from '../../hooks/useOrderingGame'
import { getCheckpointDishPool } from '../../lib/checkpointDishPool'
import { getNextGlobalRealRow } from '../../lib/curriculumNavigation'
import { useProgressStore } from '../../store/progressStore'

// Restaurant is repeatable and still fully isolated from Review/SRS/mastery,
// but approved checkpoints are now explicit Recommended Path experience
// steps (Issue #183). Finishing all 8 questions records only the row's
// score-independent `checkpoint` completion flag; accuracy never gates Next.
export function RestaurantPage({ checkpointId = 'na-row' }: { checkpointId?: string }) {
  const checkpoint = PRACTICE_CHECKPOINTS_BY_ID[checkpointId]
  const markRowActivityCompleted = useProgressStore((s) => s.markRowActivityCompleted)
  const { targets: dishes, menuDishes } = getCheckpointDishPool(checkpointId)
  const game = useOrderingGame({
    dishes,
    menuDishes,
    greetingAudioKey: 'restaurant/staff/irasshaimase',
    greetingText: 'いらっしゃいませ。',
    successAudioKey: 'restaurant/staff/kashikomarimashita',
    successText: 'かしこまりました。',
  })
  const {
    round, targets, romajiChoices, state, questionNumber, sessionResults, completed, started, showRomaji, isRomajiRescue,
    selectedRomaji, speechRetryUsed, speechSupported, isResult, isSuccess, isSpeechFailure, mistakes,
    setStarted, startListening, chooseRomaji, submitRomajiOrder, nextOrder, playAgain, hearFullOrder, tryAgain,
    showRomajiRescue, revealRomajiRescueAnswer, revealAnswer, hearDish, setShowRomaji,
  } = game

  useEffect(() => {
    if (completed && checkpoint) markRowActivityCompleted(checkpoint.afterRowId, 'checkpoint')
  }, [completed, checkpoint, markRowActivityCompleted])

  const backPath =
    checkpoint?.categoryId === 'hiragana' ? '/hiragana' :
    checkpoint?.categoryId === 'katakana' ? '/katakana' :
    checkpoint?.categoryId === 'youon' ? '/youon' : '/other'
  // Hiragana/Katakana Test (Issue #189, Phase 1) is a section-endpoint
  // assessment placed right after that section's final Restaurant
  // checkpoint (hiragana-complete/katakana-complete) — an explicit override
  // here rather than teaching getNextGlobalRealRow about a non-GojuonRow
  // destination, since that helper's whole contract is "the next real row."
  const ASSESSMENT_AFTER_CHECKPOINT: Record<string, string> = {
    'hiragana-complete': '/assessment/hiragana',
    'katakana-complete': '/assessment/katakana',
    'chouon-complete': '/assessment/sokuon-chouon',
  }
  const assessmentNextPath = checkpoint ? ASSESSMENT_AFTER_CHECKPOINT[checkpoint.id] : undefined
  const nextRow = !assessmentNextPath && checkpoint ? getNextGlobalRealRow(checkpoint.afterRowId) : null
  const nextPath = assessmentNextPath ?? (nextRow ? `/practice/${nextRow.categoryId}/${nextRow.id}` : undefined)

  if (completed) {
    const correct = sessionResults.filter((result) => result.correct).length
    return <SessionSummary correct={correct} mistakes={mistakes} onPlayAgain={playAgain} backPath={backPath} nextPath={nextPath} />
  }
  if (!started) return <RestaurantIntro onStart={() => setStarted(true)} backPath={backPath} />

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link to={backPath} className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:border-blue-400 hover:text-neutral-900 dark:border-neutral-600 dark:text-neutral-300 dark:hover:text-neutral-100">← Back</Link>
        <p className="text-center text-xs text-neutral-500">Question {questionNumber} / 8</p>
        <span className="w-16" aria-hidden="true" />
      </div>

      <RestaurantMenuSheet dishes={round.menu} />

      <div className="flex w-full max-w-md items-end gap-3">
        <img src={`${import.meta.env.BASE_URL}mascot/order.webp`} alt="Tamamizu" className="h-28 w-28 shrink-0 object-contain sm:h-32 sm:w-32" />
        <div className="relative min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-800 sm:px-4" data-testid="restaurant-target-bubble" aria-label="What Tamamizu wants to order">
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-1">
            {targets.map((dish, index) => (
              <span key={dish.id} data-testid={`restaurant-target-${dish.id}`} className="flex min-w-0 items-center">
                <DishGlyph dish={dish} className={targets.length === 2 ? 'h-16 w-16 max-w-[28vw] text-3xl sm:h-20 sm:w-20 sm:max-w-[40vw]' : 'h-24 w-24 text-4xl'} target />
                {index < targets.length - 1 && <span className="font-kana shrink-0 px-0.5 text-2xl">と</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p data-testid="restaurant-order-template" className="font-kana w-full text-center text-[clamp(.8rem,4vw,1.125rem)]" lang="ja">
        {targets.length === 1 ? 'すみません、＿＿＿＿ おねがいします。' : 'すみません、＿＿＿＿ と ＿＿＿＿ おねがいします。'}
      </p>

      {isResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900">
          {state.kind === 'result' && state.transcript !== null && <p className="text-sm text-neutral-500 dark:text-neutral-400">I heard: 「{state.transcript}」</p>}
          {isSuccess || (state.kind === 'result' && state.revealed) ? (
            <>
              {isSuccess && <p className="text-lg font-bold text-green-600 dark:text-green-400">Great!</p>}
              <p className="text-xl font-bold">{targets.map((dish) => dish.romaji).join(' + ')}</p>
              {targets.map((dish) => <p key={dish.id} className="text-sm text-neutral-600 dark:text-neutral-300">{dish.english}</p>)}
              <div className="flex gap-2">
                {targets.map((dish) => <button key={dish.id} type="button" onClick={() => hearDish(dish)} className="rounded-full border px-3 py-1 text-sm">Hear {dish.romaji}</button>)}
                <button type="button" onClick={() => hearFullOrder('restaurant/phrases/sumimasen', 'すみません。', 'restaurant/phrases/to', 'と', 'restaurant/phrases/onegaishimasu', 'おねがいします。')} className="rounded-full border px-3 py-1 text-sm">Hear the full order</button>
              </div>
              <AnswerFeedbackRow mood={isSuccess ? 'correct' : 'incorrect'} showNext onNext={nextOrder} />
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{state.kind === 'result' && state.check.outcome === 'wrong-dish' ? "That's not quite it." : "I couldn't catch that."}</p>
              {isSpeechFailure && !speechRetryUsed && <button type="button" onClick={tryAgain} className="mt-1 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95">Try Again</button>}
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
            <button type="button" onClick={startListening} disabled={!speechSupported || state.kind === 'listening'} data-testid="restaurant-speak-button" className="rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">{state.kind === 'listening' ? '🎤 Listening…' : '🎤 Speak'}</button>
            {!speechSupported && <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">Voice input isn't available in this browser — use the buttons below instead.</p>}
            {!showRomaji && <button type="button" onClick={() => setShowRomaji(true)} className="rounded-full border px-5 py-2 text-sm font-semibold">Choose in Romaji</button>}
          </>}

          {showRomaji && <div className="flex w-full flex-col items-center gap-2" data-testid="restaurant-romaji-fallback">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Choose the romaji instead</p>
            <div className="grid w-full grid-cols-2 gap-2">
              {romajiChoices.map((dish) => (
                <button key={dish.id} type="button" onClick={() => chooseRomaji(dish)} data-testid={`restaurant-romaji-${dish.id}`} className={`rounded-xl border px-3 py-2 text-sm font-semibold hover:border-blue-400 active:scale-95 dark:border-neutral-600 ${selectedRomaji.some((item) => item.id === dish.id) ? 'border-blue-500 bg-blue-50' : 'border-neutral-300'}`}>{dish.romaji}</button>
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

export function RestaurantMenuSheet({ dishes }: { dishes: RestaurantDish[] }) {
  return (
    <section aria-labelledby="restaurant-menu-title" data-testid="restaurant-menu" className="w-full max-w-md overflow-hidden rounded-lg border border-amber-300/70 bg-[#fff8e7] shadow-[0_8px_24px_rgba(120,75,25,0.12)] ring-1 ring-inset ring-amber-200/80 dark:border-amber-800/80 dark:bg-[#2b2118] dark:ring-amber-700/70 dark:shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
      <header className="px-4 pt-4 pb-3 sm:px-6">
        <h2 id="restaurant-menu-title" className="font-kana text-center text-2xl font-bold tracking-[0.14em] text-amber-950 dark:text-amber-100">メニュー</h2>
        <div data-testid="restaurant-menu-divider" aria-hidden="true" className="mx-auto mt-2 w-full border-t border-amber-300/80 dark:border-amber-700/80" />
      </header>
      <div className="divide-y divide-amber-200/90 px-3 sm:px-5 dark:divide-amber-800/80">
        {dishes.map((dish) => (
          <div key={dish.id} data-testid={`restaurant-dish-${dish.id}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5 text-left sm:grid-cols-[4.25rem_minmax(0,1fr)_auto] sm:gap-3 sm:py-3">
            <DishGlyph dish={dish} className="h-12 w-12 text-2xl sm:h-14 sm:w-14 sm:text-3xl" menu />
            <span className="font-kana min-w-0 break-words text-[clamp(1.25rem,6vw,1.75rem)] leading-snug font-bold text-amber-950 dark:text-amber-100">{dish.displayKana}</span>
            <span className="whitespace-nowrap text-right text-xs font-medium tabular-nums text-amber-900/75 sm:text-sm dark:text-amber-200/75">¥{dish.priceYen}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function CafeMenuSheet({ dishes, targetIds = [] }: { dishes: RestaurantDish[]; targetIds?: string[] }) {
  return (
    <section aria-labelledby="cafe-menu-title" data-testid="cafe-menu" className="w-full max-w-md overflow-hidden rounded-lg border border-amber-300/70 bg-[#fff8e7] shadow-[0_8px_24px_rgba(120,75,25,0.12)] ring-1 ring-inset ring-amber-200/80 dark:border-amber-800/80 dark:bg-[#2b2118] dark:ring-amber-700/70 dark:shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
      <header className="px-4 pt-4 pb-3 sm:px-6">
        <h2 id="cafe-menu-title" className="font-kana text-center text-2xl font-bold tracking-[0.14em] text-amber-950 dark:text-amber-100">メニュー</h2>
        <div data-testid="cafe-menu-divider" aria-hidden="true" className="mx-auto mt-2 w-full border-t border-amber-300/80 dark:border-amber-700/80" />
      </header>
      <div className="divide-y divide-amber-200/90 px-3 sm:px-5 dark:divide-amber-800/80">
        {dishes.map((dish) => {
          const isTarget = targetIds.includes(dish.id)
          return (
            <div key={dish.id} data-testid={`cafe-dish-${dish.id}`} className="flex items-center justify-between gap-3 py-2.5 text-left sm:py-3">
              <span className="font-kana min-w-0 break-words text-[clamp(1.25rem,6vw,1.75rem)] leading-snug font-bold text-amber-950 dark:text-amber-100">
                {isTarget && <span data-testid={`cafe-menu-target-${dish.id}`} aria-hidden="true" className="mr-1">👉</span>}
                {dish.displayKana}
              </span>
              <span className="whitespace-nowrap text-right text-xs font-medium tabular-nums text-amber-900/75 sm:text-sm dark:text-amber-200/75">¥{dish.priceYen}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function DishGlyph({ dish, className, target = false, menu = false }: { dish: RestaurantDish; className: string; target?: boolean; menu?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (dish.image && !failed) {
    return <img src={`${import.meta.env.BASE_URL}${dish.image}`} alt={target ? 'Target dish' : menu ? dish.displayKana : ''} onError={() => setFailed(true)} className={`object-contain ${className}`} />
  }
  return <div className={`flex items-center justify-center ${className}`} aria-hidden="true">{dish.placeholderEmoji}</div>
}

function RestaurantIntro({ onStart, backPath }: { onStart: () => void; backPath: string }) {
  const sushi = RESTAURANT_DISHES.find((dish) => dish.id === 'sushi')!
  const udon = RESTAURANT_DISHES.find((dish) => dish.id === 'udon')!
  return <div className="flex w-full flex-col items-center gap-4">
    <Link to={backPath} className="self-start rounded-full border px-4 py-1.5 text-sm font-semibold">← Back</Link>
    <p className="whitespace-nowrap text-center text-lg font-bold">Let's order at a restaurant.</p>
    <img src={`${import.meta.env.BASE_URL}mascot/restaurant-intro.webp`} alt="Restaurant introduction" className="h-auto w-full max-w-md rounded-2xl object-contain" />
    <p className="text-sm">When ordering, say:</p>
    <div className="font-kana text-center text-lg"><p>すみません</p><p className="font-sans text-xs">(Excuse me)</p></div>
    <div className="flex items-center gap-2"><DishGlyph dish={sushi} className="h-16 w-16" menu /><div className="text-center"><p className="font-kana text-2xl">と</p><p className="text-xs">and</p></div><DishGlyph dish={udon} className="h-16 w-16" menu /></div>
    <div className="font-kana text-center text-lg"><p>おねがいします</p><p className="font-sans text-xs">(please)</p></div>
    <button type="button" onClick={onStart} className="rounded-full bg-blue-600 px-6 py-3 font-semibold text-white">Start</button>
  </div>
}

export function SessionSummary({
  correct,
  mistakes,
  onPlayAgain,
  backPath,
  nextPath,
  testIdPrefix = 'restaurant',
}: {
  correct: number
  mistakes: OrderingSessionResult[]
  onPlayAgain: () => void
  backPath: string
  nextPath?: string
  testIdPrefix?: string
}) {
  const percent = Math.round((correct / 8) * 100)
  const comment = percent === 100 ? "Perfect! You're ready to order!" : percent >= 75 ? "Great job! You're getting the hang of it!" : percent >= 50 ? "Nice work! Let's practice a little more." : "Keep practicing! You'll get it!"
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Completed!</h1>
      <PracticeScoreVisual correct={correct} total={8} />
      <p data-testid={`${testIdPrefix}-result-comment`} className="max-w-sm text-center text-lg font-semibold text-amber-800 dark:text-amber-200">{comment}</p>
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
      <div className="flex flex-wrap justify-center gap-3">
        {nextPath && <Link to={nextPath} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Next</Link>}
        <button type="button" onClick={onPlayAgain} className={`rounded-full px-5 py-2 text-sm font-semibold ${nextPath ? 'border' : 'bg-blue-600 text-white'}`}>Play Again</button>
        <Link to={backPath} className="rounded-full border px-5 py-2 text-sm font-semibold">Back</Link>
      </div>
    </div>
  )
}
