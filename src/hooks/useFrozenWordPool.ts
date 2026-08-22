import { useMemo, useState } from 'react'
import type { AnchorWord } from '../data/types'

// Freezes `words` for as long as `sessionKey` stays the same — used by the
// word-based mini-games (Kana Typing, Listening, Word Builder) alongside
// useGameSession's own sessionKey-gated queue build, so every id in a
// session's queue keeps resolving to the SAME word object for the rest of
// that session.
//
// Review's word pool is recalculated live from mistake-driven weak-word
// selection (see useCurriculum) — a single correct answer can graduate a
// word out of Review and remove it from that live pool mid-session, while
// its id is still queued for a later round. Without
// freezing the resolver alongside the queue, that word became unresolvable
// (wordsById[id] undefined) even though the session itself hadn't ended,
// leaving the game rendering nothing for that round.
export function useFrozenWordPool(sessionKey: string | undefined, words: AnchorWord[]) {
  const [snapshot, setSnapshot] = useState(() => ({ key: sessionKey, words }))
  if (snapshot.key !== sessionKey) {
    setSnapshot({ key: sessionKey, words })
  }

  const wordIds = useMemo(() => snapshot.words.map((w) => w.id), [snapshot.words])
  const wordsById = useMemo(() => Object.fromEntries(snapshot.words.map((w) => [w.id, w])), [snapshot.words])

  return { wordIds, wordsById }
}
