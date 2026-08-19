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
}

// Shared round/queue/score state machine for the four graded mini-games
// (Kana Quiz, Kana Typing, Listening, Word Builder): builds a weighted
// practice queue from `ids`, tracks progress and correct-count through it,
// and fires onFinish once every session ends, with how many of its rounds
// were answered correctly out of the total. Each page still owns its own
// per-round setup (choices, tray tiles, etc.) via currentId/roundIndex —
// this hook only owns the queue itself.
export function useGameSession({ ids, weight, onFinish, resetSession, rounds = GAME_SESSION_ROUNDS }: Options) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  useEffect(() => {
    if (ids.length > 0) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.length])

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
