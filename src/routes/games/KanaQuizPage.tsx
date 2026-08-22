import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { PracticeSummary } from '../../components/PracticeSummary'
import { ReviewEmptyState } from '../../components/ReviewEmptyState'
import { CHARACTERS_BY_ID, getCharacterAudioId } from '../../data/characters'
import { CATEGORIES_BY_ID, ROWS_BY_ID } from '../../data/curriculum'
import type { QuestionMode } from '../../data/feedback'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useDelayedAction } from '../../hooks/useDelayedAction'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useGameSession } from '../../hooks/useGameSession'
import { useTTS } from '../../hooks/useTTS'
import { pickDistractorCharIds } from '../../lib/distractorPicker'
import { shuffle } from '../../lib/shuffle'
import { useProgressStore } from '../../store/progressStore'

const DISTRACTOR_COUNT = 3

// Kana Quiz's two prompt directions (see the mode selector below) — chosen
// fresh every time the game is opened, never persisted globally.
type Mode = 'read' | 'recall'

// Tests bare kana recall without a word wrapping it: see (and optionally
// hear) a single character, pick its reading from a few choices. Word
// Builder and Listening only ever exercise characters bundled into words —
// this is the one place raw character knowledge gets checked directly.
//
// Two modes test the two directions of character recall:
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
  const { isScopeReady, getScopeCharacterIds, getScopeQuizCharacterIds, isQuizzableCharacterId, getScopeRounds } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const recordCharacterReviewResult = useProgressStore((s) => s.recordCharacterReviewResult)
  const characters = useProgressStore((s) => s.characters)
  const { speak, supported } = useTTS()
  const isReview = rowId === REVIEW_SCOPE_ID
  const categoryId = isReview ? undefined : (params.categoryId ?? ROWS_BY_ID[rowId ?? '']?.categoryId)
  const rounds = getScopeRounds(rowId)
  const {
    feedback,
    mood,
    mistakes,
    mistakeIds,
    onCorrect,
    onWrong,
    onFinish,
    finishFeedback,
    finishMood,
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

  const { queue, roundIndex, correctCount, setCorrectCount, finished, startSession, startMistakeReview, advance } =
    useGameSession({ ids: quizCharacterIds, weight: getBox, onFinish, resetSession, rounds, sessionKey: rowId })
  const { schedule: scheduleAdvance } = useDelayedAction()

  // Chosen fresh every time this page mounts — see Mode's comment. Picking
  // a mode doesn't rebuild the queue (see the mode-selector guard below,
  // which renders before any round's choices are shown), so "Play again"
  // naturally keeps the same mode, while "Switch mode" (from the summary)
  // explicitly restarts the session AND clears this back to the selector.
  const [mode, setMode] = useState<Mode | null>(null)

  const [choices, setChoices] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)

  const currentCharId = queue.length > 0 ? queue[roundIndex] : undefined

  useEffect(() => {
    // Nothing to set up yet if no mode has been chosen — the selector is
    // showing instead, and this effect re-runs once `mode` changes.
    if (!currentCharId || !mode) return
    const distractors = pickDistractorCharIds([currentCharId], distractorPool, DISTRACTOR_COUNT)
    setChoices(shuffle([currentCharId, ...distractors]))
    setSelectedId(null)
    setAnswered(false)
    clear()
    // Recall's prompt IS the audio — it must autoplay at round start. Read
    // never plays audio at all (see handleChoice).
    if (mode === 'recall') {
      speak(`characters/${getCharacterAudioId(currentCharId)}`, CHARACTERS_BY_ID[currentCharId].kana)
    }
    // Keyed on roundIndex too, not just currentCharId — a small pool (e.g.
    // Review with only 1-2 weak characters) can put the same character in
    // consecutive rounds, and this effect must still reset per-round state
    // (answered/selectedId/etc.) even when the id doesn't change, or the
    // next round renders already "answered" from the previous one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharId, roundIndex, mode])

  useEnterAdvance(answered && selectedId !== currentCharId, advance)

  const handleChoice = (choiceId: string) => {
    if (answered || !currentCharId) return
    setSelectedId(choiceId)
    setAnswered(true)
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
      onWrong({
        id: currentCharId,
        kana: CHARACTERS_BY_ID[currentCharId].kana,
        romaji: CHARACTERS_BY_ID[currentCharId].romaji,
      })
    }
  }

  if (!rowId || !isScopeReady(rowId)) return null
  const hubHref = isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`
  // Not a plain "quizCharacterIds.length === 0 -> empty state": that pool is
  // LIVE and can legitimately drop to 0 mid-session (every queued character
  // graduates during play) while the already-built queue still has an
  // in-progress round to show — see ListeningPage's identical comment.
  if (quizCharacterIds.length === 0 && queue.length === 0) return isReview ? <ReviewEmptyState /> : null

  // Mode selector — shown before every session starts (see Mode's comment;
  // the choice is never persisted). Sits after the empty-Review check above
  // (no point choosing a mode for a session that can't start) and before
  // the finished/game-round checks below.
  if (!mode) {
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">Kana Quiz</h1>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode('read')}
            className="flex flex-col items-start gap-1 rounded-xl border border-neutral-300 bg-white p-4 text-left hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
          >
            <span className="font-semibold">Read</span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">See a kana, choose its sound</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('recall')}
            className="flex flex-col items-start gap-1 rounded-xl border border-neutral-300 bg-white p-4 text-left hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
          >
            <span className="font-semibold">Recall</span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">Hear a sound, choose the kana</span>
          </button>
        </div>
        <Link
          to={hubHref}
          className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
        >
          Back to hub
        </Link>
      </div>
    )
  }

  if (finished) {
    return (
      <PracticeSummary
        title="Kana Quiz complete!"
        stats={[{ label: 'Accuracy', value: `${Math.round((correctCount / queue.length) * 100)}%` }]}
        backHref={hubHref}
        onRetry={startSession}
        mistakes={mistakes}
        onReviewMistakes={() => startMistakeReview(mistakeIds)}
        mood={finishMood ?? undefined}
        comment={finishFeedback?.text}
        secondaryAction={{
          label: 'Switch mode',
          onClick: () => {
            startSession()
            setMode(null)
          },
        }}
      />
    )
  }

  if (!currentCharId) return null
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
        {mode === 'read' ? (
          <span className="font-kana text-7xl font-bold">{currentChar.kana}</span>
        ) : (
          <span className="text-6xl" aria-hidden="true">
            🔊
          </span>
        )}
        {mode === 'recall' && answered && (
          <span className="text-2xl font-semibold">{currentChar.displayLabel ?? currentChar.romaji}</span>
        )}
        {supported && mode === 'recall' && (
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
              {mode === 'recall' ? <span className="font-kana">{choice.kana}</span> : (choice.displayLabel ?? choice.romaji)}
            </button>
          )
        })}
      </div>

      <AnswerFeedbackRow feedback={feedback} mood={mood} />

      {answered && selectedId !== currentCharId && (
        <button
          type="button"
          onClick={advance}
          className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Next
        </button>
      )}
    </div>
  )
}
