import { RowMap } from '../components/RowMap'
import { useCurriculum } from '../hooks/useCurriculum'
import { useProgressStore } from '../store/progressStore'

type Props = {
  title: string
  description: string
  // Which categories' rows to show on this page — a plain array rather
  // than a single categoryId since "その他" bundles several categories
  // (sokuon/chōon/yōon/特殊音) into one page. See App.tsx for how each of
  // the three pages (hiragana/katakana/other) instantiates this with a
  // different list.
  categoryIds: string[]
}

// One row-map page per top-level script group (see App.tsx's three routes)
// — replaces the single HomePage that used to show every category's rows
// stacked in one page. HomePage itself is now just a chooser linking here.
export function CategoryRowsPage({ title, description, categoryIds }: Props) {
  const { rows, isRowUnlocked, isRowTaught } = useCurriculum()
  const isRowMastered = useProgressStore((s) => s.isRowMastered)
  // Subscribed so mastery badges refresh even when only `characters`
  // changes (e.g. practicing an already-taught row) without touching
  // unlockedRowIds/taughtRowIds, which isRowMastered doesn't itself track.
  useProgressStore((s) => s.characters)

  const categoryRows = rows.filter((r) => categoryIds.includes(r.categoryId))

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="max-w-md text-center text-neutral-500 dark:text-neutral-400">{description}</p>
      {categoryRows.length > 0 ? (
        <RowMap rows={categoryRows} isUnlocked={isRowUnlocked} isTaught={isRowTaught} isMastered={isRowMastered} />
      ) : (
        <p className="text-neutral-400 dark:text-neutral-500">まだ利用できるレッスンがありません。</p>
      )}
    </div>
  )
}
