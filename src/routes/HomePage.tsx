import { RowMap } from '../components/RowMap'
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
        Learn hiragana one row at a time, paired with real everyday words.
      </p>
      <RowMap rows={rows} isUnlocked={isRowUnlocked} isTaught={isRowTaught} isMastered={isRowMastered} />
    </div>
  )
}
