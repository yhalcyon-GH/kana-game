import { useEffect, useRef, useState } from 'react'
import { UnbreakableKana } from '../../../components/UnbreakableKana'
import { WordImage } from '../../../components/WordImage'
import type { AnchorWord } from '../../../data/types'
import { useSpeechRecognition } from '../../../hooks/useSpeechRecognition'
import { useTTS } from '../../../hooks/useTTS'
import type { WordReadingAssessmentQuestion } from '../../../lib/assessment/types'
import { checkWordReadingAlternatives } from '../../../lib/wordReadingMatching'

type Props = {
  question: WordReadingAssessmentQuestion
  wordsById: Record<string, AnchorWord>
  onAnswer: (correct: boolean) => void
}

type Phase = 'idle' | 'listening' | 'unrecognized' | 'wrong' | 'success' | 'romaji'

// The one substantially new assessment question family (Issue #189): a
// written kana word only (no menu sheet, price, scene, image, meaning, or
// romaji — see this component's pre-answer render below), with a primary
// Speak route (browser speech recognition) and an explicit "Choose in
// Romaji" fallback — visually matching the other assessment/Practice
// question pages rather than the Restaurant/Cafe menu UI. Reuses only
// Restaurant/Cafe's underlying speech/romaji-matching LOGIC (see
// lib/wordReadingMatching.ts, itself built on restaurantMatching.ts's
// normalizeJapanese) and the generic useSpeechRecognition hook — never their
// menu presentation.
//
// Speech fairness: a recognition failure/no-match (`unrecognized` phase)
// never finalizes the answer — Try Again (one retry) and Choose in Romaji
// stay available, mirroring useOrderingGame's identical
// "speech miss is not final" rule for Restaurant/Cafe. Only a Romaji pick
// (right or wrong) or a successfully recognized correct reading finalizes
// the answer.
export function AssessmentWordReadingQuestion({ question, wordsById, onAnswer }: Props) {
  const { speak, supported: ttsSupported } = useTTS()
  const { supported: speechSupported, listening, listen } = useSpeechRecognition()
  const targetWord = wordsById[question.targetWordId]
  const candidateWords = question.romajiChoiceWordIds.map((id) => wordsById[id]).filter((w): w is AnchorWord => !!w)
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState<string | null>(null)
  const [retryUsed, setRetryUsed] = useState(false)
  const [selectedRomajiId, setSelectedRomajiId] = useState<string | null>(null)
  const answeredRef = useRef(false)

  useEffect(() => {
    setPhase('idle')
    setTranscript(null)
    setRetryUsed(false)
    setSelectedRomajiId(null)
    answeredRef.current = false
  }, [question.id])

  if (!targetWord) return null

  function finalize(correct: boolean) {
    if (answeredRef.current) return
    answeredRef.current = true
    onAnswer(correct)
  }

  async function handleSpeak() {
    setPhase('listening')
    const alternatives = await listen()
    setTranscript(alternatives[0] ?? null)
    if (alternatives.length === 0) {
      setPhase('unrecognized')
      return
    }
    const check = checkWordReadingAlternatives(alternatives, candidateWords, targetWord)
    if (check.outcome === 'success') {
      setPhase('success')
      finalize(true)
    } else {
      // Neither wrong-word nor unrecognized auto-scores wrong here — see
      // this file's top comment.
      setPhase('unrecognized')
    }
  }

  function handleTryAgain() {
    if (retryUsed) return
    setRetryUsed(true)
    void handleSpeak()
  }

  function handleChooseRomaji(word: AnchorWord) {
    setSelectedRomajiId(word.id)
    const correct = word.id === targetWord.id
    setPhase(correct ? 'success' : 'wrong')
    finalize(correct)
  }

  const revealed = phase === 'success' || phase === 'wrong'

  return (
    <div className="flex flex-col items-center gap-6">
      <span className="font-kana text-6xl font-bold whitespace-nowrap">
        <UnbreakableKana kana={targetWord.kana} />
      </span>

      {revealed && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-900">
          {phase === 'success' && <p className="text-lg font-bold text-green-600 dark:text-green-400">Correct!</p>}
          {phase === 'wrong' && <p className="text-lg font-bold text-red-600 dark:text-red-400">Not quite.</p>}
          <WordImage word={targetWord} className="h-20 w-20" />
          <p className="text-xl font-bold">{targetWord.romaji}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{targetWord.meaning}</p>
          {ttsSupported && (
            <button
              type="button"
              onClick={() => speak(`words/${targetWord.id}`, targetWord.audioText ?? targetWord.kana)}
              className="rounded-full border px-3 py-1 text-sm"
            >
              🔊 Hear it again
            </button>
          )}
        </div>
      )}

      {!revealed && phase !== 'romaji' && (
        <div className="flex flex-col items-center gap-3">
          {phase === 'unrecognized' && transcript !== null && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">I heard: 「{transcript}」</p>
          )}
          {phase === 'unrecognized' && <p className="text-sm font-semibold text-red-600 dark:text-red-400">I couldn&apos;t catch that.</p>}
          {phase !== 'unrecognized' && (
            <button
              type="button"
              onClick={handleSpeak}
              disabled={!speechSupported || listening}
              data-testid="word-reading-speak-button"
              className="rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {listening ? '🎤 Listening…' : '🎤 Speak'}
            </button>
          )}
          {!speechSupported && (
            <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
              Voice input isn&apos;t available in this browser — use the button below instead.
            </p>
          )}
          {phase === 'unrecognized' && !retryUsed && (
            <button type="button" onClick={handleTryAgain} className="rounded-full border px-5 py-2 text-sm font-semibold">
              Try Again
            </button>
          )}
          <button type="button" onClick={() => setPhase('romaji')} className="rounded-full border px-5 py-2 text-sm font-semibold">
            Choose in Romaji
          </button>
        </div>
      )}

      {phase === 'romaji' && (
        <div className="flex w-full flex-col items-center gap-2" data-testid="word-reading-romaji-fallback">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Choose the romaji</p>
          <div className="grid w-full max-w-xs grid-cols-2 gap-2">
            {candidateWords.map((word) => (
              <button
                key={word.id}
                type="button"
                onClick={() => handleChooseRomaji(word)}
                data-testid={`word-reading-romaji-${word.id}`}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold hover:border-blue-400 active:scale-95 dark:border-neutral-600 ${
                  selectedRomajiId === word.id ? 'border-blue-500 bg-blue-50' : 'border-neutral-300'
                }`}
              >
                {word.romaji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
