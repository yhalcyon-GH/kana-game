import { Link } from 'react-router-dom'
import { getNextRowId, getPreviousRowId, ROWS_BY_ID } from '../data/curriculum'

type Props = {
  rowId: string
  categoryId: string
}

// Shown at the top of the Practice Hub: prev/next-row quick links using the
// row's `englishLabel` (a short romaji session name) so a learner who can't
// yet read the row's own kana `label` can still tell rows apart while
// navigating between them. (Used to also show a Home/category/row breadcrumb
// trail, dropped once NavBar's script-jump row made it redundant for
// section-level navigation.)
export function HubBreadcrumb({ rowId, categoryId }: Props) {
  const row = ROWS_BY_ID[rowId]
  if (!row) return null

  const prevRow = getPreviousRowId(rowId)
  const nextRow = getNextRowId(rowId)
  const prev = prevRow ? ROWS_BY_ID[prevRow] : undefined
  const next = nextRow ? ROWS_BY_ID[nextRow] : undefined

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
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
