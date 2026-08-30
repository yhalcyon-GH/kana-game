import { useSavedItemsStore } from '../store/savedItemsStore'
import { SaveToggle } from './SaveToggle'

type Props = {
  characterId: string
  // The character's own kana, for the checkbox's accessible name.
  kana: string
}

export function SaveCharacterToggle({ characterId, kana }: Props) {
  const isSaved = useSavedItemsStore((s) => s.isCharacterSaved(characterId))
  const toggleCharacter = useSavedItemsStore((s) => s.toggleCharacter)
  return (
    <SaveToggle
      checked={isSaved}
      onChange={() => toggleCharacter(characterId)}
      ariaLabel={`${isSaved ? 'Saved' : 'Save'} ${kana}`}
    />
  )
}
