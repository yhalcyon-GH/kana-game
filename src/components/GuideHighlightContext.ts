import { createContext, useContext } from 'react'

export type GuideHighlightContextValue = {
  reviewGuideVisible: boolean
  setReviewGuideVisible: (visible: boolean) => void
}

export const GuideHighlightContext = createContext<GuideHighlightContextValue>({
  reviewGuideVisible: false,
  setReviewGuideVisible: () => {},
})

export function useGuideHighlight() {
  return useContext(GuideHighlightContext)
}
