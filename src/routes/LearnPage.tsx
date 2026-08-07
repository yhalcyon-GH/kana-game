import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CharacterCard } from '../components/CharacterCard'
import { WordCard } from '../components/WordCard'
import { CHARACTERS_BY_ID } from '../data/characters'
import { ROWS_BY_ID } from '../data/curriculum'
import { WORDS_BY_ROW } from '../data/words'
import { useProgressStore } from '../store/progressStore'

// Step A: flash through the row's new characters one at a time (no word
// pairing yet). Step B: show every word buildable from this row's
// characters + everything already known, all at once — this is where
// character and vocabulary actually connect. See curriculum.ts/words.ts.
export function LearnPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const markRowTaught = useProgressStore((s) => s.markRowTaught)

  const row = rowId ? ROWS_BY_ID[rowId] : undefined
  const [step, setStep] = useState<'A' | 'B'>('A')
  const [charIndex, setCharIndex] = useState(0)

  useEffect(() => {
    if (!rowId || !ROWS_BY_ID[rowId]) {
      navigate('/', { replace: true })
    }
  }, [rowId, navigate])

  if (!row || !rowId) return null

  const characters = row.characterIds.map((id) => CHARACTERS_BY_ID[id])
  const words = WORDS_BY_ROW[rowId] ?? []

  const handleNextChar = () => {
    if (charIndex < characters.length - 1) {
      setCharIndex((i) => i + 1)
    } else {
      setStep('B')
    }
  }

  const handleFinish = () => {
    markRowTaught(rowId)
    navigate(`/practice/${rowId}`)
  }

  if (step === 'A') {
    const char = characters[charIndex]
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">{row.label} — new characters</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {charIndex + 1} / {characters.length}
        </p>
        <CharacterCard char={char} />
        <button
          type="button"
          onClick={handleNextChar}
          className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        >
          {charIndex < characters.length - 1 ? 'Next' : 'See the words'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">{row.label} — words you can already read</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {words.map((word) => (
          <WordCard key={word.id} word={word} />
        ))}
      </div>
      <button
        type="button"
        onClick={handleFinish}
        className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
      >
        Start practicing
      </button>
    </div>
  )
}
