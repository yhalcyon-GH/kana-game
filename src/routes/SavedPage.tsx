import { Link } from 'react-router-dom'
import { CharacterCard } from '../components/CharacterCard'
import { SaveCharacterToggle } from '../components/SaveCharacterToggle'
import { SaveWordToggle } from '../components/SaveWordToggle'
import { WordCard } from '../components/WordCard'
import { CHARACTERS_BY_ID } from '../data/characters'
import { WORDS_BY_ID } from '../data/words'
import { useSavedItemsStore } from '../store/savedItemsStore'

// Learner-curated list of Characters/Words manually Saved from Learn or
// after a Practice mistake — see savedItemsStore.ts. Entirely independent
// of Review/SRS: an item can leave Review (graduate, or never have been
// weak at all) and still show up here, since only unchecking its own Saved
// box removes it. Ids only are persisted; display data is always looked up
// live from CHARACTERS_BY_ID/WORDS_BY_ID here, same as everywhere else in
// the app, so a saved id whose card content changes upstream never goes
// stale.
export function SavedPage() {
  const savedCharacterIds = useSavedItemsStore((s) => s.savedCharacterIds)
  const savedWordIds = useSavedItemsStore((s) => s.savedWordIds)

  const savedCharacters = savedCharacterIds.map((id) => CHARACTERS_BY_ID[id]).filter(Boolean)
  const savedWords = savedWordIds.map((id) => WORDS_BY_ID[id]).filter(Boolean)
  const isEmpty = savedCharacters.length === 0 && savedWords.length === 0

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
      <Link
        to="/"
        className="self-start rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:border-blue-400 hover:text-neutral-900 dark:border-neutral-600 dark:text-neutral-300 dark:hover:text-neutral-100"
      >
        ← Home
      </Link>
      <h1 className="text-2xl font-bold">🔖 Saved</h1>

      {isEmpty ? (
        <p className="text-neutral-500 dark:text-neutral-400">Nothing saved yet.</p>
      ) : (
        <>
          {savedCharacters.length > 0 && (
            <div className="flex w-full flex-col items-center gap-4">
              <h2 className="text-xl font-semibold">Characters</h2>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
                {savedCharacters.map((char) => (
                  <div key={char.id} className="flex flex-col items-center gap-1">
                    <CharacterCard char={char} />
                    <SaveCharacterToggle characterId={char.id} kana={char.kana} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {savedWords.length > 0 && (
            <div className="flex w-full flex-col items-center gap-4">
              <h2 className="text-xl font-semibold">Words</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {savedWords.map((word) => (
                  <div key={word.id} className="flex flex-col items-center gap-1">
                    <WordCard word={word} />
                    <SaveWordToggle wordId={word.id} kana={word.kana} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
