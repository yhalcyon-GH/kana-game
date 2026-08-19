import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CharacterCard } from '../components/CharacterCard'
import { CharacterGrid } from '../components/CharacterGrid'
import { WordCard } from '../components/WordCard'
import { CHARACTERS_BY_ID, getCharacterAudioId } from '../data/characters'
import { CATEGORIES_BY_ID, ROWS_BY_ID } from '../data/curriculum'
import { WORDS_BY_ROW } from '../data/words'
import { useCurriculum } from '../hooks/useCurriculum'
import { useTTS } from '../hooks/useTTS'
import { useProgressStore } from '../store/progressStore'

// Step A: flash through the row's new characters one at a time (no word
// pairing yet). Step recap: all of this row's characters together on one
// grid, tappable, so the learner can freely re-listen before moving on.
// Step B: show every word buildable from this row's characters +
// everything already known, all at once — this is where character and
// vocabulary actually connect. See curriculum.ts/words.ts.
//
// 'contrast-pairs' categories (促音/長音) skip straight to step B: the rule
// is taught BY the words (minimal pairs like おと/おっと), not by
// flashcarding っ/ッ in isolation first — see
// docs/curriculum-extensibility.md. Step B's word grid already IS "listen
// through the words that isolate the rule" once there's no preceding
// flashcard step, so it needs no separate rendering path of its own, just a
// different entry point and a "Back" that returns to the hub instead of a
// recap step that doesn't exist for this learnStyle.
export function LearnPage() {
  const { categoryId, rowId } = useParams<{ categoryId: string; rowId: string }>()
  const navigate = useNavigate()
  const markRowTaught = useProgressStore((s) => s.markRowTaught)
  const { getScopeWords } = useCurriculum()

  const row = rowId ? ROWS_BY_ID[rowId] : undefined
  const isContrastPairs = CATEGORIES_BY_ID[categoryId ?? '']?.learnStyle === 'contrast-pairs'
  const [step, setStep] = useState<'A' | 'recap' | 'B'>(isContrastPairs ? 'B' : 'A')
  const [charIndex, setCharIndex] = useState(0)
  const [summaryStep, setSummaryStep] = useState<'chars' | 'words'>('chars')
  const { speak } = useTTS()

  useEffect(() => {
    if (!rowId || !row || row.categoryId !== categoryId) {
      navigate('/', { replace: true })
    }
  }, [rowId, categoryId, row, navigate])

  const characters = row ? row.characterIds.map((id) => CHARACTERS_BY_ID[id]) : []

  useEffect(() => {
    // row.isSummary renders an "every character"/"every word" grid instead
    // of the step-A single-flashcard view below, but `step` still defaults
    // to 'A' underneath it — without this check, the first character would
    // auto-play on a page that's meant to be tap-to-play only.
    if (step !== 'A' || characters.length === 0 || row?.isSummary) return
    const char = characters[charIndex]
    // ー/っ/ッ have no sound in isolation — see CharacterCard's comment.
    if (char.romaji !== '-') speak(`characters/${getCharacterAudioId(char.id)}`, char.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, charIndex, characters.length, row?.isSummary])

  if (!row || !rowId) return null

  if (row.isSummary) {
    if (summaryStep === 'chars') {
      return (
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-2xl font-bold">⭐ {row.label} — every character</h1>
          <CharacterGrid characters={characters} />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(`/practice/${categoryId}/${rowId}`)}
              className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setSummaryStep('words')}
              className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
            >
              See the words
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">⭐ {row.label} — every word</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {getScopeWords(rowId).map((word) => (
            <WordCard key={word.id} word={word} />
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSummaryStep('chars')}
            className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => navigate(`/practice/${categoryId}/${rowId}`)}
            className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  const words = WORDS_BY_ROW[rowId] ?? []

  const handlePrevChar = () => {
    if (charIndex > 0) {
      setCharIndex((i) => i - 1)
    } else {
      navigate(`/practice/${categoryId}/${rowId}`)
    }
  }

  const handleNextChar = () => {
    if (charIndex < characters.length - 1) {
      setCharIndex((i) => i + 1)
    } else {
      setStep('recap')
    }
  }

  const handleFinish = () => {
    markRowTaught(rowId)
    navigate(`/practice/${categoryId}/${rowId}`)
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
        {char.note && <p className="max-w-xs text-center text-sm font-semibold text-red-500">{char.note}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handlePrevChar}
            className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNextChar}
            className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
          >
            {charIndex < characters.length - 1 ? 'Next' : 'See them all'}
          </button>
        </div>
        {/* Jump-ahead links — a long row (e.g. katakana's merged ア~ゴ
            lesson) means clicking Next through every character just to
            reach the recap grid or word list is a lot of taps; these skip
            straight there without losing the "Back" behavior above, which
            still steps back one character at a time. */}
        <div className="flex gap-4 text-sm">
          <button type="button" onClick={() => setStep('recap')} className="text-neutral-500 underline hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400">
            See them all
          </button>
          <button type="button" onClick={() => setStep('B')} className="text-neutral-500 underline hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400">
            See the words
          </button>
        </div>
      </div>
    )
  }

  if (step === 'recap') {
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">{row.label} — all together</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Tap any character to hear it again</p>
        <CharacterGrid characters={characters} />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep('A')}
            className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep('B')}
            className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
          >
            See the words
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">
        {isContrastPairs ? `${row.label} — listen and compare` : `${row.label} — words you can already read`}
      </h1>
      {row.explanation && (
        <p className="max-w-md text-center text-sm text-neutral-500 dark:text-neutral-400">{row.explanation}</p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {words.map((word) => (
          <WordCard key={word.id} word={word} />
        ))}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => (isContrastPairs ? navigate(`/practice/${categoryId}/${rowId}`) : setStep('recap'))}
          className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleFinish}
          className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Start practicing
        </button>
      </div>
    </div>
  )
}
