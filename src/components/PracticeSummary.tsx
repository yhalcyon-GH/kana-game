import { Link, useLocation } from 'react-router-dom'
import { PARENTHESIZED_CHARACTER_IDS } from '../data/characters'
import { useCurriculum } from '../hooks/useCurriculum'
import { useProgressStore } from '../store/progressStore'
import { Mascot, type MascotMood } from './Mascot'
import { ProgressBadge } from './ProgressBadge'
import { ReviewGuide } from './ReviewGuide'

type Stat = { label: string; value: string | number }
type MistakeEntry = { id: string; kana: string; romaji: string }
// Explicit correct/total counts for graded sessions (Kana Quiz, Listening,
// Word Builder, Kana Typing) — rendered as "{total}問中{correct}問正解"
// instead of a computed Accuracy percentage/fraction. The four graded game
// routes pass the real played queue length as `total`, so Retry/Review
// sessions (which can be shorter than a normal 8/15-question session) still
// show the actual count played, never a fixed nominal length.
type Score = { correct: number; total: number }

type Props = {
  title: string
  // Generic labeled stats for ungraded flows (Tracing) that have no
  // correct/total score to show — graded Practice should use `score`
  // instead. Omitted (defaults to none) when a summary has nothing generic
  // to show.
  stats?: Stat[]
  backHref: string
  onRetry: () => void
  // Every distinct item missed this session, and a callback to immediately
  // start a fresh round covering just those (ephemeral, not the persisted
  // global Review pool) — omitted (or empty) when nothing was missed.
  mistakes?: MistakeEntry[]
  onRetryMistakes?: () => void
  // Tamamizu's reaction to the whole session (see useAnswerFeedback's
  // onFinish/finishMood) — omitted for the ungraded games (Tracing), which
  // have no mistake count to react to.
  mood?: MascotMood
  comment?: string
  // Explicit correct/total count for graded Practice sessions — see Score's
  // comment above. Omitted for ungraded flows (Tracing).
  score?: Score
  // Recommended Path's primary next step (see lib/recommendedPath.ts) —
  // when present, becomes the prominent primary button and Play again
  // demotes to a secondary action alongside Back to hub. Omitted whenever
  // there's no next recommended step to send the learner to (Review
  // sessions, or Word Builder finishing the last row in a category).
  continueAction?: { label: string; to: string }
}

// Shared end-of-session screen for all five mini-games.
export function PracticeSummary({
  title,
  stats = [],
  backHref,
  onRetry,
  mistakes = [],
  onRetryMistakes,
  mood,
  comment,
  score,
  continueAction,
}: Props) {
  const { reviewCount } = useCurriculum()
  const hasCompletedReviewGuide = useProgressStore((s) => s.hasCompletedReviewGuide)
  const { pathname } = useLocation()
  const showReviewGuide = !hasCompletedReviewGuide && reviewCount > 0 && !pathname.startsWith('/practice/review')

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold">{title}</h2>

      {/* Tamamizu's session reaction, moved here from the bottom (below the
          action buttons) so graded Practice reads title -> Tamamizu ->
          score -> comment. Appears at most once per summary. */}
      {(mood || score) && (
        <div className="flex flex-col items-center gap-2">
          {mood && <Mascot mood={mood} />}
          {score && (
            <p className="text-xl font-bold sm:text-2xl">
              {score.total}問中{score.correct}問正解
            </p>
          )}
          {comment && <p className="text-lg font-semibold">{comment}</p>}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {stats.map((s) => (
          <ProgressBadge key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {mistakes.length > 0 && (
        <div className="w-full max-w-xs rounded-xl border border-neutral-300 bg-white p-3 text-sm dark:border-neutral-600 dark:bg-neutral-800">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300">
            Missed this round ({mistakes.length})
          </span>
          <ul className="mt-2 flex flex-col gap-1">
            {mistakes.map((m) => (
              <li key={m.id} className="flex justify-between gap-3 text-neutral-600 dark:text-neutral-400">
                <span className="font-kana font-semibold text-neutral-800 dark:text-neutral-200">
                  {PARENTHESIZED_CHARACTER_IDS.has(m.id) ? `（${m.kana}）` : m.kana}
                </span>
                <span>{m.romaji}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showReviewGuide && <ReviewGuide />}

      <div className="flex flex-wrap justify-center gap-3">
        {/* Item 9: when both actions exist, always [ Play Again ] [ Continue
            ] in that literal DOM order, side by side in their own paired
            row — Play Again secondary, Continue stays primary blue. With no
            continueAction, Play Again alone keeps its previous primary
            styling. */}
        {continueAction ? (
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="min-w-[9rem] rounded-full border border-neutral-300 px-6 py-2 text-center font-semibold hover:border-blue-400 dark:border-neutral-600"
            >
              Play Again
            </button>
            <Link
              to={continueAction.to}
              className="min-w-[9rem] rounded-full bg-blue-600 px-6 py-2 text-center font-semibold text-white hover:bg-blue-700"
            >
              {continueAction.label}
            </Link>
          </div>
        ) : (
          <button
            type="button"
            onClick={onRetry}
            className="min-w-[9rem] rounded-full bg-blue-600 px-6 py-2 text-center font-semibold text-white hover:bg-blue-700"
          >
            Play again
          </button>
        )}
        {mistakes.length > 0 && onRetryMistakes && (
          <button
            type="button"
            onClick={onRetryMistakes}
            className="min-w-[9rem] rounded-full bg-green-600 px-6 py-2 text-center font-semibold text-white hover:bg-green-700"
          >
            Retry
          </button>
        )}
        <Link
          to={backHref}
          className="min-w-[9rem] rounded-full border border-neutral-300 px-6 py-2 text-center font-semibold hover:border-blue-400 dark:border-neutral-600"
        >
          Back to hub
        </Link>
      </div>
    </div>
  )
}
