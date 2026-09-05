import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnswerFeedbackRow } from '../../components/AnswerFeedbackRow'
import { AnswerReveal } from '../../components/AnswerReveal'
import { AssessmentScoreVisual } from '../../components/AssessmentScoreVisual'
import { KanaTile } from '../../components/KanaTile'
import { SaveWordToggle } from '../../components/SaveWordToggle'
import { UnbreakableKana } from '../../components/UnbreakableKana'
import { WordImage } from '../../components/WordImage'
import { CHARACTERS_BY_ID, getCharacterAudioId } from '../../data/characters'
import { DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID } from '../../data/curriculum'
import type { AnchorWord } from '../../data/types'
import { useAnswerFeedback } from '../../hooks/useAnswerFeedback'
import { useCurriculum } from '../../hooks/useCurriculum'
import { useTTS } from '../../hooks/useTTS'
import { useWordReadingSpeech } from '../../hooks/useWordReadingSpeech'
import { track } from '../../lib/analytics/track'
import {
  buildAssessmentPlan,
  buildYouonSpecialAssessmentPlan,
  buildFinalAssessmentPlan,
  createSeededRng,
  type AssessmentFamily,
  type AssessmentQuestion,
  type KanaQuizDirection,
} from '../../lib/assessmentPlan'
import { computeAssessmentResults, getPracticeRecommendations, type AssessmentAnswer } from '../../lib/assessmentResults'
import { pickDistractorCharIds, pickDistractorWords } from '../../lib/distractorPicker'
import { kanaToRomaji } from '../../lib/kanaToRomaji'
import { shuffle } from '../../lib/shuffle'
import { buildFlatTargetTiles, displayGlyphsForCharId, type FlatTargetTile } from '../../lib/wordBuilderTiles'
import { removeWordBuilderSlot, toggleWordBuilderTrayTile, type WordBuilderTrayTile } from '../../lib/wordBuilderPlacement'
import { useProgressStore, type AssessmentScript } from '../../store/progressStore'
import { SoundLengthAssessmentPage } from './SoundLengthAssessmentPage'

type ScriptAssessment = Extract<AssessmentScript, 'hiragana' | 'katakana' | 'youon-special-katakana' | 'final-graduation'>
const SCRIPT_CONFIG: Record<ScriptAssessment, { categoryId: string; summaryRowId: string; label: string }> = {
  hiragana: { categoryId: DEFAULT_CATEGORY_ID, summaryRowId: 'hiragana-summary', label: 'Hiragana Test' },
  katakana: { categoryId: KATAKANA_CATEGORY_ID, summaryRowId: 'katakana-summary', label: 'Katakana Test' },
  'youon-special-katakana': { categoryId: 'youon', summaryRowId: 'youon-summary', label: 'ゃゅょ / Special Katakana Test' },
  'final-graduation': { categoryId: 'special-katakana', summaryRowId: 'youon-summary', label: 'Final Kana Graduation Test' },
}

const DISTRACTOR_COUNT = 3

function familyLabel(family: AssessmentFamily): string {
  return { 'kana-quiz': 'Kana Quiz', listening: 'Listening', 'word-builder': 'Word Builder', 'word-reading': 'Word Reading' }[family]
}

export function AssessmentPage() {
  const params = useParams<{ script: string }>()
  if (params.script === 'sokuon-chouon') return <SoundLengthAssessmentPage />
  return <ScriptAssessmentPage />
}

function ScriptAssessmentPage() {
  const params = useParams<{ script: string }>()
  const script: ScriptAssessment | null = params.script === 'katakana' ? 'katakana' : params.script === 'hiragana' ? 'hiragana' : params.script === 'youon-special-katakana' ? 'youon-special-katakana' : params.script === 'final-graduation' ? 'final-graduation' : null
  const { getScopeCharacterIds, getScopeQuizCharacterIds, getScopeWords } = useCurriculum()
  const markAssessmentCompleted = useProgressStore((s) => s.markAssessmentCompleted)

  const config = script ? SCRIPT_CONFIG[script] : null
  const characterIds = useMemo(
    () => script === 'final-graduation' ? [...new Set(['hiragana-summary', 'katakana-summary', 'other-summary', 'youon-summary'].flatMap((id) => getScopeQuizCharacterIds(id)))] : (config ? getScopeQuizCharacterIds(config.summaryRowId) : []),
    [config, getScopeQuizCharacterIds, script],
  )
  const distractorCharPool = useMemo(
    () => script === 'final-graduation' ? [...new Set(['hiragana-summary', 'katakana-summary', 'other-summary', 'youon-summary'].flatMap((id) => getScopeCharacterIds(id)))] : (config ? getScopeCharacterIds(config.summaryRowId) : []),
    [config, getScopeCharacterIds, script],
  )
  const words = useMemo(() => script === 'final-graduation' ? [...new Map(['hiragana-summary', 'katakana-summary', 'other-summary', 'youon-summary'].flatMap((id) => getScopeWords(id)).map((word) => [word.id, word])).values()] : (config ? getScopeWords(config.summaryRowId) : []), [config, getScopeWords, script])

  const [attempt, setAttempt] = useState(0)
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const sessionSeed = seed + attempt * 104729

  const plan = useMemo(() => {
    if (!config || characterIds.length === 0 || words.length === 0) return null
    const build = script === 'youon-special-katakana' ? buildYouonSpecialAssessmentPlan : script === 'final-graduation' ? buildFinalAssessmentPlan : buildAssessmentPlan
    return build({ characterIds, words, rng: createSeededRng(sessionSeed) })
  }, [config, characterIds, words, sessionSeed, script])

  const [roundIndex, setRoundIndex] = useState(0)
  const [answers, setAnswers] = useState<AssessmentAnswer[]>([])
  const [finished, setFinished] = useState(false)
  const { mood, onCorrect, onWrong, clear, resetSession } = useAnswerFeedback(script === 'final-graduation' ? 30 : 20)

  useEffect(() => {
    setRoundIndex(0)
    setAnswers([])
    setFinished(false)
  }, [sessionSeed])

  // Fires once per real attempt (sessionSeed changes on Retry, see
  // setAttempt above) — guarded by a ref so React StrictMode's dev-only
  // double-invoke of effects can't double-fire it.
  const startedSeedRef = useRef<number | null>(null)
  useEffect(() => {
    if (!script || !config || startedSeedRef.current === sessionSeed) return
    startedSeedRef.current = sessionSeed
    track('assessment_started', { assessment: script })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSeed, script])

  const questions = plan?.questions ?? []
  const currentQuestion: AssessmentQuestion | undefined = questions[roundIndex]

  const recordAnswer = (question: AssessmentQuestion, correct: boolean) => {
    setAnswers((prev) => [...prev, { question, correct }])
    if (correct) onCorrect()
    else {
      onWrong(
        question.characterId
          ? {
              id: question.characterId,
              kana: CHARACTERS_BY_ID[question.characterId]?.kana ?? '',
              romaji: CHARACTERS_BY_ID[question.characterId]?.romaji ?? '',
            }
          : { id: question.word?.id ?? '', kana: question.word?.kana ?? '', romaji: question.word?.romaji ?? '' },
      )
    }
  }

  const advance = () => {
    clear()
    if (roundIndex + 1 < questions.length) {
      setRoundIndex((i) => i + 1)
    } else if (config && answers.length === questions.length && !finished) {
      setFinished(true)
      const correct = answers.filter((answer) => answer.correct).length
      if (script === 'final-graduation') {
        const wasGraduated = useProgressStore.getState().graduation.graduated
        useProgressStore.getState().markFinalGraduationCompleted({ correct, total: questions.length })
        if (!wasGraduated && useProgressStore.getState().graduation.graduated) track('graduated')
      } else {
        markAssessmentCompleted(script as AssessmentScript, { correct, total: questions.length })
      }
      track('assessment_completed', { assessment: script ?? undefined, score: correct, attempt: questions.length })
    }
  }

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
    return <AssessmentResultsScreen script={script} config={config} answers={answers} onRetry={() => { resetSession(); setAttempt((value) => value + 1) }} />
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
          wordPool={words}
          mood={mood}
          onAnswered={(correct) => recordAnswer(currentQuestion, correct)}
          onAdvance={advance}
        />
      )}
    </div>
  )
}

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
          <button
            type="button"
            onClick={() => speak(`characters/${getCharacterAudioId(characterId)}`, char.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
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

function AssessmentListeningQuestion({
  word,
  wordPool,
  mood,
  onAnswered,
  onAdvance,
}: {
  word: AnchorWord
  wordPool: AnchorWord[]
  mood: ReturnType<typeof useAnswerFeedback>['mood']
  onAnswered: (correct: boolean) => void
  onAdvance: () => void
}) {
  const { speak, supported } = useTTS()
  const [choices, setChoices] = useState<AnchorWord[]>([])
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

  const handleChoice = (choice: AnchorWord) => {
    if (answered) return
    setSelectedId(choice.id)
    setAnswered(true)
    const correct = choice.id === word.id
    onAnswered(correct)
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <span className="text-6xl" aria-hidden="true">🔊</span>
        {supported && (
          <button
            type="button"
            onClick={() => speak(`words/${word.id}`, word.audioText ?? word.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
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

function AssessmentWordBuilderQuestion({
  word,
  distractorPool,
  mood,
  onAnswered,
  onAdvance,
}: {
  word: AnchorWord
  distractorPool: string[]
  mood: ReturnType<typeof useAnswerFeedback>['mood']
  onAnswered: (correct: boolean) => void
  onAdvance: () => void
}) {
  const { speak, supported } = useTTS()
  const [slots, setSlots] = useState<(string | null)[]>([])
  const [tray, setTray] = useState<WordBuilderTrayTile[]>([])
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong'>('playing')
  const [resultRecorded, setResultRecorded] = useState(false)
  const [targetTiles, setTargetTiles] = useState<FlatTargetTile[]>([])

  useEffect(() => {
    const distractorCharIds = pickDistractorCharIds(word.characterIds, distractorPool, DISTRACTOR_COUNT)
    const flatTarget = buildFlatTargetTiles(word.characterIds)
    const distractorTiles = distractorCharIds.flatMap((id) => displayGlyphsForCharId(id))
    const tileGlyphs = shuffle([...flatTarget.map((tile) => tile.glyph), ...distractorTiles])
    setTray(tileGlyphs.map((glyph, index) => ({ key: `${glyph}-${index}`, glyph, placed: false })))
    setTargetTiles(flatTarget)
    setSlots(new Array(flatTarget.length).fill(null))
    setStatus('playing')
    setResultRecorded(false)
    speak(`words/${word.id}`, word.audioText ?? word.kana)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id])

  useEffect(() => {
    if (resultRecorded) return
    if (slots.length === 0 || slots.some((slot) => slot === null)) return
    setResultRecorded(true)
    const placedGlyphs = slots.map((key) => tray.find((tile) => tile.key === key)?.glyph)
    const isCorrect = placedGlyphs.every((glyph, index) => glyph === targetTiles[index]?.glyph)
    if (isCorrect) {
      setStatus('correct')
      onAnswered(true)
    } else {
      setStatus('wrong')
      onAnswered(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  const handleTrayClick = (tile: WordBuilderTrayTile) => {
    if (status === 'correct') return
    const next = toggleWordBuilderTrayTile({ slots, tray }, tile.key)
    setSlots(next.slots)
    setTray(next.tray)
  }

  const handleSlotClick = (index: number) => {
    if (status === 'correct') return
    const next = removeWordBuilderSlot({ slots, tray }, index)
    setSlots(next.slots)
    setTray(next.tray)
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        {status !== 'playing' ? (
          <>
            <WordImage word={word} className="h-20 w-20" />
            <span className="text-lg font-semibold">{word.meaning}</span>
          </>
        ) : (
          <span className="text-6xl" aria-hidden="true">🔊</span>
        )}
        {supported && (
          <button
            type="button"
            onClick={() => speak(`words/${word.id}`, word.audioText ?? word.kana)}
            className="rounded-full bg-neutral-100 px-4 py-2 text-lg hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            aria-label="Replay audio"
          >
            🔊 Replay
          </button>
        )}
      </div>

      <div className="flex max-w-full flex-wrap justify-center gap-2">
        {slots.map((key, index) => {
          const tile = key ? tray.find((item) => item.key === key) : undefined
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleSlotClick(index)}
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
          <KanaTile key={tile.key} kana={tile.glyph} disabled={status === 'correct'} pressed={tile.placed} onClick={() => handleTrayClick(tile)} />
        ))}
      </div>
    </div>
  )
}

function AssessmentWordReadingQuestion({
  word,
  wordPool,
  mood,
  onAnswered,
  onAdvance,
}: {
  word: AnchorWord
  wordPool: AnchorWord[]
  mood: ReturnType<typeof useAnswerFeedback>['mood']
  onAnswered: (correct: boolean) => void
  onAdvance: () => void
}) {
  const speech = useWordReadingSpeech(word)
  const [showRomaji, setShowRomaji] = useState(false)
  const [romajiChoices, setRomajiChoices] = useState<{ id: string; romaji: string; correct: boolean }[]>([])
  const [finalResult, setFinalResult] = useState<'correct' | 'incorrect' | null>(null)

  useEffect(() => {
    speech.reset()
    setShowRomaji(false)
    setFinalResult(null)

    // Every distractor is another real word from this assessment's same-
    // script vocabulary pool. Deduplicate by romaji so the learner never
    // sees two visually identical answers.
    const seenRomaji = new Set([word.romaji])
    const uniquePool = wordPool.filter((candidate) => {
      if (candidate.id === word.id || seenRomaji.has(candidate.romaji)) return false
      seenRomaji.add(candidate.romaji)
      return true
    })
    const distractors = pickDistractorWords(word, uniquePool, 3)
    setRomajiChoices(
      shuffle([
        { id: 'correct', romaji: word.romaji, correct: true },
        ...distractors.map((candidate) => ({ id: candidate.id, romaji: candidate.romaji, correct: false })),
      ]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id])

  useEffect(() => {
    if (speech.state.kind !== 'result') return
    if (speech.state.result.outcome === 'success') {
      track('word_reading_speech_success')
      setFinalResult('correct')
      onAnswered(true)
    }
    // Incorrect/unrecognized speech is not a final knowledge error: retry
    // and Romaji fallback remain available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.state])

  const chooseRomaji = (choice: { id: string; romaji: string; correct: boolean }) => {
    if (finalResult) return
    setFinalResult(choice.correct ? 'correct' : 'incorrect')
    onAnswered(choice.correct)
  }

  const isSpeechFailure = speech.state.kind === 'result' && speech.state.result.outcome !== 'success' && !finalResult

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <span className="font-kana max-w-full whitespace-nowrap text-4xl font-bold sm:text-6xl"><UnbreakableKana kana={word.kana} /></span>
      </div>

      {finalResult && (
        <div
          data-testid="word-reading-reveal"
          className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900"
        >
          <p className={`text-lg font-bold ${finalResult === 'correct' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {finalResult === 'correct' ? 'Correct!' : 'Not quite.'}
          </p>
          <div data-testid="word-reading-image"><WordImage word={word} className="h-20 w-20" /></div>
          <p className="text-xl font-bold"><UnbreakableKana kana={word.kana} /> <span className="text-base font-normal">{word.romaji}</span></p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{word.meaning}</p>
        </div>
      )}

      {!finalResult && (
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          {!showRomaji && (
            <>
              {!isSpeechFailure && (
                <button
                  type="button"
                  onClick={speech.startListening}
                  disabled={!speech.speechSupported || speech.state.kind === 'listening'}
                  data-testid="word-reading-speak-button"
                  className="rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {speech.state.kind === 'listening' ? '🎤 Listening…' : '🎤 Speak'}
                </button>
              )}
              {!speech.speechSupported && (
                <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">Voice input isn&apos;t available in this browser — use the button below instead.</p>
              )}
              {isSpeechFailure && !speech.retryUsed && (
                <button type="button" onClick={() => { track('word_reading_speech_retry'); speech.tryAgain() }} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Try Again</button>
              )}
              <button type="button" onClick={() => { track('word_reading_romaji_fallback'); setShowRomaji(true) }} className="rounded-full border px-5 py-2 text-sm font-semibold">
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

export function AssessmentResultsScreen({
  script,
  config,
  answers,
  onRetry,
}: {
  script: ScriptAssessment
  config: { categoryId: string; summaryRowId: string; label: string }
  answers: AssessmentAnswer[]
  onRetry: () => void
}) {
  const results = useMemo(() => computeAssessmentResults(answers), [answers])
  const recommendations = useMemo(() => script === 'youon-special-katakana' || script === 'final-graduation' ? [] : getPracticeRecommendations(results, script), [results, script])
  const backHref = script === 'hiragana' ? '/hiragana' : script === 'katakana' ? '/katakana' : '/youon'
  const weakKana = results.weakCharacterIds
    .map((id) => CHARACTERS_BY_ID[id])
    .filter((character): character is NonNullable<typeof character> => Boolean(character))
  const weakWords = results.weakWordIds
    .map((id) => answers.find((answer) => answer.question.word?.id === id)?.question.word)
    .filter((word): word is AnchorWord => Boolean(word))

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">{config.label} complete!</h1>
      <AssessmentScoreVisual correct={results.overallCorrect} total={results.overallTotal} isFinal={script === 'final-graduation'} />

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Kana → Sound</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">You can read kana</p>
          <p className="text-lg font-bold">{results.directionScores.kanaToSound.correct} / {results.directionScores.kanaToSound.total}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Sound → Kana</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">You can recognize kana by sound</p>
          <p className="text-lg font-bold">{results.directionScores.soundToKana.correct} / {results.directionScores.soundToKana.total}</p>
        </div>
      </div>

      {(weakKana.length > 0 || weakWords.length > 0) && (
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left dark:border-neutral-700 dark:bg-neutral-900">
          <h2 className="font-bold">Missed this round</h2>
          <ul className="mt-2 flex min-w-0 flex-col gap-1" data-testid="assessment-mistake-list">
            {weakKana.map((character) => (
              <li key={character.id} className="flex min-w-0 flex-wrap justify-between gap-x-3 text-neutral-600 dark:text-neutral-400">
                <span className="font-kana font-semibold text-neutral-800 dark:text-neutral-200">{character.kana}</span>
                <span className="break-all">{character.displayLabel ?? character.romaji}</span>
              </li>
            ))}
            {weakWords.map((word) => (
              <li key={word.id} className="flex min-w-0 flex-wrap justify-between gap-x-3 text-neutral-600 dark:text-neutral-400">
                <span className="font-kana break-all font-semibold text-neutral-800 dark:text-neutral-200">{word.kana}</span>
                <span className="break-all">{word.romaji}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <h2 className="font-bold">Suggested practice</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {recommendations.map((recommendation) => (
              <Link key={recommendation.to} to={recommendation.to} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                {recommendation.label}
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
