import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { matchResumableRoute } from '../lib/lastStudied'
import { useProgressStore } from '../store/progressStore'

// Centralized tracker for Home's Continue card (Issue #23) — mounted once
// in App.tsx rather than adding a tracking call to each of the 6 individual
// page components, so none of their existing (already-tested) logic needs
// touching. Pure navigation bookkeeping: never reads or writes Recommended
// Path/completion/Review/SRS/mastery state.
export function useTrackLastStudied() {
  const location = useLocation()
  const setLastStudied = useProgressStore((s) => s.setLastStudied)

  useEffect(() => {
    const entry = matchResumableRoute(location.pathname)
    if (entry) setLastStudied(entry)
  }, [location.pathname, setLastStudied])
}
