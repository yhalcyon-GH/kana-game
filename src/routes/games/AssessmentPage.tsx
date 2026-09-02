import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { AnswerReveal } from '../../components/AnswerReveal'
import { KanaTile } from '../../components/KanaTile'
import { SaveWordToggle } from '../../components/SaveWordToggle'
import { UnbreakableKana } from '../../components/UnbreakableKana'
import { WordImage } from '../../components/WordImage'
import { CHARACTERS_BY_ID, getCharacterAudioId } from '../../data/characters'
import { DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID } from '../../data/curriculum'
import type { QuestionMode } from '../../data/feedback'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { useCurriculum } from '../../hooks/useCurriculum'
import { useDelayedAction } from '../../hooks/useDelayedAction'
import { useTTS } from '../../hooks/useTTS'
import { useWordReadingSpeech } from '../../hooks/useWordReadingSpeech'
import {
  buildAssessmentPlan,
  createSeededRng,
  type AssessmentFamily,
  type AssessmentQuestion,
  type KanaQuizDirection,
} from '../../lib/assessmentPlan'
import { computeAssessmentResults, getPracticeRecommendations, type AssessmentAnswer } from '../../lib/assessmentResults'
import { pickDistractorCharIds, pickDistractorWords } from '../../lib/distractorPicker'
import { shuffle } from '../../lib/shuffle'
import { kanaToRomaji } from '../../lib/kanaToRomaji'
import { buildFlatTargetTiles, displayGlyphsForCharId, type FlatTargetTile } from '../../lib/wordBuilderTiles'
import { useProgressStore, type AssessmentScript } from '../../store/progressStore'

// Phase 1 of the Hiragana/Katakana mixed assessment test (Issue #189) — a
// single 20-question section-endpoint diagnostic, reusing 3 existing
// question mechanics (Kana Quiz/Listening/Word Builder) plus the new Word
// Reading mechanic. Deliberately ONE route/component covering all 4
// families rather than 4 separate game pages: the whole point is that
// families are MIXED within one continuous session (see
// lib/assessmentPlan.ts's interleave), so there's no natural per-family
// route boundary the way normal Practice has one page per mechanic.
//
// Explicitly does NOT touch: SRS/Review/mastery/unlock state (no
// recordResult/recordCharacterReviewResult/recordWordReviewResult calls
// anywhere in this file), the Recommended Path's row-level
// markRowActivityCompleted (this uses its own markAssessmentCompleted
// instead), or normal Kana Quiz/Listening/Word Builder route
// behavior/rules (this file renders its own bespoke UI per family; it never
// imports or mounts KanaQuizPage/ListeningPage/WordBuilderPage themselves).

const SCRIPT_CONFIG: Record<AssessmentScript, { categoryId: string; summaryRowId: string; label: string }> = {
  hiragana: { categoryId: DEFAULT_CATEGORY_ID, summaryRowId: 'hiragana-summary', label: 'Hiragana Test' },
  katakana: { categoryId: KATAKANA_CATEGORY_ID, summaryRowId: 'katakana-summary', label: 'Katakana Test' },
}

const DISTRACTOR_COUNT = 3

function familyLabel(family: AssessmentFamily): string {
  return { 'kana-quiz': 'Kana Quiz', listening: 'Listening', 'word-builder': 'Word Builder', 'word-reading': 'Word Reading' }[family]
}

export function AssessmentPage() {
  const params = useParams<{ script: string }>()
  const script = params.script === 'katakana' ? 'katakana' : params.script === 'hiragana' ? 'hiragana' : null
  const { getScopeCharacterIds, getScopeQuizCharacterIds, getScopeWords } = useCurriculum()
  const markAssessmentCompleted = useProgressStore((s) => s.markAssessmentCompleted)

  const config = script ? SCRIPT_CONFIG[script] : null
  const characterIds = useMemo(
    () => (config ? getScopeQuizCharacterIds(config.summaryRowId) : []),
    [config, getScopeQuizCharacterIds],
  )
  const distractorCharPool = useMemo(
    () => (config ? getScopeCharacterIds(config.summaryRowId) : []),
    [config, getScopeCharacterIds],
  )
  const words = useMemo(() => (config ? getScopeWords(config.summaryRowId) : []), [config, getScopeWords])

  // A fresh numeric seed per session attempt (not per render) — production
  // retakes should not always receive the same exact questions (issue
  // requirement), while a given attempt's plan stays stable across
  // re-renders. Math.random()-derived so it isn't literally
  // Date.now()-predictable, but this is display/variety only, never a
  // security-sensitive value.
  const [attempt, setAttempt] = useState(0)
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const sessionSeed = seed + attempt * 104729

  const plan = useMemo(() => {
    if (!config || characterIds.length === 0 || words.length === 0) return null
    return buildAssessmentPlan({ characterIds, words, rng: createSeededRng(sessionSeed) })
  }, [config, characterIds, words, sessionSeed])

  const [roundIndex, setRoundIndex] = useState(0)
  const [answers, setAnswers] = useState<AssessmentAnswer[]>([])
  const [finished, setFinished] = useState(false)

  const { mood, onCorrect, onWrong, clear } = useAnswerFeedback(16 as QuestionMode)

  // Deliberately keyed on the PRIMITIVE sessionSeed, not `plan` itself —
  // plan is a fresh object every render (characterIds/words come from
  // useCurriculum's getScopeCharacterIds/getScopeWords, which return new
  // array identities each render), so depending on its object identity
  // here would re-fire this effect (and therefore reset state) on every
  // single render, an infinite loop once React re-renders in response to
  // the state resets it triggers.
  useEffect(() => {
    setRoundIndex(0)
    setAnswers([])
    setFinished(false)
  }, [sessionSeed])

  const questions = plan?.questions ?? []
  const currentQuestion: AssessmentQuestion | undefined = questions[roundIndex]

  const recordAnswer = (question: AssessmentQuestion, correct: boolean) => {
    setAnswers((prev) => [...prev, { question, correct }])
    if (correct) onCorrect()
    else {
      onWrong(
        question.characterId
          ? { id: question.characterId, kana: CHARACTERS_BY_ID[question.characterId]?.kana ?? '', romaji: CHARACTERS_BY_ID[question.characterId]?.romaji ?? '' }
          : { id: question.word?.id ?? '', kana: question.word?.kana ?? '', romaji: question.word?.romaji ?? '' },
      )
    }
  }

  // advance() only moves the round pointer; completion itself is decided by
  // the effect below, keyed off `answers` actually reaching the full
  // question count — recordAnswer's setAnswers call is async, so reading
  // `answers` synchronously inside advance() would see the PREVIOUS
  // round's array, not the one that just got this round's answer appended.
  const advance = () => {
    clear()
    if (roundIndex + 1 < questions.length) setRoundIndex((i) => i + 1)
  }

  useEffect(() => {
    if (config && questions.length > 0 && answers.length === questions.length && !finished) {
      setFinished(true)
      const correct = answers.filter((a) => a.correct).length
      markAssessmentCompleted(script as AssessmentScript, { correct, total: questions.length })
    }
  }, [answers, questions.length, config, script, finished, markAssessmentCompleted])

  if (!script || !config) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-bold">Assessment not found</h1>
        <Link to="/" className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white">Home</Link>
      </div>
    )
  }

  if (!plan || questions.length === 0) return null

  if (finished) {
    return <AssessmentResultsScreen script={script} config={config} answers={answers} onRetry={() => setAttempt((a) => a + 1)} />
  }

  if (!currentQuestion) return null

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full items-center gap-3 self-start">
        <Link
          to={script === 'hiragana' ? '/hiragana' : '/katakana'}
          className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:border-blue-400 dark:border-neutral-600 dark:text-neutral-300"
        >
          ← Back
        </Link>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Question {roundIndex + 1} / {questions.length} · {familyLabel(currentQuestion.family)}
        </p>
      </div>

      {currentQuestion.family === 'kana-quiz' && (
        <AssessmentKanaQuizQuestion
          key={`${roundIndex}-kana-quiz`}
          characterId={currentQuestion.characterId!}
          direction={currentQuestion.kanaQuizDirection!}
          distractorPool={distractorCharPool}
          mood={mood}
          onAnswered={(correct) => recordAnswer(currentQuestion, correct)}
          onAdvance={advance}
        />
      )}
      {currentQuestion.family === 'listening' && (
        <AssessmentListeningQuestion
          key={`${roundIndex}-listening`}
          word={currentQuestion.word!}
          wordPool={words}
          mood={mood}
          onAnswered={(correct) => recordAnswer(currentQuestion, correct)}
          onAdvance={advance}
        />
      )}
      {currentQuestion.family === 'word-builder' && (
        <AssessmentWordBuilderQuestion
          key={`${roundIndex}-word-builder`}
          word={currentQuestion.word!}
          distractorPool={distractorCharPool}
          mood={mood}
          onAnswered={(correct) => recordAnswer(currentQuestion, correct)}
          onAdvance={advance}
        />
      )}
      {currentQuestion.family === 'word-reading' && (
        <AssessmentWordReadingQuestion
          key={`${roundIndex}-word-reading`}
          word={currentQuestion.word!}
          mood={mood}
          onAnswered={(correct) => recordAnswer(currentQuestion, correct)}
          onAdvance={advance}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Family 1: Kana Quiz (reused mechanic — kana<->romaji recall, both
// directions represented across the assessment's 5 questions, see
// lib/assessmentPlan.ts). Rendering mirrors KanaQuizPage's Read/Recall
// branches; normal KanaQuizPage itself is untouched by this file.
// ---------------------------------------------------------------------
function AssessmentKanaQuizQuestion({
  characterId,
  direction,
  distractorPool,
  mood,
  onAnswered,
  onAdvance,
}: {
  characterId: string
  direction: KanaQuizDirection
  distractorPool: string[]
  mood: ReturnType<typeof useAnswerFeedback>['mood']
  onAnswered: (correct: boolean) => void
  onAdvance: () => void
}) {
  const { speak, supported } = useTTS()
  const { schedule: scheduleAdvance } = useDelayedAction()
  const [choices, setChoices] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const char = CHARACTERS_BY_ID[characterId]

  useEffect(() => {
    const distractors = pickDistractorCharIds([characterId], distractorPool, DISTRACTOR_COUNT)
    setChoices(shuffle([characterId, ...distractors]))
    setSelectedId(null)
    setAnswered(false)
    if (direction === 'recall') speak(`characters/${getCharacterAudioId(characterId)}`, char.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, direction])

  const handleChoice = (choiceId: string) => {
    if (answered) return
    setSelectedId(choiceId)
    setAnswered(true)
    const correct = choiceId === characterId
    onAnswered(correct)
    if (correct) scheduleAdvance(onAdvance, 2000)
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        {direction === 'read' ? (
          <span className="font-kana text-7xl font-bold whitespace-nowrap">{char.kana}</span>
        ) : (
          <span className="text-6xl" aria-hidden="true">🔊</span>
        )}
        {direction === 'recall' && (
          <span className={`text-2xl font-semibold ${answered ? 'visible' : 'invisible'}`} aria-hidden={!answered}>
            {char.displayLabel ?? char.romaji}
          </span>
        )}
        {supported && direction === 'recall' && (
          <button type="button" onClick={() => speak(`characters/${getCharacterAudioId(characterId)}`, char.kana)} className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600" aria-label="Replay audio">
            🔊 Replay
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((choiceId) => {
          const choice = CHARACTERS_BY_ID[choiceId]
          const isSelected = selectedId === choiceId
          const isTarget = choiceId === characterId
          const showResult = answered && (isSelected || isTarget)
          return (
            <button
              key={choiceId}
              type="button"
              onClick={() => handleChoice(choiceId)}
              disabled={answered}
              className={`rounded-xl border-2 px-6 py-4 text-2xl font-bold transition ${showResult ? (isTarget ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-red-500 bg-red-50 dark:bg-red-950') : 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'}`}
            >
              {direction === 'recall' ? <span className="font-kana whitespace-nowrap">{choice.kana}</span> : (choice.displayLabel ?? choice.romaji)}
            </button>
          )
        })}
      </div>
      <AnswerFeedbackRow mood={mood} showNext={answered} onNext={onAdvance} />
    </div>
  )
}

// ---------------------------------------------------------------------
// Family 2: Listening (reused mechanic — audio -> choose correct word).
// Assessment mode avoids unnecessary answer-revealing clues before an
// answer: no romaji hint shown regardless of the alwaysShowRomajiHints
// setting (issue requirement) — normal ListeningPage/that setting are
// untouched.
// ---------------------------------------------------------------------
function AssessmentListeningQuestion({
  word,
  wordPool,
  mood,
  onAnswered,
  onAdvance,
}: {
  word: import('../../data/types').AnchorWord
  wordPool: import('../../data/types').AnchorWord[]
  mood: ReturnType<typeof useAnswerFeedback>['mood']
  onAnswered: (correct: boolean) => void
  onAdvance: () => void
}) {
  const { speak, supported } = useTTS()
  const { schedule: scheduleAdvance } = useDelayedAction()
  const [choices, setChoices] = useState<import('../../data/types').AnchorWord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    const distractors = pickDistractorWords(word, wordPool, 3)
    setChoices(shuffle([word, ...distractors]))
    setSelectedId(null)
    setAnswered(false)
    speak(`words/${word.id}`, word.audioText ?? word.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id])

  const handleChoice = (choice: import('../../data/types').AnchorWord) => {
    if (answered) return
    setSelectedId(choice.id)
    setAnswered(true)
    const correct = choice.id === word.id
    onAnswered(correct)
    if (correct) scheduleAdvance(onAdvance, 2000)
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <span className="text-6xl" aria-hidden="true">🔊</span>
        {supported && (
          <button type="button" onClick={() => speak(`words/${word.id}`, word.audioText ?? word.kana)} className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600" aria-label="Replay audio">
            🔊 Replay
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((choice) => {
          const isSelected = selectedId === choice.id
          const isTarget = choice.id === word.id
          const showResult = answered && (isSelected || isTarget)
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => handleChoice(choice)}
              disabled={answered}
              className={`rounded-xl border-2 px-6 py-4 text-2xl font-bold transition ${showResult ? (isTarget ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-red-500 bg-red-50 dark:bg-red-950') : 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'}`}
            >
              <span className="font-kana block"><UnbreakableKana kana={choice.kana} /></span>
              <span className={`block text-sm font-normal text-neutral-500 dark:text-neutral-400 ${answered ? 'visible' : 'invisible'}`} aria-hidden={!answered}>
                {choice.romaji}
              </span>
            </button>
          )
        })}
      </div>
      <AnswerFeedbackRow mood={mood} showNext={answered} onNext={onAdvance} />
    </div>
  )
}

// ---------------------------------------------------------------------
// Family 3: Word Builder (reused mechanic — audio -> build word with
// kana). Assessment mode hides English meaning/illustration/romaji before
// answering (issue requirement) and reveals them after, alongside the
// existing normal feedback (AnswerReveal). Normal WordBuilderPage is
// untouched.
// ---------------------------------------------------------------------
function AssessmentWordBuilderQuestion({
  word,
  distractorPool,
  mood,
  onAnswered,
  onAdvance,
}: {
  word: import('../../data/types').AnchorWord
  distractorPool: string[]
  mood: ReturnType<typeof useAnswerFeedback>['mood']
  onAnswered: (correct: boolean) => void
  onAdvance: () => void
}) {
  const { speak, supported } = useTTS()
  const { schedule: scheduleAdvance } = useDelayedAction()
  const [slots, setSlots] = useState<(string | null)[]>([])
  const [tray, setTray] = useState<{ key: string; glyph: string; placed: boolean }[]>([])
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing')
  const [targetTiles, setTargetTiles] = useState<FlatTargetTile[]>([])

  useEffect(() => {
    const distractorCharIds = pickDistractorCharIds(word.characterIds, distractorPool, DISTRACTOR_COUNT)
    const flatTarget = buildFlatTargetTiles(word.characterIds)
    const distractorTiles = distractorCharIds.flatMap((id) => displayGlyphsForCharId(id))
    const tileGlyphs = shuffle([...flatTarget.map((t) => t.glyph), ...distractorTiles])
    setTray(tileGlyphs.map((glyph, i) => ({ key: `${glyph}-${i}`, glyph, placed: false })))
    setTargetTiles(flatTarget)
    setSlots(new Array(flatTarget.length).fill(null))
    setStatus('playing')
    speak(`words/${word.id}`, word.audioText ?? word.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id])

  useEffect(() => {
    if (status !== 'playing') return
    if (slots.length === 0 || slots.some((s) => s === null)) return
    const placedGlyphs = slots.map((key) => tray.find((t) => t.key === key)?.glyph)
    const isCorrect = placedGlyphs.every((glyph, i) => glyph === targetTiles[i]?.glyph)
    if (isCorrect) {
      setStatus('correct')
      onAnswered(true)
      scheduleAdvance(onAdvance, 2000)
    } else {
      setStatus('wrong')
      onAnswered(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  const handleTrayClick = (tile: { key: string; glyph: string; placed: boolean }) => {
    if (tile.placed || status !== 'playing') return
    const emptyIndex = slots.findIndex((s) => s === null)
    if (emptyIndex === -1) return
    setSlots((prev) => {
      const next = [...prev]
      next[emptyIndex] = tile.key
      return next
    })
    setTray((prev) => prev.map((t) => (t.key === tile.key ? { ...t, placed: true } : t)))
  }

  const handleSlotClick = (index: number) => {
    const key = slots[index]
    if (!key || status !== 'playing') return
    setSlots((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setTray((prev) => prev.map((t) => (t.key === key ? { ...t, placed: false } : t)))
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        {/* No meaning/image/romaji before answering — assessment-mode-only
            clue hiding (issue requirement); revealed only once status
            leaves 'playing'. */}
        {status !== 'playing' ? (
          <>
            <WordImage word={word} className="h-20 w-20" />
            <span className="text-lg font-semibold">{word.meaning}</span>
          </>
        ) : (
          <span className="text-6xl" aria-hidden="true">🔊</span>
        )}
        {supported && (
          <button type="button" onClick={() => speak(`words/${word.id}`, word.audioText ?? word.kana)} className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600" aria-label="Replay audio">
            🔊 Replay
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {slots.map((key, i) => {
          const tile = key ? tray.find((t) => t.key === key) : undefined
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSlotClick(i)}
              className="flex h-14 w-14 flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-600"
            >
              <span className={`font-kana font-bold whitespace-nowrap ${tile && [...tile.glyph].length > 1 ? 'text-base' : 'text-2xl'}`}>{tile ? tile.glyph : ''}</span>
              <span className={`text-xs font-normal text-neutral-500 dark:text-neutral-400 ${status !== 'playing' && tile ? 'visible' : 'invisible'}`} aria-hidden={!(status !== 'playing' && tile)}>
                {tile ? kanaToRomaji(tile.glyph) : ' '}
              </span>
            </button>
          )
        })}
      </div>

      <div className="min-h-[3.5rem] flex items-center justify-center" aria-hidden={status !== 'wrong'}>
        {status === 'wrong' && <AnswerReveal characterIds={word.characterIds} />}
      </div>

      <AnswerFeedbackRow
        mood={mood}
        showNext={status !== 'playing'}
        onNext={onAdvance}
        saveControl={status === 'wrong' ? <SaveWordToggle wordId={word.id} kana={word.kana} /> : undefined}
      />

      <div className="flex flex-wrap justify-center gap-2">
        {tray.map((tile) => (
          <KanaTile key={tile.key} kana={tile.glyph} disabled={tile.placed || status !== 'playing'} onClick={() => handleTrayClick(tile)} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Family 4: Word Reading (NEW mechanic, issue's Family 4) — see
// hooks/useWordReadingSpeech.ts for the speech-recognition/Romaji-fallback
// state machine this renders. Deliberately NOT the Restaurant/Cafe
// menu-order UI — visual design instead resembles the other Practice
// games above (target prompt, feedback row, plain buttons).
// ---------------------------------------------------------------------
function AssessmentWordReadingQuestion({
  word,
  mood,
  onAnswered,
  onAdvance,
}: {
  word: import('../../data/types').AnchorWord
  mood: ReturnType<typeof useAnswerFeedback>['mood']
  onAnswered: (correct: boolean) => void
  onAdvance: () => void
}) {
  const { speak } = useTTS()
  const { schedule: scheduleAdvance } = useDelayedAction()
  const speech = useWordReadingSpeech(word)
  const [showRomaji, setShowRomaji] = useState(false)
  const [romajiChoices, setRomajiChoices] = useState<{ id: string; romaji: string; correct: boolean }[]>([])
  const [finalResult, setFinalResult] = useState<'correct' | 'incorrect' | null>(null)

  useEffect(() => {
    speech.reset()
    setShowRomaji(false)
    setFinalResult(null)
    // Fabricate 3 plausible-looking wrong romaji options alongside the
    // correct one — Word Reading has no menu/candidate list the way
    // Restaurant/Cafe does, so choices are generated from the target's own
    // romaji plus simple case/character variations rather than reusing
    // RestaurantDish data.
    const wrongOptions = [`${word.romaji}i`, `${word.romaji.slice(0, -1) || word.romaji}o`, `${word.romaji}ka`]
    setRomajiChoices(
      shuffle([
        { id: 'correct', romaji: word.romaji, correct: true },
        ...wrongOptions.map((romaji, i) => ({ id: `wrong-${i}`, romaji, correct: false })),
      ]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id])

  useEffect(() => {
    if (speech.state.kind !== 'result') return
    if (speech.state.result.outcome === 'success') {
      setFinalResult('correct')
      onAnswered(true)
      speak(`words/${word.id}`, word.audioText ?? word.kana)
      scheduleAdvance(onAdvance, 2000)
    }
    // 'incorrect'/'unrecognized' speech outcomes are NOT final — the
    // learner still has Try Again / Romaji fallback available below (see
    // this component's render, mirroring Restaurant/Cafe's recovery flow).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.state])

  const chooseRomaji = (choice: { id: string; romaji: string; correct: boolean }) => {
    if (finalResult) return
    setFinalResult(choice.correct ? 'correct' : 'incorrect')
    onAnswered(choice.correct)
    if (choice.correct) {
      speak(`words/${word.id}`, word.audioText ?? word.kana)
      scheduleAdvance(onAdvance, 2000)
    }
  }

  const isSpeechFailure = speech.state.kind === 'result' && speech.state.result.outcome !== 'success' && !finalResult

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        {/* Before answering: only the written word, prominently — no
            meaning/image/answer-revealing romaji (issue requirement). */}
        <span className="font-kana text-6xl font-bold whitespace-nowrap"><UnbreakableKana kana={word.kana} /></span>
      </div>

      {finalResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <p className={`text-lg font-bold ${finalResult === 'correct' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {finalResult === 'correct' ? 'Correct!' : 'Not quite.'}
          </p>
          {/* After answering: reveal correct word, romaji, meaning,
              illustration, plus the shared feedback row below. */}
          <WordImage word={word} className="h-20 w-20" />
          <p className="text-xl font-bold"><UnbreakableKana kana={word.kana} /> <span className="text-base font-normal">{word.romaji}</span></p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{word.meaning}</p>
        </div>
      )}

      {!finalResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          {!showRomaji && (
            <>
              <button
                type="button"
                onClick={speech.startListening}
                disabled={!speech.speechSupported || speech.state.kind === 'listening'}
                data-testid="word-reading-speak-button"
                className="rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {speech.state.kind === 'listening' ? '🎤 Listening…' : '🎤 Speak'}
              </button>
              {!speech.speechSupported && (
                <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">Voice input isn&apos;t available in this browser — use the button below instead.</p>
              )}
              {isSpeechFailure && !speech.retryUsed && (
                <button type="button" onClick={speech.tryAgain} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Try Again</button>
              )}
              <button type="button" onClick={() => setShowRomaji(true)} className="rounded-full border px-5 py-2 text-sm font-semibold">
                Choose in Romaji
              </button>
            </>
          )}

          {showRomaji && (
            <div className="flex w-full flex-col items-center gap-2" data-testid="word-reading-romaji-fallback">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Choose the romaji</p>
              <div className="grid w-full grid-cols-2 gap-2">
                {romajiChoices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => chooseRomaji(choice)}
                    data-testid={`word-reading-romaji-${choice.id}`}
                    className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold hover:border-blue-400 active:scale-95 dark:border-neutral-600"
                  >
                    {choice.romaji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <AnswerFeedbackRow mood={mood} showNext={!!finalResult} onNext={onAdvance} />
    </div>
  )
}

// ---------------------------------------------------------------------
// Results screen — per-family + directional diagnostic scores, and up to
// 2 practice recommendations (issue's "Results / diagnostics" and
// "Practice recommendations" sections).
// ---------------------------------------------------------------------
function AssessmentResultsScreen({
  script,
  config,
  answers,
  onRetry,
}: {
  script: AssessmentScript
  config: { categoryId: string; summaryRowId: string; label: string }
  answers: AssessmentAnswer[]
  onRetry: () => void
}) {
  const results = useMemo(() => computeAssessmentResults(answers), [answers])
  const recommendations = useMemo(() => getPracticeRecommendations(results, script), [results, script])
  const backHref = script === 'hiragana' ? '/hiragana' : '/katakana'

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">{config.label} complete!</h1>
      <p className="text-lg font-semibold">
        {results.overallCorrect} / {results.overallTotal}
      </p>

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {(['kana-quiz', 'listening', 'word-builder', 'word-reading'] as const).map((family) => {
          const score = results.familyScores[family]
          return (
            <div key={family} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center dark:border-neutral-700 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{familyLabel(family)}</p>
              <p className="text-lg font-bold">{score.correct} / {score.total}</p>
            </div>
          )
        })}
      </div>

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Kana → Sound</p>
          <p className="text-lg font-bold">{results.directionScores.kanaToSound.correct} / {results.directionScores.kanaToSound.total}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Sound → Kana</p>
          <p className="text-lg font-bold">{results.directionScores.soundToKana.correct} / {results.directionScores.soundToKana.total}</p>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <h2 className="font-bold">Suggested practice</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {recommendations.map((rec) => (
              <Link key={rec.to} to={rec.to} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                {rec.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onRetry} className="min-w-[9rem] rounded-full border border-neutral-300 px-6 py-2 text-center font-semibold hover:border-blue-400 dark:border-neutral-600">
          Play Again
        </button>
        <Link to={backHref} className="min-w-[9rem] rounded-full bg-blue-600 px-6 py-2 text-center font-semibold text-white hover:bg-blue-700">
          Back
        </Link>
      </div>
    </div>
  )
}
