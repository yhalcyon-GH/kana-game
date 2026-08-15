import { Link } from 'react-router-dom'
import { CATEGORIES_BY_ID, getCategoryPagePath, getNextRowId, getPreviousRowId, ROWS_BY_ID } from '../data/curriculum'

type Props = {
  rowId: string
  categoryId: string
}

// Shown at the top of the Practice Hub so a learner isn't stuck with only
// "back to this exact row" or "all the way home" — the gap the user
// reported (after practicing カ行, there was no way back to カタカナ's full
// row list without detouring through Home). Home -> category page -> this
// row, plus prev/next-row quick links using the row's `englishLabel` (a
// short romaji session name) so a learner who can't yet read the row's own
// kana `label` can still tell rows apart while navigating between them.
export function HubBreadcrumb({ rowId, categoryId }: Props) {
  const row = ROWS_BY_ID[rowId]
  const category = CATEGORIES_BY_ID[categoryId]
  if (!row || !category) return null

  const prevRow = getPreviousRowId(rowId)
  const nextRow = getNextRowId(rowId)
  const prev = prevRow ? ROWS_BY_ID[prevRow] : undefined
  const next = nextRow ? ROWS_BY_ID[nextRow] : undefined

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center justify-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400"
      >
        <Link to="/" className="hover:text-blue-600 dark:hover:text-blue-400">
          🏠 Home
        </Link>
        <span aria-hidden="true">›</span>
        <Link to={getCategoryPagePath(categoryId)} className="hover:text-blue-600 dark:hover:text-blue-400">
          {category.icon} {category.displayLabel ?? category.label}
        </Link>
        <span aria-hidden="true">›</span>
        <span className="font-semibold text-neutral-700 dark:text-neutral-200">{row.englishLabel ?? row.label}</span>
      </nav>
      {(prev || next) && (
        <div className="flex w-full items-center justify-between text-sm">
          {prev ? (
            <Link
              to={`/practice/${categoryId}/${prev.id}`}
              className="text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
            >
              ‹ {prev.englishLabel ?? prev.label}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to={`/practice/${categoryId}/${next.id}`}
              className="text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
            >
              {next.englishLabel ?? next.label} ›
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  )
}
