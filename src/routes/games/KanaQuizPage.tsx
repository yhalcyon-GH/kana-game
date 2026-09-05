import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { PracticeSummary } from '../../components/PracticeSummary'
import { SaveCharacterToggle } from '../../components/SaveCharacterToggle'
import { ReviewEmptyState } from '../../components/ReviewEmptyState'
import { CHARACTERS_BY_ID, getCharacterAudioId } from '../../data/characters'
import { CATEGORIES_BY_ID, ROWS_BY_ID } from '../../data/curriculum'
import type { QuestionMode } from '../../data/feedback'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useDelayedAction } from '../../hooks/useDelayedAction'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useGameSession } from '../../hooks/useGameSession'
import { usePracticeAnalytics } from '../../hooks/usePracticeAnalytics'
import { useTTS } from '../../hooks/useTTS'
import { pickDistractorCharIds } from '../../lib/distractorPicker'
import { buildKanaQuizTargetQueue, getKanaQuizRounds } from '../../lib/kanaQuizSelection'
import { isNearMissCharacterChoice } from '../../lib/nearMiss'
import { buildQuizModePlan } from '../../lib/quizModePlan'
import { shuffle } from '../../lib/shuffle'
import {
  buildSimilarLettersTargetQueue,
  pickSimilarLettersDistractorCharIds,
} from '../../lib/similarLettersSelection'
import { useProgressStore } from '../../store/progressStore'

const DISTRACTOR_COUNT = 3

// Tests bare kana recall without a word wrapping it: see (and optionally
// hear) a single character, pick its reading from a few choices. Word
// Builder and Listening only ever exercise characters bundled into words —
// this is the one place raw character knowledge gets checked directly.
//
// Every session mixes both directions of character recall, one question
// mode per round (see roundModes below) — there is no upfront mode choice:
// - Read: kana -> romaji ("see か, choose ka"). No pronunciation audio at
//   all, before or after answering, and no replay button — a pure visual
//   kana-reading retrieval check (the mascot's existing correct/incorrect
//   feedback voice is unrelated and still plays).
// - Recall: audio -> kana ("hear ka, choose か"). The target kana is never
//   shown before answering — the audio itself is the prompt.
// Both share every other mechanic (distractors, session length, scoring,
// Leitner/Character Review, mistake replay) — only what's shown/played and
// in which order differs. See docs in each render branch below.
type Props = {
  // Set only by the /practice/review/kana-quiz route — see REVIEW_SCOPE_ID.
  rowIdOverride?: string
}

export function KanaQuizPage({ rowIdOverride }: Props = {}) {
  const params = useParams<{ categoryId?: string; rowId?: string }>()
  const rowId = rowIdOverride ?? params.rowId
  const navigate = useNavigate()
  const {
    isScopeReady,
    getScopeCharacterIds,
    getScopeQuizCharacterIds,
    isQuizzableCharacterId,
    getScopeRounds,
    isSummaryRow,
    isSimilarLettersRow,
    getConfusionGroups,
  } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const recordCharacterReviewResult = useProgressStore((s) => s.recordCharacterReviewResult)
  const markRowActivityCompleted = useProgressStore((s) => s.markRowActivityCompleted)
  const characters = useProgressStore((s) => s.characters)
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const categoryId = isReview ? undefined : (params.categoryId ?? ROWS_BY_ID[rowId ?? '']?.categoryId)
  // Issue #180 is Kana-Quiz-only: normal rows stay at 8 except は/ハ (12)
  // and the first combined Katakana row (16). Summary keeps its existing 15
  // via getScopeRounds; Review/Similar Letters keep their existing 8.
  const rounds = getKanaQuizRounds(rowId, getScopeRounds(rowId))
  const {
    mood,
    mistakes,
    mistakeIds,
    onCorrect,
    onWrong,
    onFinish,
    clear,
    resetSession,
  } = useAnswerFeedback(rounds as QuestionMode)

  // Kana Quiz doesn't fit 'contrast-pairs' categories (促音/長音) — see
  // PracticeHubPage's comment, which hides this card from the hub. This
  // guard covers direct navigation to the route too (there's no correct
  // isolated reading for っ/ッ to quiz on, only a per-word one).
  const isContrastPairs = !isReview && CATEGORIES_BY_ID[categoryId ?? '']?.learnStyle === 'contrast-pairs'

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId) || (!isReview && ROWS_BY_ID[rowId]?.categoryId !== categoryId) || isContrastPairs) {
      navigate('/', { replace: true })
    }
  }, [rowId, isReview, categoryId, isContrastPairs, isScopeReady, navigate])

  const quizCharacterIds = useMemo(() => getScopeQuizCharacterIds(rowId), [rowId, getScopeQuizCharacterIds])
  const distractorPool = useMemo(
    () => getScopeCharacterIds(rowId).filter(isQuizzableCharacterId),
    [rowId, getScopeCharacterIds, isQuizzableCharacterId],
  )
  const getBox = useCallback((id: string) => characters[id]?.box ?? 0, [characters])

  // Similar Letters mode keeps its existing 80/20 group-balanced queue.
  // Summary and Review keep the existing generic weighted queue. Only a
  // normal real row uses Issue #180's seion-first target ordering: include
  // every eligible base/seion target first, then use distinct dakuten/
  // handakuten targets for the remaining slots before any repeat.
  const isSimilarLetters = isSimilarLettersRow(rowId)
  const confusionGroups = useMemo(() => getConfusionGroups(rowId), [rowId, getConfusionGroups])
  const buildQueue = useMemo(() => {
    if (isSimilarLetters) {
      const targetSet = new Set(quizCharacterIds)
      const normalPoolIds = distractorPool.filter((id) => !targetSet.has(id))
      return () => buildSimilarLettersTargetQueue(confusionGroups, normalPoolIds, rounds)
    }
    if (isReview || isSummaryRow(rowId)) return undefined
    return () => buildKanaQuizTargetQueue(quizCharacterIds, getBox, rounds)
  }, [isSimilarLetters, quizCharacterIds, distractorPool, confusionGroups, rounds, isReview, isSummaryRow, rowId, getBox])

  const { queue, roundIndex, correctCount, setCorrectCount, finished, startSession, startMistakeReview, advance } =
    useGameSession({ ids: quizCharacterIds, weight: getBox, onFinish, resetSession, rounds, sessionKey: rowId, buildQueue })
  usePracticeAnalytics('kanaQuiz', categoryId, isReview || isSimilarLetters ? undefined : rowId, rowId, finished, correctCount, queue.length)
  const { schedule: scheduleAdvance, cancel: cancelAdvance } = useDelayedAction()
  // Manual Next after a correct answer must cancel the pending 2s auto-
  // advance timer before advancing, so a click right after answering
  // correctly never fires both the timer AND the click (which would skip
  // two rounds). cancel() is a harmless no-op on a wrong answer (nothing
  // scheduled) or once the timer has already fired.
  const handleNext = useCallback(() => {
    cancelAdvance()
    advance()
  }, [cancelAdvance, advance])

  // One Read/Recall mode per queue slot, built fresh every time `queue`
  // itself gets a new identity (a brand-new session from startSession, a
  // mistake-only replay from startMistakeReview) — see buildQuizModePlan
  // for why this is a guaranteed-even shuffle rather than a per-round coin
  // flip. useMemo (not a separate effect+state pair) keeps this in sync
  // with `queue` in the SAME render, so roundModes is never stale/out of
  // range for the round currently being set up below.
  const roundModes = useMemo(() => buildQuizModePlan(queue.length), [queue])

  const [choices, setChoices] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  // Which round `answered`/`selectedId` actually describe, identified by
  // roundIndex (NOT currentCharId — see below). advance() (called by the
  // auto-advance timer right after a CORRECT answer, or by the manual Next
  // button after a wrong one) bumps roundIndex, which re-renders with a NEW
  // currentCharId — but `answered`/`selectedId` from the round that just
  // ended aren't cleared until the per-round reset effect below runs (after
  // this render commits). Without this guard, that one transitional render
  // evaluates `selectedId !== currentCharId` against the stale selectedId
  // vs. the brand-new target — almost always true — and the "Next" button
  // below flashes on briefly even though the learner just answered
  // correctly and never touched it.
  // This was originally keyed on currentCharId (`answeredForId ===
  // currentCharId`), but that's not a reliable round identity: a small pool
  // (e.g. Review with very few weak items) can legitimately put the SAME
  // character id in two consecutive rounds, in which case
  // `answeredForId === currentCharId` stays true straight through the round
  // transition even though it's now a genuinely new round — reintroducing
  // the exact same stale-button flash. roundIndex, bumped exactly once per
  // round by advance(), is a real per-round identity regardless of what
  // character/word happens to occupy it.
  const [answeredForRoundIndex, setAnsweredForRoundIndex] = useState<number | null>(null)

  const currentCharId = queue.length > 0 ? queue[roundIndex] : undefined
  const currentMode = roundModes[roundIndex]

  useEffect(() => {
    if (!currentCharId || !currentMode) return
    const distractors = isSimilarLetters
      ? pickSimilarLettersDistractorCharIds([currentCharId], confusionGroups, distractorPool, DISTRACTOR_COUNT)
      : pickDistractorCharIds([currentCharId], distractorPool, DISTRACTOR_COUNT)
    setChoices(shuffle([currentCharId, ...distractors]))
    setSelectedId(null)
    setAnswered(false)
    setAnsweredForRoundIndex(null)
    clear()
    // Recall's prompt IS the audio — it must autoplay at round start. Read
    // never plays audio at all (see handleChoice).
    if (currentMode === 'recall') {
      speak(`characters/${getCharacterAudioId(currentCharId)}`, CHARACTERS_BY_ID[currentCharId].kana)
    }
    // Keyed on roundIndex/roundModes too, not just currentCharId — a small
    // pool (e.g. Review with only 1-2 weak characters) can put the same
    // character in consecutive rounds, and this effect must still reset
    // per-round state (answered/selectedId/etc.) even when the id doesn't
    // change, or the next round renders already "answered" from the
    // previous one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharId, roundIndex, currentMode])

  useEnterAdvance(answered && answeredForRoundIndex === roundIndex && selectedId !== currentCharId, advance)

  // Recommended Path completion — see progressStore.ts's
  // markRowActivityCompleted. Fires exactly once per real session (the
  // effect only re-runs when `finished` itself flips), only for a normal
  // row (never Review, a separate repair workflow that must not advance
  // Recommended Path state).
  // Similar Letters' synthetic row must never get a completion record (it's
  // outside Recommended Path — see PracticeHubPage's showRecommendedPath).
  useEffect(() => {
    if (finished && !isReview && !isSimilarLetters && rowId) markRowActivityCompleted(rowId, 'kanaQuiz')
  }, [finished, isReview, isSimilarLetters, rowId, markRowActivityCompleted])

  const handleChoice = (choiceId: string) => {
    if (answered || !currentCharId) return
    setSelectedId(choiceId)
    setAnswered(true)
    setAnsweredForRoundIndex(roundIndex)
    const isCorrect = choiceId === currentCharId
    recordResult(currentCharId, isCorrect)
    recordCharacterReviewResult(currentCharId, isCorrect)
    // Read never plays the target pronunciation, before or after answering
    // — it's a pure visual kana-reading check. The mascot's existing
    // correct/incorrect feedback voice (onCorrect/onWrong below) is
    // unrelated and stays as-is.
    if (isCorrect) {
      setCorrectCount((c) => c + 1)
      onCorrect()
      scheduleAdvance(advance, 2000)
    } else {
      onWrong(
        {
          id: currentCharId,
          kana: CHARACTERS_BY_ID[currentCharId].kana,
          romaji: CHARACTERS_BY_ID[currentCharId].romaji,
        },
        isNearMissCharacterChoice(currentCharId, choiceId),
      )
    }
  }

  if (!rowId || !isScopeReady(rowId)) return null
  const hubHref = isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`
  // Not a plain "quizCharacterIds.length === 0 -> empty state": that pool is
  // LIVE and can legitimately drop to 0 mid-session (every queued character
  // graduates during play) while the already-built queue still has an
  // in-progress round to show — see ListeningPage's identical comment.
  if (quizCharacterIds.length === 0 && queue.length === 0) return isReview ? <ReviewEmptyState /> : null

  if (finished) {
    return (
      <PracticeSummary
        title="Kana Quiz complete!"
        score={{ correct: correctCount, total: queue.length }}
        backHref={hubHref}
        onRetry={startSession}
        mistakes={mistakes}
        onRetryMistakes={() => startMistakeReview(mistakeIds)}
        continueAction={!isReview ? { label: 'Continue', to: `${hubHref}/listening` } : undefined}
      />
    )
  }

  if (!currentCharId || !currentMode) return null
  const currentChar = CHARACTERS_BY_ID[currentCharId]
  // Read shows the target kana as the prompt and never plays or offers its
  // pronunciation at all — it's a pure visual kana-reading check. Recall's
  // prompt is the audio itself — the kana stays hidden until the learner
  // has committed to an answer, then the target's romaji/display label is
  // revealed as feedback (the kana glyph itself isn't repeated here since
  // it's already visible among the choices), and replay stays available
  // both before and after answering.

  return (
    <div className="flex flex-col items-center gap-6">
      <GameRoundHeader rowId={rowId} categoryId={categoryId} roundIndex={roundIndex} total={queue.length} />
      <div className="flex flex-col items-center gap-2">
        {currentMode === 'read' ? (
          <span className="font-kana text-7xl font-bold whitespace-nowrap">{currentChar.kana}</span>
        ) : (
          <span className="text-6xl" aria-hidden="true">
            🔊
          </span>
        )}
        {currentMode === 'recall' && (
          <span
            className={`text-2xl font-semibold ${answered ? 'visible' : 'invisible'}`}
            aria-hidden={!answered}
          >
            {currentChar.displayLabel ?? currentChar.romaji}
          </span>
        )}
        {supported && currentMode === 'recall' && (
          <button
            type="button"
            onClick={() => speak(`characters/${getCharacterAudioId(currentCharId)}`, currentChar.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
            🔊 Replay
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {choices.map((choiceId) => {
          const choice = CHARACTERS_BY_ID[choiceId]
          const isSelected = selectedId === choiceId
          const isTarget = choiceId === currentCharId
          const showResult = answered && (isSelected || isTarget)
          return (
            <button
              key={choiceId}
              type="button"
              onClick={() => handleChoice(choiceId)}
              disabled={answered}
              className={`rounded-xl border-2 px-6 py-4 text-2xl font-bold transition ${
                showResult
                  ? isTarget
                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                    : 'border-red-500 bg-red-50 dark:bg-red-950'
                  : 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'
              }`}
            >
              {currentMode === 'recall' ? <span className="font-kana whitespace-nowrap">{choice.kana}</span> : (choice.displayLabel ?? choice.romaji)}
            </button>
          )
        })}
      </div>

      <AnswerFeedbackRow
        mood={mood}
        showNext={answered && answeredForRoundIndex === roundIndex}
        onNext={handleNext}
        saveControl={
          answered && answeredForRoundIndex === roundIndex && selectedId !== currentCharId ? (
            <SaveCharacterToggle characterId={currentCharId} kana={currentChar.kana} />
          ) : undefined
        }
      />
    </div>
  )
}
