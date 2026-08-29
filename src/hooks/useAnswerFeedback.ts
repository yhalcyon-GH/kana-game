import { useMemo, useRef, useState } from 'react'
import type { MascotMood } from '../components/Mascot'
import type { QuestionMode } from '../data/feedback'
import { pickCorrectFeedback, pickIncorrectFeedback, pickResultFeedback } from '../lib/feedbackVoice'
import { useTTS } from './useTTS'

export type AnswerFeedback = { ok: boolean; text: string }

// Same milestone the すごい voice line uses (see data/feedback.ts's
// STREAK_MILESTONES) — reusing it keeps the mascot's excited face in sync
// with the first praise milestone, in both 8- and 15-question modes.
const STREAK_MOOD_THRESHOLD = 5

// A missed character/word: `id` is the character or word id (used to
// rebuild a review-only queue), `kana`/`romaji` are what to show for it.
export type Mistake = { id: string; kana: string; romaji: string }

// Shared "how'd I do" voice + on-screen comment for the graded mini-games
// (Kana Quiz, Listening, Kana Typing, Word Builder). `mode` is the session's
// question count (8 or 15, see useGameSession/useCurriculum) — it decides
// which streak counts get a dedicated milestone voice line, see
// lib/feedbackVoice.ts. Tracks a consecutive-correct streak in both a ref
// (for the synchronous read pickCorrectFeedback needs) and state (so `mood`
// can react to it), plus the last-picked line id per pool (so the same line
// never plays twice in a row). Also tracks every mistake made this session,
// so the finish screen can list them all and offer an immediate
// review-just-the-mistakes replay (see PracticeSummary).
export function useAnswerFeedback(mode: QuestionMode) {
  const { speak } = useTTS()
  const streakRef = useRef(0)
  const [streak, setStreak] = useState(0)
  const lastCorrectIdRef = useRef<string | null>(null)
  const lastWrongIdRef = useRef<string | null>(null)
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [finishFeedback, setFinishFeedback] = useState<AnswerFeedback | null>(null)
  const [finishMood, setFinishMood] = useState<MascotMood | null>(null)

  const onCorrect = () => {
    streakRef.current += 1
    setStreak(streakRef.current)
    const { id, text } = pickCorrectFeedback(streakRef.current, mode, lastCorrectIdRef.current)
    lastCorrectIdRef.current = id
    speak(`feedback/${id}`, text)
    setFeedback({ ok: true, text })
  }

  // `isNearMiss` (see lib/nearMiss.ts) is optional and defaults to false —
  // only a caller that has actually established the wrong answer was close
  // should pass true; see pickIncorrectFeedback.
  const onWrong = (mistake: Mistake, isNearMiss = false) => {
    streakRef.current = 0
    setStreak(0)
    const { id, text } = pickIncorrectFeedback(lastWrongIdRef.current, isNearMiss)
    lastWrongIdRef.current = id
    speak(`feedback/${id}`, text)
    setFeedback({ ok: false, text })
    setMistakes((m) => [...m, mistake])
  }

  // Call once when a session finishes, with how many of its questions were
  // answered correctly out of the total — picks and speaks the matching
  // evaluation-screen line (かんぺき/すごい/その調子/がんばれ/ファイト, judged
  // by accuracy, see lib/feedbackVoice.ts's pickResultFeedback) and derives
  // a matching mascot mood for PracticeSummary. かんぺき/すごい (80%+) get the
  // excited "streak" face, その調子 (60-80%) gets the happy "correct" face,
  // がんばれ/ファイト (below 60%) get incorrect's gentler, comforting face.
  const onFinish = (correctCount: number, questionCount: number) => {
    const { id, text } = pickResultFeedback(correctCount, questionCount)
    speak(`feedback/${id}`, text)
    const accuracy = correctCount / questionCount
    setFinishFeedback({ ok: accuracy >= 0.8, text })
    setFinishMood(accuracy >= 0.8 ? 'streak' : accuracy >= 0.6 ? 'correct' : 'incorrect')
  }

  // Call when moving to a new round, so the previous round's comment
  // doesn't linger — leaves the streak and mistake list alone.
  const clear = () => setFeedback(null)

  // Call when starting/retrying a whole session.
  const resetSession = () => {
    streakRef.current = 0
    setStreak(0)
    lastCorrectIdRef.current = null
    lastWrongIdRef.current = null
    setFeedback(null)
    setMistakes([])
    setFinishFeedback(null)
    setFinishMood(null)
  }

  // De-duplicated by id, in first-missed order — a word gotten wrong twice
  // (e.g. missed again during a mistake-review replay) only appears once.
  const uniqueMistakes = useMemo(() => {
    const seen = new Set<string>()
    return mistakes.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
  }, [mistakes])
  const mistakeIds = useMemo(() => uniqueMistakes.map((m) => m.id), [uniqueMistakes])

  const mood: MascotMood =
    feedback == null ? 'normal' : feedback.ok ? (streak >= STREAK_MOOD_THRESHOLD ? 'streak' : 'correct') : 'incorrect'

  return {
    feedback,
    mood,
    mistakes: uniqueMistakes,
    mistakeIds,
    onCorrect,
    onWrong,
    onFinish,
    finishFeedback,
    finishMood,
    clear,
    resetSession,
  }
}
