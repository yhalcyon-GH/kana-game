import { useEffect } from 'react'
import { REVIEW_GUIDE } from '../data/reviewGuide'
import { DEFAULT_REVIEW_GUIDE_LOCALE, REVIEW_GUIDE_CONTENT } from '../data/reviewGuideContent'
import { useTTS } from '../hooks/useTTS'
import { useProgressStore } from '../store/progressStore'
import { useGuideHighlight } from './GuideHighlightContext'

// Appears only from PracticeSummary, so the first Review explanation never
// interrupts a live question. The supplied art contains all visible copy.
export function ReviewGuide() {
  const setCompleted = useProgressStore((s) => s.setHasCompletedReviewGuide)
  const { setReviewGuideVisible } = useGuideHighlight()
  const { speak, stop } = useTTS()
  const content = REVIEW_GUIDE_CONTENT[DEFAULT_REVIEW_GUIDE_LOCALE]

  useEffect(() => {
    setReviewGuideVisible(true)
    speak(content.audioKey, content.speechText, content.lang)
    return () => {
      setReviewGuideVisible(false)
      stop()
    }
  }, [content, setReviewGuideVisible, speak, stop])

  return (
    <aside data-testid="review-guide" className="flex w-full max-w-xl flex-col items-center gap-3" aria-label="Review guide">
      <img
        src={`${import.meta.env.BASE_URL}${REVIEW_GUIDE.imageAsset}`}
        alt="Tamamizu explains Review"
        className="w-full max-w-xl object-contain"
      />
      <button
        type="button"
        onClick={() => { stop(); setCompleted(true) }}
        className="w-full max-w-xs rounded-full bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600"
      >
        {content.dismissLabel}
      </button>
    </aside>
  )
}
