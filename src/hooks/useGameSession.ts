import { useCallback, useEffect, useState } from 'react'
import { buildWeightedQueue } from '../lib/practiceSelection'

export const GAME_SESSION_ROUNDS = 8

type Options = {
  // Referentially stable (e.g. from useMemo) — changing identity restarts
  // the session, same as the effect that used to gate each page's own
  // startSession-on-mount call.
  ids: string[]
  weight: (id: string) => number
  onFinish: (correctCount: number, questionCount: number) => void
  resetSession: () => void
  // Overrides GAME_SESSION_ROUNDS — used by the summary rows' fixed
  // 15-question sessions (see useCurriculum's getScopeRounds).
  rounds?: number
  // Identifies which scope this session belongs to (typically the row id,
  // or REVIEW_SCOPE_ID) — the session restarts when THIS changes, not
  // whenever `ids` changes. `ids` is re-derived live from progress state
  // (see Review's mistake-driven weak-pool selection in useCurriculum), so
  // its LENGTH can change as a direct result of answering — a single
  // correct answer can drop a word/character below the weak threshold and
  // shrink the pool immediately. Restarting on ids.length used to treat
  // that as "the player navigated to a new scope," silently rebuilding the
  // queue and resetting roundIndex to 0 mid-session, right after a correct
  // answer — see WordBuilderPage, where one hit adjusts both the character
  // AND word review scores at once, making this trigger almost every round.
  sessionKey: string | undefined
}

// Shared round/queue/score state machine for the four graded mini-games
// (Kana Quiz, Kana Typing, Listening, Word Builder): builds a weighted
// practice queue from `ids`, tracks progress and correct-count through it,
// and fires onFinish once every session ends, with how many of its rounds
// were answered correctly out of the total. Each page still owns its own
// per-round setup (choices, tray tiles, etc.) via currentId/roundIndex —
// this hook only owns the queue itself.
export function useGameSession({ ids, weight, onFinish, resetSession, rounds = GAME_SESSION_ROUNDS, sessionKey }: Options) {
  const [queue, setQueue] = useState<string[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)

  const startSession = useCallback(() => {
    setQueue(buildWeightedQueue(ids, weight, Math.min(rounds, ids.length * 3)))
    setRoundIndex(0)
    setCorrectCount(0)
    setFinished(false)
    resetSession()
  }, [ids, weight, rounds, resetSession])

  useEffect(() => {
    if (ids.length > 0) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  // Replays just this session's mistakes, in place, from the finish screen.
  const startMistakeReview = useCallback((mistakeIds: string[]) => {
    setQueue(mistakeIds)
    setRoundIndex(0)
    setCorrectCount(0)
    setFinished(false)
    resetSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const advance = useCallback(() => {
    setRoundIndex((i) => {
      if (i + 1 >= queue.length) {
        setFinished(true)
        return i
      }
      return i + 1
    })
  }, [queue.length])

  useEffect(() => {
    if (finished && queue.length > 0) onFinish(correctCount, queue.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  return { queue, roundIndex, correctCount, setCorrectCount, finished, startSession, startMistakeReview, advance }
}
