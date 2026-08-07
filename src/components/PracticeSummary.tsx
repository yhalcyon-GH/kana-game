import { Link } from 'react-router-dom'
import { ProgressBadge } from './ProgressBadge'

type Stat = { label: string; value: string | number }

type Props = {
  title: string
  stats: Stat[]
  backHref: string
  onRetry: () => void
}

// Shared end-of-session screen for all four mini-games.
export function PracticeSummary({ title, stats, backHref, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="flex flex-wrap justify-center gap-3">
        {stats.map((s) => (
          <ProgressBadge key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Play again
        </button>
        <Link
          to={backHref}
          className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
        >
          Back to hub
        </Link>
      </div>
    </div>
  )
}
