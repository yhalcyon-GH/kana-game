import { useSavedItemsStore } from '../store/savedItemsStore'
import { SaveToggle } from './SaveToggle'

type Props = {
  wordId: string
  // The word's own kana, for the checkbox's accessible name.
  kana: string
}

export function SaveWordToggle({ wordId, kana }: Props) {
  const isSaved = useSavedItemsStore((s) => s.isWordSaved(wordId))
  const toggleWord = useSavedItemsStore((s) => s.toggleWord)
  return (
    <SaveToggle
      checked={isSaved}
      onChange={() => toggleWord(wordId)}
      ariaLabel={`${isSaved ? 'Saved' : 'Save'} ${kana}`}
    />
  )
}
