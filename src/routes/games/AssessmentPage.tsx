import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { AnchorWord } from '../../data/types'
import { useAssessmentSession } from '../../hooks/useAssessmentSession'
import type { AssessmentAnswer, AssessmentScript } from '../../lib/assessment/types'
import { useProgressStore } from '../../store/progressStore'
import { AssessmentKanaQuizQuestion } from './assessment/AssessmentKanaQuizQuestion'
import { AssessmentListeningQuestion } from './assessment/AssessmentListeningQuestion'
import { AssessmentResults } from './assessment/AssessmentResults'
import { AssessmentWordBuilderQuestion } from './assessment/AssessmentWordBuilderQuestion'
import { AssessmentWordReadingQuestion } from './assessment/AssessmentWordReadingQuestion'

type Props = {
  script: AssessmentScript
}

function AssessmentHeader({ script, index, total }: { script: AssessmentScript; index: number; total: number }) {
  const backHref = script === 'hiragana' ? '/hiragana' : '/katakana'
  return (
    <div className="flex w-full max-w-md items-center justify-between">
      <Link
        to={backHref}
        className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:border-blue-400 hover:text-neutral-900 dark:border-neutral-600 dark:text-neutral-300 dark:hover:text-neutral-100"
      >
        ← Back
      </Link>
      <p className="text-center text-xs text-neutral-500">
        Question {index + 1} / {total}
      </p>
      <span className="w-16" aria-hidden="true" />
    </div>
  )
}

// The Hiragana/Katakana Test (Issue #189): a shared assessment engine driven
// by a deterministic 20-question plan (see lib/assessment/planner.ts),
// rendering one of the 4 assessment-family question views per question and
// scoring the whole run once every question has an answer (see
// hooks/useAssessmentSession.ts). This page owns only sequencing/scoring
// plumbing — each question view owns its own prompt/answer-capture UI.
export function AssessmentPage({ script }: Props) {
  const session = useAssessmentSession(script)
  const markAssessmentCompleted = useProgressStore((s) => s.markAssessmentCompleted)

  // Finishing all 20 questions completes the test regardless of score
  // (Issue #189) — fires once per completion (including a later retake,
  // since `finished` cycles back to false via restart() first).
  useEffect(() => {
    if (session.finished) markAssessmentCompleted(script)
  }, [session.finished, script, markAssessmentCompleted])

  const wordsById = useMemo<Record<string, AnchorWord>>(
    () => Object.fromEntries(session.scope.words.map((word) => [word.id, word])),
    [session.scope],
  )

  if (session.finished) {
    return session.result ? (
      <AssessmentResults script={script} result={session.result} advice={session.advice} onRetry={session.restart} />
    ) : null
  }

  const question = session.currentQuestion
  if (!question) return null
  const answered = session.answers.length > session.index

  function handleAnswer(correct: boolean) {
    if (!question) return
    const answer: AssessmentAnswer = {
      questionId: question.id,
      family: question.family,
      correct,
      coveredCharIds: question.coveredCharIds,
      targetWordId: 'targetWordId' in question ? question.targetWordId : undefined,
    }
    session.submitAnswer(answer)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <AssessmentHeader script={script} index={session.index} total={session.total} />

      {/* Keyed on attempt too, not just question.id — question ids are
          `${family}-${cursor}`, stable per-position within a plan but NOT
          globally unique across a retake, so a bare question.id key could
          collide with the previous attempt's question at the same position
          and skip remounting (leaving stale answered/selection state). */}
      <div key={`${session.attempt}-${question.id}`} className="flex w-full flex-col items-center gap-6">
        {question.family === 'kana-quiz' && <AssessmentKanaQuizQuestion question={question} onAnswer={handleAnswer} />}
        {question.family === 'listening' && (
          <AssessmentListeningQuestion question={question} wordsById={wordsById} onAnswer={handleAnswer} />
        )}
        {question.family === 'word-builder' && (
          <AssessmentWordBuilderQuestion question={question} wordsById={wordsById} onAnswer={handleAnswer} />
        )}
        {question.family === 'word-reading' && (
          <AssessmentWordReadingQuestion question={question} wordsById={wordsById} onAnswer={handleAnswer} />
        )}
      </div>

      {answered && (
        <button
          type="button"
          onClick={session.advance}
          data-testid="assessment-next-question"
          className="min-w-[9rem] rounded-full bg-blue-600 px-6 py-2 text-center font-semibold text-white hover:bg-blue-700"
        >
          Next Question
        </button>
      )}
    </div>
  )
}
