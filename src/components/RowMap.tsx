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
            className={`flex h-full flex-col items-center justify-center gap-2 rounded-xl text-center transition-colors ${row.displayLines ? 'p-3' : 'p-4'} ${row.isSummary || row.isSimilarLetters ? 'border-2' : 'border'} ${
              unlocked
                ? row.isSummary
                  ? 'border-neutral-300 bg-white group-hover:border-red-400 group-hover:bg-red-50 group-active:bg-red-100 dark:border-neutral-600 dark:bg-neutral-800 dark:group-hover:border-red-500 dark:group-hover:bg-red-950/30 dark:group-active:bg-red-950/50'
                  : row.isSimilarLetters
                    ? 'border-neutral-300 bg-white group-hover:border-purple-400 group-hover:bg-purple-50 group-active:bg-purple-100 dark:border-neutral-600 dark:bg-neutral-800 dark:group-hover:border-purple-500 dark:group-hover:bg-purple-950/30 dark:group-active:bg-purple-950/50'
                    : 'border-neutral-300 bg-white group-hover:border-blue-400 group-hover:bg-blue-50 group-active:bg-blue-100 dark:border-neutral-600 dark:bg-neutral-800 dark:group-hover:border-blue-500 dark:group-hover:bg-blue-950/30 dark:group-active:bg-blue-950/50'
                : 'border-neutral-200 bg-neutral-50 opacity-50 dark:border-neutral-800 dark:bg-neutral-900'
            }`}
          >
            <span className={`font-kana font-semibold ${row.displayLines ? 'text-sm sm:text-lg' : 'text-lg'}`}>
              {row.isSummary && '📋 '}
              {row.isSimilarLetters && '🔍 '}
              {row.displayLines
                ? row.displayLines.map((line) => (
                    <span key={line} className="block whitespace-nowrap">
                      {line}
                    </span>
                  ))
                : row.label}
            </span>
            {!row.isSimilarLetters && !row.isSummary && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {!unlocked ? '🔒 locked' : mastered ? '👍' : taught ? '📗 learned' : '📘 new'}
              </span>
            )}
            {recommended && <RecommendedLabel />}
          </div>
        )

        const framedCard = recommended ? <RecommendedFrame className="h-full">{card}</RecommendedFrame> : card

        return (
          <div key={row.id} className="h-full">
            {unlocked ? (
              <Link
                to={`/practice/${row.categoryId}/${row.id}`}
                className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400"
              >
                {framedCard}
              </Link>
            ) : (
              framedCard
            )}
          </div>
        )
      })}
    </div>
  )
}
