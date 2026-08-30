import { useSearchParams } from 'react-router-dom'

// Search-param name used to force a specific Guide to display on its real
// target screen (Issue #46), without touching that Guide's persisted
// completed flag or any learning/progress state. Kept ephemeral (URL-only,
// never written to progressStore) so it survives a reload but never
// resets/duplicates the persisted "seen it once" state the automatic
// first-time Guides rely on.
export const GUIDE_REPLAY_PARAM = 'guide'

export function buildGuideReplayHref(path: string, guideId: string): string {
  return `${path}?${GUIDE_REPLAY_PARAM}=${guideId}`
}

// The raw `?guide=` value for the current URL, or null if absent — lets a
// page with several candidate Guides (e.g. the hiragana/a-row hub, which
// hosts both Learn/Tracing and Practice) tell "a replay for one of MY
// Guides is active" apart from "no replay, or a replay meant for some other
// screen entirely," so it can suppress its other Guides' automatic
// first-time conditions only in the former case. See PracticeHubPage's
// `isKnownReplayHere`.
export function useActiveGuideReplayId(): string | null {
  const [searchParams] = useSearchParams()
  return searchParams.get(GUIDE_REPLAY_PARAM)
}

// One instance per candidate Guide id on a page — `isReplaying` is true only
// when the current URL's `?guide=` value exactly matches `guideId`, so at
// most one Guide's replay can ever be active at a time (see the Issue's
// "never shows two Guides simultaneously"). An unrecognized `?guide=` value
// simply matches nothing, which is what makes invalid replay ids fail safe.
export function useGuideReplay(guideId: string) {
  const [searchParams, setSearchParams] = useSearchParams()
  const isReplaying = searchParams.get(GUIDE_REPLAY_PARAM) === guideId

  const startReplay = () => {
    const next = new URLSearchParams(searchParams)
    next.set(GUIDE_REPLAY_PARAM, guideId)
    setSearchParams(next)
  }

  const dismissReplay = () => {
    const next = new URLSearchParams(searchParams)
    next.delete(GUIDE_REPLAY_PARAM)
    setSearchParams(next, { replace: true })
  }

  return { isReplaying, startReplay, dismissReplay }
}
