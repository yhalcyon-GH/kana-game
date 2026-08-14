import { RowMap } from '../components/RowMap'
import { CATEGORIES } from '../data/curriculum'
import { useCurriculum } from '../hooks/useCurriculum'
import { useProgressStore } from '../store/progressStore'

export function HomePage() {
  const { rows, isRowUnlocked, isRowTaught } = useCurriculum()
  const isRowMastered = useProgressStore((s) => s.isRowMastered)
  // Subscribed so mastery badges refresh even when only `characters`
  // changes (e.g. practicing an already-taught row) without touching
  // unlockedRowIds/taughtRowIds, which isRowMastered doesn't itself track.
  useProgressStore((s) => s.characters)

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold">Kana Game</h1>
      <p className="max-w-md text-center text-neutral-500 dark:text-neutral-400">
        Learn hiragana and katakana one row at a time, paired with real everyday words.
      </p>
      {/* `rows` (useCurriculum) is a single flat list across every category
          — grouped and labeled here rather than in RowMap itself, since
          RowMap's job is just "render this set of row cards" and shouldn't
          need to know about categories. Without this grouping, a second
          category's rows would render interleaved into one undifferentiated
          grid alongside hiragana's, with no visual indication they're a
          different script. */}
      {CATEGORIES.map((category) => {
        const categoryRows = rows.filter((r) => r.categoryId === category.id)
        if (categoryRows.length === 0) return null
        return (
          <div key={category.id} className="flex w-full max-w-2xl flex-col items-center gap-3">
            <h2 className="self-start text-sm font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
              {category.label}
            </h2>
            <RowMap rows={categoryRows} isUnlocked={isRowUnlocked} isTaught={isRowTaught} isMastered={isRowMastered} />
          </div>
        )
      })}
    </div>
  )
}
