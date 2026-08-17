import { Link } from 'react-router-dom'
import type { GojuonRow } from '../data/types'

type Props = {
  rows: GojuonRow[]
  isUnlocked: (rowId?: string) => boolean
  isTaught: (rowId: string) => boolean
  isMastered: (rowId: string) => boolean
}

export function RowMap({ rows, isUnlocked, isTaught, isMastered }: Props) {
  return (
    <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
      {rows.map((row) => {
        const unlocked = isUnlocked(row.id)
        const taught = isTaught(row.id)
        const mastered = isMastered(row.id)

        return (
          <div
            key={row.id}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center ${
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
              {row.isSummary ? '⭐ summary' : !unlocked ? '🔒 locked' : mastered ? '🌟 mastered' : taught ? '📗 taught' : '📘 new'}
            </span>
            {/* Learn and both mini-games all live together on the row's hub
                page — taught status is informational only, not a gate. */}
            {unlocked && (
              <Link
                to={`/practice/${row.categoryId}/${row.id}`}
                className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Open
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
