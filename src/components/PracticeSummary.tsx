import { Link } from 'react-router-dom'
import { PARENTHESIZED_CHARACTER_IDS } from '../data/characters'
import { Mascot, type MascotMood } from './Mascot'
import { ProgressBadge } from './ProgressBadge'

type Stat = { label: string; value: string | number }
type MistakeEntry = { id: string; kana: string; romaji: string }

type Props = {
  title: string
  stats: Stat[]
  backHref: string
  onRetry: () => void
  // Every distinct item missed this session, and a callback to immediately
  // start a fresh round covering just those — omitted (or empty) when
  // nothing was missed.
  mistakes?: MistakeEntry[]
  onReviewMistakes?: () => void
  // Tamamizu's reaction to the whole session (see useAnswerFeedback's
  // onFinish/finishMood) — omitted for the ungraded games (Tracing), which
  // have no mistake count to react to.
  mood?: MascotMood
  comment?: string
}

// Shared end-of-session screen for all five mini-games.
export function PracticeSummary({
  title,
  stats,
  backHref,
  onRetry,
  mistakes = [],
  onReviewMistakes,
  mood,
  comment,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold">{title}</h2>
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

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Play again
        </button>
        {mistakes.length > 0 && onReviewMistakes && (
          <button
            type="button"
            onClick={onReviewMistakes}
            className="rounded-full bg-amber-500 px-6 py-2 font-semibold text-white hover:bg-amber-600"
          >
            Review {mistakes.length} mistake{mistakes.length === 1 ? '' : 's'}
          </button>
        )}
        <Link
          to={backHref}
          className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
        >
          Back to hub
        </Link>
      </div>

      {/* Tamamizu's reaction sits at the bottom of the screen, below the
          actions — moved here from the top at the user's explicit request. */}
      {mood && (
        <div className="flex flex-col items-center gap-2">
          <Mascot mood={mood} />
          {comment && <p className="text-lg font-semibold">{comment}</p>}
        </div>
      )}
    </div>
  )
}
