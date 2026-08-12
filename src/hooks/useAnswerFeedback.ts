import { useMemo, useRef, useState } from 'react'
import type { MascotMood } from '../components/Mascot'
import { pickCorrectFeedback, pickIncorrectFeedback, pickPerfectFeedback } from '../lib/feedbackVoice'
import { useTTS } from './useTTS'

export type AnswerFeedback = { ok: boolean; text: string }

// Same milestone the すごい/さいこう voice lines use (see lib/feedbackVoice) —
// reusing it keeps the mascot's excited face in sync with the praise line.
const STREAK_MOOD_THRESHOLD = 3

// A missed character/word: `id` is the character or word id (used to
// rebuild a review-only queue), `kana`/`romaji` are what to show for it.
export type Mistake = { id: string; kana: string; romaji: string }

// Shared "how'd I do" voice + on-screen comment for the graded mini-games
// (Kana Quiz, Listening, Kana Typing, Word Builder). Tracks a
// consecutive-correct streak (for the すごい/さいこう milestone lines, see
// lib/feedbackVoice.ts, and for the mascot's excited face below) in both a
// ref (for the synchronous read pickCorrectFeedback needs) and state (so
// `mood` can react to it). Also tracks every mistake made this session, so
// the finish screen can list them all and offer an immediate
// review-just-the-mistakes replay (see PracticeSummary).
export function useAnswerFeedback() {
  const { speak } = useTTS()
  const streakRef = useRef(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [mistakes, setMistakes] = useState<Mistake[]>([])

  const onCorrect = () => {
    streakRef.current += 1
    setStreak(streakRef.current)
    const { id, text } = pickCorrectFeedback(streakRef.current)
    speak(`feedback/${id}`, text)
    setFeedback({ ok: true, text })
  }

  // Pass isNearMiss when the wrong answer was one character/dakuten off
  // from correct (see lib/answerCloseness.ts) — it gates whether おしい is
  // eligible to be picked.
  const onWrong = (mistake: Mistake, isNearMiss = false) => {
    streakRef.current = 0
    setStreak(0)
    const { id, text } = pickIncorrectFeedback(isNearMiss)
    speak(`feedback/${id}`, text)
    setFeedback({ ok: false, text })
    setMistakes((m) => [...m, mistake])
  }

  // Call once when a session finishes with a perfect score.
  const onPerfect = () => {
    const { id, text } = pickPerfectFeedback()
    speak(`feedback/${id}`, text)
  }

  // Call when moving to a new round, so the previous round's comment
  // doesn't linger — leaves the streak and mistake list alone.
  const clear = () => setFeedback(null)

  // Call when starting/retrying a whole session.
  const resetSession = () => {
    streakRef.current = 0
    setStreak(0)
    setFeedback(null)
    setMistakes([])
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

  return { feedback, mood, mistakes: uniqueMistakes, mistakeIds, onCorrect, onWrong, onPerfect, clear, resetSession }
}
