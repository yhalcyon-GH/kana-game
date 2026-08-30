import { Link } from 'react-router-dom'
import { getNextRowId, getPreviousRowId, ROWS_BY_ID } from '../data/curriculum'

type Props = {
  rowId: string
  // No longer read here — prev/next now link via each target row's OWN
  // categoryId (see below), which can legitimately differ from the current
  // row's. Kept in the prop type since every call site already has it
  // sitting right there anyway.
  categoryId: string
}

// Shown at the top of the Practice Hub: prev/next-row quick links using the
// row's `englishLabel` (a short romaji session name) so a learner who can't
// yet read the row's own kana `label` can still tell rows apart while
// navigating between them. (Used to also show a Home/category/row breadcrumb
// trail, dropped once NavBar's script-jump row made it redundant for
// section-level navigation.)
export function HubBreadcrumb({ rowId }: Props) {
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
            // prev.categoryId, not the current row's own `categoryId` prop —
            // usually the same category, but getPreviousRowId can now cross
            // into a different one (Special Katakana's first session steps
            // back into Yōon's last row — see curriculum.ts's
            // CROSS_CATEGORY_NEXT_ROW), and /practice/:categoryId/:rowId
            // requires the two to actually match (PracticeHubPage redirects
            // home otherwise).
            <Link
              to={`/practice/${prev.categoryId}/${prev.id}`}
              className="text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
            >
              ‹ {prev.englishLabel ?? prev.label}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            // next.categoryId — see the identical `prev` comment above.
            <Link
              to={`/practice/${next.categoryId}/${next.id}`}
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
