import { CATEGORIES_BY_ID } from '../data/curriculum'
import { RowMap } from '../components/RowMap'
import { useCurriculum } from '../hooks/useCurriculum'
import { useProgressStore } from '../store/progressStore'

type Props = {
  title: string
  description: string
  // Which categories' rows to show on this page — a plain array rather
  // than a single categoryId since "その他" bundles several categories
  // (sokuon/chōon) into one page. See App.tsx for how each page
  // (hiragana/katakana/youon/other) instantiates this with a different list.
  categoryIds: string[]
}

// One row-map page per top-level script group (see App.tsx's four routes)
// — replaces the single HomePage that used to show every category's rows
// stacked in one page. HomePage itself is now just a chooser linking here.
export function CategoryRowsPage({ title, description, categoryIds }: Props) {
  const { rows, isRowUnlocked, isRowTaught, globalRecommendedTarget } = useCurriculum()
  const isRowMastered = useProgressStore((s) => s.isRowMastered)
  const isRowRecommended = (rowId: string) => globalRecommendedTarget?.rowId === rowId
  // Subscribed so mastery badges refresh even when only `characters`
  // changes (e.g. practicing an already-taught row) without touching
  // unlockedRowIds/taughtRowIds, which isRowMastered doesn't itself track.
  useProgressStore((s) => s.characters)

  const categoryRows = rows.filter((r) => categoryIds.includes(r.categoryId) && !r.isSummary)
  // Summary rows (⭐, one per page — see GojuonRow.isSummary) render in
  // their own un-headed section below every category's rows, rather than
  // inside one category's group, since a multi-category page's summary
  // (その他's, combining 促音+長音) doesn't belong to just one of them.
  const summaryRows = rows.filter((r) => categoryIds.includes(r.categoryId) && r.isSummary)

  // Grouped by category (in categoryIds' given order) rather than one flat
  // grid, so a multi-category page like その他 (sokuon + chōon) can show
  // each category's own heading + English `explanation` above just its own
  // rows — a single-category page's own H1 already names it, so the
  // per-category heading only renders when there's more than one group to
  // tell apart.
  const groups = categoryIds
    .map((categoryId) => ({
      category: CATEGORIES_BY_ID[categoryId],
      rows: categoryRows.filter((r) => r.categoryId === categoryId),
    }))
    .filter((g) => g.rows.length > 0)

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="max-w-md text-center text-neutral-500 dark:text-neutral-400">{description}</p>
      {groups.length > 0 ? (
        groups.map(({ category, rows: groupRows }) => (
          <div key={category?.id} className="flex w-full flex-col items-center gap-4">
            {/* displayLabel (○+っ, ○+ー, ...) instead of the real kanji
                `label` (促音, 長音, ...) — the target audience may not read
                ANY kana yet, let alone kanji, see ScriptCategory.displayLabel's
                comment. No .font-kana here either way, since displayLabel's
                '+'/'○' aren't in the hand-subsetted kana-only webfont. */}
            {groups.length > 1 && <h2 className="text-xl font-semibold">{category?.displayLabel ?? category?.label}</h2>}
            {category?.explanation && (
              <p className="max-w-xl text-center text-sm text-neutral-500 dark:text-neutral-400">{category.explanation}</p>
            )}
            <RowMap
              rows={groupRows}
              isUnlocked={isRowUnlocked}
              isTaught={isRowTaught}
              isMastered={isRowMastered}
              isRecommended={isRowRecommended}
            />
          </div>
        ))
      ) : (
        <p className="text-neutral-400 dark:text-neutral-500">まだ利用できるレッスンがありません。</p>
      )}
      {summaryRows.length > 0 && (
        <RowMap rows={summaryRows} isUnlocked={isRowUnlocked} isTaught={isRowTaught} isMastered={isRowMastered} />
      )}
    </div>
  )
}
