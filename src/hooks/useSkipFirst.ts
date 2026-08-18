import { useRef } from 'react'

// A ref-backed flag for skipping an auto-play-on-load effect's very first
// firing (page mount) while still playing audio on every subsequent
// word/character change within the same session — the auto-play itself is
// wanted, just not as a surprise the instant a page opens.
export function useSkipFirst() {
  return useRef(true)
}
