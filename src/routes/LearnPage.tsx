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
// pairing yet) — for a row with `learnBatches` (see types.ts), this is
// further split into small logical sound groups, each followed by its own
// browse-only batch recap (step 'batchRecap') before moving to the next
// group; a row without `learnBatches` keeps the original single pass.
// Step recap: all of this row's characters together on one grid, tappable,
// so the learner can freely re-listen before moving on. Step B: show every
// word buildable from this row's characters + everything already known,
// all at once — this is where character and vocabulary actually connect.
// See curriculum.ts/words.ts.
//
// Micro-batching (see types.ts's GojuonRow.learnBatches) is a presentation
// grouping ONLY, inside step A — `characterIds` (and therefore
// unlock/mastery/Practice/Review/markRowTaught) is completely unaffected;
// see curriculum.test.ts's learnBatches invariants.
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
  const [step, setStep] = useState<'A' | 'batchRecap' | 'recap' | 'B'>(isContrastPairs ? 'B' : 'A')
  const [batchIndex, setBatchIndex] = useState(0)
  const [charIndexInBatch, setCharIndexInBatch] = useState(0)
  const [summaryStep, setSummaryStep] = useState<'chars' | 'words'>('chars')
  // Similar Letters (see GojuonRow.isSimilarLetters): one confusion group
  // ('learnBatches' entry — see similarLetters.ts) per page, stepped
  // through independently of the normal step-A machinery below.
  const [groupIndex, setGroupIndex] = useState(0)
  // Set only by the step-A jump-ahead links ("See them all"/"See the
  // words"), which can skip straight to the full recap/words from ANY
  // batch/character — remembers where the learner actually was so Back
  // from the full recap can undo the jump and return there, instead of
  // Back always assuming the (much more common) normal progression path
  // "reached the full recap via the final batch's own recap." Cleared as
  // soon as it's consumed. See handleRecapBack.
  const [jumpOrigin, setJumpOrigin] = useState<{ batchIndex: number; charIndexInBatch: number } | null>(null)
  const { speak } = useTTS()

  useEffect(() => {
    if (!rowId || !row || row.categoryId !== categoryId) {
      navigate('/', { replace: true })
    }
  }, [rowId, categoryId, row, navigate])

  const characters = row ? row.characterIds.map((id) => CHARACTERS_BY_ID[id]) : []
  // A row without `learnBatches` (or a summary row's characterIds, unused
  // below) behaves as a single implicit batch spanning the whole row —
  // this is what keeps its flow byte-for-byte identical to before: the
  // per-batch recap step is only ever entered when there's more than one
  // real batch (see handleNextChar).
  const batches = row?.learnBatches ?? (row ? [row.characterIds] : [])
  const isMultiBatch = batches.length > 1
  const currentBatchIds = batches[batchIndex] ?? []
  const currentBatchChars = currentBatchIds.map((id) => CHARACTERS_BY_ID[id])
  const char = currentBatchChars[charIndexInBatch]

  useEffect(() => {
    // row.isSummary renders an "every character"/"every word" grid instead
    // of the step-A single-flashcard view below, but `step` still defaults
    // to 'A' underneath it — without this check, the first character would
    // auto-play on a page that's meant to be tap-to-play only.
    if (step !== 'A' || characters.length === 0 || row?.isSummary || row?.isSimilarLetters || !char) return
    // ー/っ/ッ have no sound in isolation — see CharacterCard's comment.
    if (char.romaji !== '-') speak(`characters/${getCharacterAudioId(char.id)}`, char.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, batchIndex, charIndexInBatch, characters.length, row?.isSummary])

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

  if (row.isSimilarLetters) {
    const groups = row.learnBatches ?? []
    const isLastGroup = groupIndex === groups.length - 1
    const currentGroup = groups[groupIndex] ?? []
    const currentGroupChars = currentGroup.map((id) => CHARACTERS_BY_ID[id])

    const handlePrevGroup = () => {
      if (groupIndex > 0) setGroupIndex((i) => i - 1)
      else navigate(`/practice/${categoryId}/${rowId}`)
    }
    // Similar Letters is a supplementary comparison lesson, not a main
    // curriculum step — finishing it never calls markRowTaught (see
    // GojuonRow.isSimilarLetters), it just returns to the hub.
    const handleNextGroup = () => {
      if (!isLastGroup) setGroupIndex((i) => i + 1)
      else navigate(`/practice/${categoryId}/${rowId}`)
    }

    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">🔍 {row.englishLabel ?? row.label}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Group {groupIndex + 1} / {groups.length}
        </p>
        <div className="flex flex-wrap items-start justify-center gap-4">
          {currentGroupChars.map((c) => (
            <CharacterCard key={c.id} char={c} />
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handlePrevGroup}
            className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNextGroup}
            className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
          >
            {isLastGroup ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    )
  }

  const words = WORDS_BY_ROW[rowId] ?? []

  const handlePrevChar = () => {
    if (charIndexInBatch > 0) {
      setCharIndexInBatch((i) => i - 1)
    } else if (batchIndex > 0) {
      // First character of a later batch — back goes to the PREVIOUS
      // batch's own recap, not out of the lesson.
      setBatchIndex((b) => b - 1)
      setStep('batchRecap')
    } else {
      navigate(`/practice/${categoryId}/${rowId}`)
    }
  }

  const handleNextChar = () => {
    if (charIndexInBatch < currentBatchIds.length - 1) {
      setCharIndexInBatch((i) => i + 1)
    } else if (isMultiBatch) {
      setStep('batchRecap')
    } else {
      // Unbatched (or single-batch) rows keep the original direct
      // last-character -> full-row recap transition, with no redundant
      // intermediate recap in between.
      setStep('recap')
    }
  }

  const handleBatchRecapBack = () => {
    setCharIndexInBatch(currentBatchIds.length - 1)
    setStep('A')
  }

  const handleBatchRecapNext = () => {
    if (batchIndex < batches.length - 1) {
      setBatchIndex((b) => b + 1)
      setCharIndexInBatch(0)
      setStep('A')
    } else {
      setStep('recap')
    }
  }

  const handleRecapBack = () => {
    if (jumpOrigin) {
      // Undo a jump-ahead: return to the exact batch/character the learner
      // was actually on, not the final batch's recap.
      setBatchIndex(jumpOrigin.batchIndex)
      setCharIndexInBatch(jumpOrigin.charIndexInBatch)
      setJumpOrigin(null)
      setStep('A')
    } else if (isMultiBatch) {
      setBatchIndex(batches.length - 1)
      setStep('batchRecap')
    } else {
      setStep('A')
    }
  }

  // Recommended Path: finishing Learn is the first core step, so its
  // primary action continues straight into the next recommended activity
  // (Kana Quiz for character-set, Listening for contrast-pairs — no Kana
  // Quiz step there, see lib/recommendedPath.ts) instead of just returning
  // to the hub. markRowTaught still fires here exactly as before — this is
  // the ONLY change to Learn's existing completion behavior.
  const handleFinish = () => {
    markRowTaught(rowId)
    navigate(`/practice/${categoryId}/${rowId}/${isContrastPairs ? 'listening' : 'kana-quiz'}`)
  }

  if (step === 'A') {
    if (!char) return null
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">{row.label} — new characters</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {isMultiBatch
            ? `Set ${batchIndex + 1} / ${batches.length} · ${charIndexInBatch + 1} / ${currentBatchIds.length}`
            : `${charIndexInBatch + 1} / ${currentBatchIds.length}`}
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
            {charIndexInBatch < currentBatchIds.length - 1 ? 'Next' : isMultiBatch ? 'See this set' : 'See them all'}
          </button>
        </div>
        {/* Jump-ahead links — a long row (e.g. katakana's merged ア~ゴ
            lesson) means clicking Next through every character just to
            reach the recap grid or word list is a lot of taps; these skip
            straight there without losing the "Back" behavior above, which
            still steps back one character at a time. Both always target the
            FULL-row recap/words, regardless of which batch is showing —
            recording the jump's origin so Back can return here instead of
            wherever normal progression would land (see handleRecapBack). */}
        <div className="flex gap-4 text-sm">
          <button
            type="button"
            onClick={() => {
              setJumpOrigin({ batchIndex, charIndexInBatch })
              setStep('recap')
            }}
            className="text-neutral-500 underline hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
          >
            See them all
          </button>
          <button
            type="button"
            onClick={() => {
              setJumpOrigin({ batchIndex, charIndexInBatch })
              setStep('B')
            }}
            className="text-neutral-500 underline hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
          >
            See the words
          </button>
        </div>
      </div>
    )
  }

  if (step === 'batchRecap') {
    const isLastBatch = batchIndex === batches.length - 1
    return (
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">
          {row.label} — Set {batchIndex + 1} / {batches.length}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Tap any character to hear it again</p>
        <CharacterGrid characters={currentBatchChars} />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBatchRecapBack}
            className="rounded-full border border-neutral-300 px-6 py-2 font-semibold hover:border-blue-400 dark:border-neutral-600"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleBatchRecapNext}
            className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
          >
            {isLastBatch ? 'See them all' : 'Next set'}
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
            onClick={handleRecapBack}
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
          Continue
        </button>
      </div>
    </div>
  )
}
