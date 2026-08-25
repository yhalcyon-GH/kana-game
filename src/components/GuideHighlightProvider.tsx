import { type ReactNode, useMemo, useState } from 'react'
import { GuideHighlightContext } from './GuideHighlightContext'

// Ephemeral UI coordination only: lets an in-content Guide highlight the
// persistent navigation without putting temporary visibility in progress.
export function GuideHighlightProvider({ children }: { children: ReactNode }) {
  const [reviewGuideVisible, setReviewGuideVisible] = useState(false)
  const value = useMemo(() => ({ reviewGuideVisible, setReviewGuideVisible }), [reviewGuideVisible])
  return <GuideHighlightContext.Provider value={value}>{children}</GuideHighlightContext.Provider>
}
