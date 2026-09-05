import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { isKatakanaOnlyDish, RESTAURANT_DISHES, type RestaurantDish } from '../../data/restaurantDishes'
import { PRACTICE_CHECKPOINTS_BY_ID } from '../../data/practiceCheckpoints'
import { useOrderingGame } from '../../hooks/useOrderingGame'
import { track } from '../../lib/analytics/track'
import { getCheckpointDishPool } from '../../lib/checkpointDishPool'
import { getNextGlobalRealRow } from '../../lib/curriculumNavigation'
import { useProgressStore } from '../../store/progressStore'
import { CafeMenuSheet, DishGlyph, SessionSummary } from './RestaurantPage'

// Cafe keeps its existing Katakana-only/no-clue-before-answer behavior. Like
// Restaurant, an approved Cafe checkpoint is now a score-independent
// Recommended Path experience step: completing all 8 questions marks only
// the row's `checkpoint` flag and enables Next; score never gates progress.
export function CafePage({ checkpointId }: { checkpointId: string }) {
  const checkpoint = PRACTICE_CHECKPOINTS_BY_ID[checkpointId]
  const markRowActivityCompleted = useProgressStore((s) => s.markRowActivityCompleted)
  const { targets: dishes, menuDishes } = getCheckpointDishPool(checkpointId, isKatakanaOnlyDish)
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

  useEffect(() => {
    if (started) track('cafe_started', { category: checkpoint?.categoryId })
  }, [started, checkpoint])

  useEffect(() => {
    if (completed) {
      const correctCount = sessionResults.filter((result) => result.correct).length
      track('cafe_completed', { category: checkpoint?.categoryId, score: correctCount, questionCount: sessionResults.length })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed])

  const backPath = checkpoint?.categoryId === 'katakana' ? '/katakana' : checkpoint?.categoryId === 'youon' ? '/youon' : '/other'
  const nextRow = checkpoint ? getNextGlobalRealRow(checkpoint.afterRowId) : null
  const nextPath = nextRow ? `/practice/${nextRow.categoryId}/${nextRow.id}` : undefined
  const revealed = isSuccess || (state.kind === 'result' && state.revealed)

  if (completed) {
    const correct = sessionResults.filter((result) => result.correct).length
    return <SessionSummary correct={correct} mistakes={mistakes} onPlayAgain={playAgain} backPath={backPath} nextPath={nextPath} testIdPrefix="cafe" />
  }
  if (!started) return <CafeIntro onStart={() => setStarted(true)} backPath={backPath} />

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link to={backPath} className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:border-blue-400 hover:text-neutral-900 dark:border-neutral-600 dark:text-neutral-300 dark:hover:text-neutral-100">← Back</Link>
        <p className="text-center text-xs text-neutral-500">Question {questionNumber} / 8</p>
        <span className="w-16" aria-hidden="true" />
      </div>

      <CafeMenuSheet dishes={round.menu} targetIds={targets.map((dish) => dish.id)} />

      <div className="flex w-full max-w-md items-end gap-3">
        <img src={`${import.meta.env.BASE_URL}mascot/order.webp`} alt="Tamamizu" className="h-28 w-28 shrink-0 object-contain sm:h-32 sm:w-32" />
        <div className="relative min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-800 sm:px-4" data-testid="cafe-target-bubble" aria-label="What Tamamizu wants to order">
          {revealed ? (
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
              {targets.map((dish, index) => (
                <span key={dish.id} data-testid={`cafe-target-${dish.id}`} className="flex min-w-0 flex-col items-center">
                  <DishGlyph dish={dish} className={targets.length === 2 ? 'h-16 w-16 max-w-[28vw] text-3xl sm:h-20 sm:w-20 sm:max-w-[40vw]' : 'h-24 w-24 text-4xl'} target />
                  <span className="text-xs text-neutral-600 dark:text-neutral-300">{dish.english}</span>
                  {index < targets.length - 1 && <span className="font-kana shrink-0 px-0.5 text-2xl">と</span>}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex min-w-0 flex-col items-center gap-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">Order what&apos;s marked 👉 on the menu.</p>
              {targets.map((dish) => <span key={dish.id} data-testid={`cafe-target-${dish.id}`} aria-hidden="true" />)}
            </div>
          )}
        </div>
      </div>

      <p data-testid="cafe-order-template" className="font-kana w-full text-center text-[clamp(.8rem,4vw,1.125rem)]" lang="ja">
        {targets.length === 1 ? 'すみません、＿＿＿＿ おねがいします。' : 'すみません、＿＿＿＿ と ＿＿＿＿ おねがいします。'}
      </p>

      {isResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900">
          {state.kind === 'result' && state.transcript !== null && <p className="text-sm text-neutral-500 dark:text-neutral-400">I heard: 「{state.transcript}」</p>}
          {revealed ? (
            <>
              {isSuccess && <p className="text-lg font-bold text-green-600 dark:text-green-400">Great!</p>}
              <p className="text-xl font-bold">{targets.map((dish) => dish.romaji).join(' + ')}</p>
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
            <button type="button" onClick={startListening} disabled={!speechSupported || state.kind === 'listening'} data-testid="cafe-speak-button" className="rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">{state.kind === 'listening' ? '🎤 Listening…' : '🎤 Speak'}</button>
            {!speechSupported && <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">Voice input isn't available in this browser — use the buttons below instead.</p>}
            {!showRomaji && <button type="button" onClick={() => setShowRomaji(true)} className="rounded-full border px-5 py-2 text-sm font-semibold">Choose in Romaji</button>}
          </>}

          {showRomaji && <div className="flex w-full flex-col items-center gap-2" data-testid="cafe-romaji-fallback">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Choose the romaji instead</p>
            <div className="grid w-full grid-cols-2 gap-2">
              {romajiChoices.map((dish) => (
                <button key={dish.id} type="button" onClick={() => chooseRomaji(dish)} data-testid={`cafe-romaji-${dish.id}`} className={`rounded-xl border px-3 py-2 text-sm font-semibold hover:border-blue-400 active:scale-95 dark:border-neutral-600 ${selectedRomaji.some((item) => item.id === dish.id) ? 'border-blue-500 bg-blue-50' : 'border-neutral-300'}`}>{dish.romaji}</button>
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

function CafeIntro({ onStart, backPath }: { onStart: () => void; backPath: string }) {
  const koohii = RESTAURANT_DISHES.find((dish) => dish.id === 'koohii')!
  const keeki = RESTAURANT_DISHES.find((dish) => dish.id === 'keeki')!
  return <div className="flex w-full flex-col items-center gap-4">
    <Link to={backPath} className="self-start rounded-full border px-4 py-1.5 text-sm font-semibold">← Back</Link>
    <p className="whitespace-nowrap text-center text-lg font-bold">Let's order at a cafe.</p>
    <img src={`${import.meta.env.BASE_URL}mascot/cafe-intro.webp`} alt="Cafe introduction" className="h-auto w-full max-w-md rounded-2xl object-contain" />
    <p className="text-sm">When ordering, say:</p>
    <div className="font-kana text-center text-lg"><p>すみません</p><p className="font-sans text-xs">(Excuse me)</p></div>
    <div className="flex items-center gap-2"><DishGlyph dish={koohii} className="h-16 w-16" menu /><div className="text-center"><p className="font-kana text-2xl">と</p><p className="text-xs">and</p></div><DishGlyph dish={keeki} className="h-16 w-16" menu /></div>
    <div className="font-kana text-center text-lg"><p>おねがいします</p><p className="font-sans text-xs">(please)</p></div>
    <button type="button" onClick={onStart} className="rounded-full bg-blue-600 px-6 py-3 font-semibold text-white">Start</button>
  </div>
}

export type { RestaurantDish }
