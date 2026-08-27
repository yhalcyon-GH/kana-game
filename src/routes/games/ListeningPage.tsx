import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { GameRoundHeader } from '../../components/GameRoundHeader'
import { PracticeSummary } from '../../components/PracticeSummary'
import { ReviewEmptyState } from '../../components/ReviewEmptyState'
import { RomajiHint } from '../../components/RomajiHint'
import { WordImage } from '../../components/WordImage'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { ROWS_BY_ID } from '../../data/curriculum'
import type { QuestionMode } from '../../data/feedback'
import type { AnchorWord } from '../../data/types'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { REVIEW_SCOPE_ID, useCurriculum } from '../../hooks/useCurriculum'
import { useDelayedAction } from '../../hooks/useDelayedAction'
import { useEnterAdvance } from '../../hooks/useEnterAdvance'
import { useFrozenWordPool } from '../../hooks/useFrozenWordPool'
import { useGameSession } from '../../hooks/useGameSession'
import { useTTS } from '../../hooks/useTTS'
import { pickDistractorWords } from '../../lib/distractorPicker'
import { shuffle } from '../../lib/shuffle'
import {
  buildSimilarLettersSpellingChoices,
  buildSimilarLettersWordQueue,
  type SpellingChoice,
} from '../../lib/similarLettersSelection'
import { useProgressStore } from '../../store/progressStore'

type Props = {
  // Set only by the /practice/review/listening route — see REVIEW_SCOPE_ID.
  rowIdOverride?: string
}

export function ListeningPage({ rowIdOverride }: Props = {}) {
  const params = useParams<{ categoryId?: string; rowId?: string }>()
  const rowId = rowIdOverride ?? params.rowId
  const navigate = useNavigate()
  const { isScopeReady, getScopeWords, getScopeRounds, isSimilarLettersRow, getConfusionGroups } = useCurriculum()
  const recordResult = useProgressStore((s) => s.recordResult)
  const recordWordReviewResult = useProgressStore((s) => s.recordWordReviewResult)
  const markRowActivityCompleted = useProgressStore((s) => s.markRowActivityCompleted)
  const characters = useProgressStore((s) => s.characters)
  const alwaysShowRomajiHints = useProgressStore((s) => s.alwaysShowRomajiHints)
  const isReview = rowId === REVIEW_SCOPE_ID
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined
  const categoryId = isReview ? undefined : (params.categoryId ?? row?.categoryId)
  const { speak, supported } = useTTS()
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

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId) || (!isReview && row?.categoryId !== categoryId)) {
      navigate('/', { replace: true })
    }
  }, [rowId, isReview, row, categoryId, isScopeReady, navigate])

  const scopeWords = useMemo(() => getScopeWords(rowId), [rowId, getScopeWords])
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const sessionKey = `${rowId ?? ''}:${sessionAttempt}`
  const { wordIds, wordsById } = useFrozenWordPool(sessionKey, scopeWords)
  const wordWeight = useCallback(
    (wordId: string) => {
      const word = wordsById[wordId]
      if (!word) return 0
      return Math.min(...word.characterIds.map((c) => characters[c]?.box ?? 0))
    },
    [wordsById, characters],
  )

  // Similar Letters mode (see similarLettersSelection.ts): 80% of a
  // session's target words contain a confusion-group character (group-
  // balanced across every group that has at least one matching word), 20%
  // are a normal word from the same script — instead of the normal
  // weighted-by-box word sampling.
  const isSimilarLetters = isSimilarLettersRow(rowId)
  const confusionGroups = useMemo(() => getConfusionGroups(rowId), [rowId, getConfusionGroups])
  const buildQueue = useMemo(() => {
    if (!isSimilarLetters) return undefined
    const targetIds = new Set(confusionGroups.flat())
    const targetWords = scopeWords.filter((w) => w.characterIds.some((id) => targetIds.has(id)))
    const normalWords = scopeWords.filter((w) => !w.characterIds.some((id) => targetIds.has(id)))
    return () => buildSimilarLettersWordQueue(confusionGroups, targetWords, normalWords, rounds)
  }, [isSimilarLetters, confusionGroups, scopeWords, rounds])

  const { queue, roundIndex, correctCount, setCorrectCount, finished, startMistakeReview, advance } =
    useGameSession({ ids: wordIds, weight: wordWeight, onFinish, resetSession, rounds, sessionKey, buildQueue })
  const { schedule: scheduleAdvance } = useDelayedAction()

  // Normal (non-Similar-Letters) Listening: real-word-distractor choices,
  // unchanged from before. Similar Letters Listening: generated kana-
  // spelling choices instead (see similarLettersSelection.ts) — the two are
  // mutually exclusive per round, only one of these two states is ever
  // populated for a given `isSimilarLetters`.
  const [choices, setChoices] = useState<AnchorWord[]>([])
  const [spellingChoices, setSpellingChoices] = useState<SpellingChoice[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSpellingKey, setSelectedSpellingKey] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  // Per-question romaji hint (see RomajiHint) — reset every round below so
  // revealing it never carries over to the next word.
  const [romajiHintShown, setRomajiHintShown] = useState(false)

  const currentWord = queue.length > 0 ? wordsById[queue[roundIndex]] : undefined

  // Same-script fallback pool for Similar Letters' tier-4 random
  // substitution (see buildSimilarLettersSpellingChoices) — every real
  // character of the target word's own script, excluding ー/っ/ッ and other
  // placeholder characters (identified by their `romaji: '-'` convention —
  // see characters.ts), so a fabricated wrong spelling never substitutes in
  // an unnatural/no-sound-in-isolation character. Also excludes composite
  // yōon characters (きゃ/しゃ/キャ/シャ etc. — anything whose `kana` is more
  // than one Unicode code point): substituting one of those in for a
  // single-glyph position (or vice versa) would change the fabricated
  // spelling's code-point length relative to the correct spelling. The
  // buildSimilarLettersSpellingChoices side additionally guards the
  // REPLACEABLE POSITIONS the same way for tiers 3/4, so this pool-side
  // filter and that position-side filter together fully close the gap.
  const sameScriptPool = useMemo(() => {
    if (!isSimilarLetters || !currentWord) return []
    const isKatakana = currentWord.characterIds.some((id) => id.startsWith('katakana-'))
    return Object.values(CHARACTERS_BY_ID)
      .filter((c) => c.id.startsWith('katakana-') === isKatakana && c.romaji !== '-' && Array.from(c.kana).length === 1)
      .map((c) => c.id)
  }, [isSimilarLetters, currentWord])

  useEffect(() => {
    if (!currentWord) return
    if (isSimilarLetters) {
      setSpellingChoices(
        buildSimilarLettersSpellingChoices(currentWord, confusionGroups, (id) => CHARACTERS_BY_ID[id]?.kana ?? '', sameScriptPool, 4),
      )
      setChoices([])
      setSelectedSpellingKey(null)
    } else {
      const distractors = pickDistractorWords(currentWord, scopeWords, 3)
      setChoices(shuffle([currentWord, ...distractors]))
      setSpellingChoices([])
    }
    setSelectedId(null)
    setAnswered(false)
    setRomajiHintShown(false)
    clear()
    speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)
    // Keyed on roundIndex too, not just currentWord.id — a small pool (e.g.
    // Review with only 1-2 weak words) can put the same word in
    // consecutive rounds, and this effect must still reset per-round state
    // even when the id doesn't change, or the next round renders already
    // "answered" from the previous one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord?.id, roundIndex])

  useEnterAdvance(
    isSimilarLetters ? answered && !spellingChoices.find((c) => c.key === selectedSpellingKey)?.isCorrect : answered && selectedId !== currentWord?.id,
    advance,
  )

  // Recommended Path completion — see KanaQuizPage's identical comment.
  // Similar Letters' synthetic row must never get a completion record (it's
  // outside Recommended Path — see PracticeHubPage's showRecommendedPath).
  useEffect(() => {
    if (finished && !isReview && !isSimilarLetters && rowId) markRowActivityCompleted(rowId, 'listening')
  }, [finished, isReview, isSimilarLetters, rowId, markRowActivityCompleted])

  const finishAnswer = (isCorrect: boolean) => {
    if (!currentWord) return
    // Listening can only judge the whole word right/wrong, not which
    // character was the actual mistake — so it feeds the Leitner box per
    // character (still meaningful: distractor words may differ in length
    // from the target, but this only drives unlock/practice weighting, not
    // Review) without touching character Review at all. Only the word
    // itself enters/leaves word Review — see the issue's "Listening:
    // Character Review: NO" requirement. `currentWord.id` is used
    // unconditionally here — a Similar Letters wrong spelling choice's `key`
    // is a UI-only ephemeral id and must never reach recordResult/
    // recordWordReviewResult/progressStore/Review/SRS.
    for (const charId of currentWord.characterIds) {
      recordResult(charId, isCorrect)
    }
    recordWordReviewResult(currentWord.id, isCorrect)
    if (isCorrect) {
      setCorrectCount((c) => c + 1)
      onCorrect()
      scheduleAdvance(advance, 2000)
    } else {
      onWrong({ id: currentWord.id, kana: currentWord.kana, romaji: currentWord.romaji })
    }
  }

  const handleChoice = (choice: AnchorWord) => {
    if (answered || !currentWord) return
    setSelectedId(choice.id)
    setAnswered(true)
    finishAnswer(choice.id === currentWord.id)
  }

  // Similar Letters mode only — `choice.key` is a UI-only ephemeral id (see
  // SpellingChoice), never passed to finishAnswer/recordWordReviewResult;
  // correctness comes from `choice.isCorrect`, and Review/SRS recording
  // below always uses `currentWord.id` via finishAnswer.
  const handleSpellingChoice = (choice: SpellingChoice) => {
    if (answered || !currentWord) return
    setSelectedSpellingKey(choice.key)
    setAnswered(true)
    finishAnswer(choice.isCorrect)
  }

  if (!rowId || (!isReview && !row)) return null
  // Not "scopeWords.length === 0 -> empty state" here: scopeWords is the
  // LIVE Review pool and can legitimately drop to 0 mid-session (every
  // queued word graduates during play) while the frozen session queue (see
  // useFrozenWordPool) still has an in-progress round to show — that case
  // must keep rendering the game, not bail out. The real "nothing to play"
  // check is `!currentWord` below, after a session had the chance to start.
  if (scopeWords.length === 0 && queue.length === 0) return isReview ? <ReviewEmptyState /> : null

  if (finished) {
    return (
      <PracticeSummary
        title="Listening complete!"
        stats={[{ label: 'Accuracy', value: `${Math.round((correctCount / queue.length) * 100)}%` }]}
        backHref={isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`}
        onRetry={() => setSessionAttempt((attempt) => attempt + 1)}
        mistakes={mistakes}
        onRetryMistakes={() => startMistakeReview(mistakeIds)}
        mood={finishMood ?? undefined}
        comment={finishFeedback?.text}
        continueAction={!isReview ? { label: 'Continue', to: `/practice/${categoryId}/${rowId}/word-builder` } : undefined}
      />
    )
  }

  if (!currentWord) return null

  return (
    <div className="flex flex-col items-center gap-6">
      <GameRoundHeader rowId={rowId} categoryId={categoryId} roundIndex={roundIndex} total={queue.length} />
      <div className="flex flex-col items-center gap-2">
        <WordImage word={currentWord} className="h-20 w-20" />
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{currentWord.meaning}</span>
        {!answered && (
          <RomajiHint
            romaji={currentWord.romaji}
            alwaysShow={alwaysShowRomajiHints}
            revealed={romajiHintShown}
            onReveal={() => setRomajiHintShown(true)}
          />
        )}
        {supported && (
          <button
            type="button"
            onClick={() => speak(`words/${currentWord.id}`, currentWord.audioText ?? currentWord.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
            🔊 Replay
          </button>
        )}
      </div>

      {isSimilarLetters ? (
        <div className="grid grid-cols-2 gap-3">
          {spellingChoices.map((choice) => {
            const isSelected = selectedSpellingKey === choice.key
            const showResult = answered && (isSelected || choice.isCorrect)
            return (
              <button
                key={choice.key}
                type="button"
                data-testid="spelling-choice"
                data-correct={choice.isCorrect}
                onClick={() => handleSpellingChoice(choice)}
                disabled={answered}
                className={`rounded-xl border-2 px-6 py-4 text-2xl font-bold transition ${
                  showResult
                    ? choice.isCorrect
                      ? 'border-green-500 bg-green-50 dark:bg-green-950'
                      : 'border-red-500 bg-red-50 dark:bg-red-950'
                    : 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'
                }`}
              >
                {/* No romaji shown for fake spelling choices — they're
                    fabricated display-only strings, never real vocabulary. */}
                <span className="font-kana block">{choice.kana}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {choices.map((choice) => {
            const isSelected = selectedId === choice.id
            const isTarget = choice.id === currentWord.id
            const showResult = answered && (isSelected || isTarget)
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => handleChoice(choice)}
                disabled={answered}
                className={`rounded-xl border-2 px-6 py-4 text-2xl font-bold transition ${
                  showResult
                    ? isTarget
                      ? 'border-green-500 bg-green-50 dark:bg-green-950'
                      : 'border-red-500 bg-red-50 dark:bg-red-950'
                    : 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'
                }`}
              >
                <span className="font-kana block">{choice.kana}</span>
                {answered && (
                  <span className="block text-sm font-normal text-neutral-500 dark:text-neutral-400">
                    {choice.romaji}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <AnswerFeedbackRow feedback={feedback} mood={mood} />

      {answered &&
        (isSimilarLetters
          ? !spellingChoices.find((c) => c.key === selectedSpellingKey)?.isCorrect
          : selectedId !== currentWord.id) && (
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
