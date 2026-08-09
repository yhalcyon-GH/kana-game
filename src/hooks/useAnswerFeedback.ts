import { useMemo, useRef, useState } from 'react'
import { pickCorrectFeedback, pickIncorrectFeedback, pickPerfectFeedback } from '../lib/feedbackVoice'
import { useTTS } from './useTTS'

export type AnswerFeedback = { ok: boolean; text: string }

// A missed character/word: `id` is the character or word id (used to
// rebuild a review-only queue), `kana`/`romaji` are what to show for it.
export type Mistake = { id: string; kana: string; romaji: string }

// Shared "how'd I do" voice + on-screen comment for the graded mini-games
// (Kana Quiz, Listening, Kana Typing, Word Builder). Tracks a
// consecutive-correct streak (for the すごい/さいこう milestone lines, see
// lib/feedbackVoice.ts) in a ref rather than state since nothing renders
// the streak count itself. Also tracks every mistake made this session, so
// the finish screen can list them all and offer an immediate
// review-just-the-mistakes replay (see PracticeSummary).
export function useAnswerFeedback() {
  const { speak } = useTTS()
  const streakRef = useRef(0)
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [mistakes, setMistakes] = useState<Mistake[]>([])

  const onCorrect = () => {
    streakRef.current += 1
    const { id, text } = pickCorrectFeedback(streakRef.current)
    speak(`feedback/${id}`, text)
    setFeedback({ ok: true, text })
  }

  // Pass isNearMiss when the wrong answer was one character/dakuten off
  // from correct (see lib/answerCloseness.ts) — it gates whether おしい is
  // eligible to be picked.
  const onWrong = (mistake: Mistake, isNearMiss = false) => {
    streakRef.current = 0
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

  return { feedback, mistakes: uniqueMistakes, mistakeIds, onCorrect, onWrong, onPerfect, clear, resetSession }
}
