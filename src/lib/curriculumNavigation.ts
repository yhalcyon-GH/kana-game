import { CATEGORIES, ROWS } from '../data/curriculum'
import type { GojuonRow } from '../data/types'

// Recommended Path walks categories in CATEGORIES order and real rows in
// per-category `order`. Restaurant/Cafe checkpoints can sit after the final
// row of a category, so their post-session Next action needs the next row in
// that global sequence rather than getNextRowId(), which is intentionally
// category-scoped.
export function getNextGlobalRealRow(rowId: string): GojuonRow | null {
  const orderedRows = CATEGORIES.flatMap((category) =>
    ROWS.filter((row) => row.categoryId === category.id && !row.isSummary && !row.isSimilarLetters).sort(
      (a, b) => a.order - b.order,
    ),
  )
  const index = orderedRows.findIndex((row) => row.id === rowId)
  return index >= 0 ? (orderedRows[index + 1] ?? null) : null
}
