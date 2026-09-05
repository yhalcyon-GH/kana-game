import { useEffect, useRef } from 'react'
import { track } from '../lib/analytics/track'

// Shared practice_started/practice_completed instrumentation for the four
// graded mini-games (Kana Quiz, Kana Typing, Listening, Word Builder) —
// each already has its own `useGameSession`/`useAnswerFeedback` wiring (see
// those hooks); this only observes their existing `sessionKey`/`finished`
// state the same way each page's own markRowActivityCompleted effect
// already does, rather than changing either shared hook itself.
//
// `started` fires once per sessionKey change (a real session identity
// change, e.g. a different row or Retry bumping sessionAttempt — see each
// page's own sessionKey construction), guarded by a ref so React
// StrictMode's dev-only double-invoke of effects can't double-fire it.
// `completed` fires once per finished-session, gated on `finished` itself
// flipping (mirrors KanaQuizPage's existing markRowActivityCompleted
// effect, which the same reasoning already applies to).
export function usePracticeAnalytics(
  activity: string,
  categoryId: string | undefined,
  rowId: string | undefined,
  sessionKey: string | undefined,
  finished: boolean,
  correctCount: number,
  questionCount: number,
) {
  const startedSessionRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!sessionKey || !rowId || startedSessionRef.current === sessionKey) return
    startedSessionRef.current = sessionKey
    track('practice_started', { activity, category: categoryId, row: rowId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, rowId])

  useEffect(() => {
    if (!finished || !rowId || questionCount === 0) return
    track('practice_completed', { activity, category: categoryId, row: rowId, score: correctCount, attempt: questionCount })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, rowId])
}
