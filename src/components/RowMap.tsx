import { Link } from 'react-router-dom'
import type { GojuonRow } from '../data/types'
import { RecommendedFrame, RecommendedLabel } from './Recommended'

type Props = {
  rows: GojuonRow[]
  isUnlocked: (rowId?: string) => boolean
  isTaught: (rowId: string) => boolean
  isMastered: (rowId: string) => boolean
  // Whether this row is currently the single Global Recommended Target
  // (Issue #25) — optional so callers with no Recommended concept (none
  // today) can omit it; every row is non-recommended by default.
  isRecommended?: (rowId: string) => boolean
}

export function RowMap({ rows, isUnlocked, isTaught, isMastered, isRecommended }: Props) {
  return (
    <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
      {rows.map((row) => {
        const unlocked = isUnlocked(row.id)
        const taught = isTaught(row.id)
        const mastered = isMastered(row.id)
        const recommended = isRecommended?.(row.id) ?? false

        const card = (
          <div
            className={`flex h-full flex-col items-center gap-2 rounded-xl p-4 text-center ${row.isSummary ? 'border-2' : 'border'} ${
              unlocked
                ? 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800'
                : 'border-neutral-200 bg-neutral-50 opacity-50 dark:border-neutral-800 dark:bg-neutral-900'
            }`}
          >
            <span className="font-kana text-lg font-semibold">
              {row.isSummary && '⭐ '}
              {row.label}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {row.isSummary ? 'summary' : !unlocked ? '🔒 locked' : mastered ? '👍' : taught ? '📗 learned' : '📘 new'}
            </span>
            {recommended && <RecommendedLabel />}
            {/* Learn and both mini-games all live together on the row's hub
                page — taught status is informational only, not a gate. */}
            {unlocked && (
              <Link
                to={`/practice/${row.categoryId}/${row.id}`}
                className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${
                  row.isSummary ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Open
              </Link>
            )}
          </div>
        )

        return (
          <div key={row.id}>
            {recommended ? <RecommendedFrame className="h-full">{card}</RecommendedFrame> : card}
          </div>
        )
      })}
    </div>
  )
}
