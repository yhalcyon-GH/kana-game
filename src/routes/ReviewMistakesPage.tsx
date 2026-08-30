import { useState } from 'react'
import { BackToHubLink } from '../components/BackToHubLink'
import { CharacterCard } from '../components/CharacterCard'
import { WordCard } from '../components/WordCard'
import { CHARACTERS_BY_ID } from '../data/characters'
import { REVIEW_SCOPE_ID, useCurriculum } from '../hooks/useCurriculum'

const BATCH_SIZE = 10

type Props = {
  // 'chars' = 単音 (weak single-sound characters), 'words' = 語彙 (weak
  // vocabulary) — see useCurriculum's weakCharacterIds/weakWords.
  kind: 'chars' | 'words'
}

// A browse-only (no quiz, no correct/incorrect) list of everything the
// learner has actually been getting wrong lately, split into 単音/語彙 per
// the user's request — Learn's flashcard step already covers "meet a new
// character," this is "revisit ones you're struggling with," so it reuses
// CharacterCard/WordCard (tap to hear) rather than any quiz mechanic.
// Batched 10 at a time since a learner with many weak items would otherwise
// face one huge grid.
export function ReviewMistakesPage({ kind }: Props) {
  const { weakCharacterIds, weakWords } = useCurriculum()
  const [batchIndex, setBatchIndex] = useState(0)

  const totalCount = kind === 'chars' ? weakCharacterIds.length : weakWords.length
  const totalBatches = Math.max(1, Math.ceil(totalCount / BATCH_SIZE))
  const currentBatch = Math.min(batchIndex, totalBatches - 1)
  const start = currentBatch * BATCH_SIZE

  const title = kind === 'chars' ? 'Weak Kana' : 'Weak Words'

  return (
    <div className="flex flex-col items-center gap-6">
      <BackToHubLink rowId={REVIEW_SCOPE_ID} />
      <h1 className="text-2xl font-bold">{title}</h1>

      {totalCount === 0 ? (
        <p className="text-neutral-500 dark:text-neutral-400">Nothing weak right now — nice work!</p>
      ) : (
        <>
          {totalBatches > 1 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {start + 1}–{Math.min(start + BATCH_SIZE, totalCount)} / {totalCount}
            </p>
          )}

          {kind === 'chars' ? (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
              {weakCharacterIds.slice(start, start + BATCH_SIZE).map((id) => (
                <CharacterCard key={id} char={CHARACTERS_BY_ID[id]} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {weakWords.slice(start, start + BATCH_SIZE).map((word) => (
                <WordCard key={word.id} word={word} />
              ))}
            </div>
          )}

          {totalBatches > 1 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={currentBatch === 0}
                onClick={() => setBatchIndex((b) => b - 1)}
                className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 disabled:opacity-40 dark:border-neutral-600"
              >
                Previous 10
              </button>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {currentBatch + 1} / {totalBatches}
              </span>
              <button
                type="button"
                disabled={currentBatch === totalBatches - 1}
                onClick={() => setBatchIndex((b) => b + 1)}
                className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 disabled:opacity-40 dark:border-neutral-600"
              >
                Next 10
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
