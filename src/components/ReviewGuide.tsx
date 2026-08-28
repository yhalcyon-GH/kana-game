import { useLayoutEffect } from 'react'
import { REVIEW_GUIDE } from '../data/reviewGuide'
import { DEFAULT_REVIEW_GUIDE_LOCALE, REVIEW_GUIDE_CONTENT } from '../data/reviewGuideContent'
import { useTTS } from '../hooks/useTTS'
import { useProgressStore } from '../store/progressStore'
import { useGuideHighlight } from './GuideHighlightContext'

type Props = {
  // Overrides the default "mark completed" dismissal — used for a manual
  // Settings replay (Issue #46), where dismissing must clear the ephemeral
  // replay target instead of ever touching `hasCompletedReviewGuide`.
  // Omitted for the normal automatic first-time appearance.
  onDismiss?: () => void
}

// Appears only from PracticeSummary, so the first Review explanation never
// interrupts a live question. The supplied art contains all visible copy.
export function ReviewGuide({ onDismiss }: Props = {}) {
  const setCompleted = useProgressStore((s) => s.setHasCompletedReviewGuide)
  const { setReviewGuideVisible } = useGuideHighlight()
  const { speak, stop } = useTTS()
  const content = REVIEW_GUIDE_CONTENT[DEFAULT_REVIEW_GUIDE_LOCALE]

  // useLayoutEffect, not useEffect — see ConceptGuide's identical comment:
  // this Guide mounts from PracticeSummary appearing after the user's last
  // answer tap, and a passive effect can fire too late for mobile browsers'
  // "recent user activation" window on <audio> playback.
  useLayoutEffect(() => {
    setReviewGuideVisible(true)
    speak(content.audioKey, content.speechText, content.lang)
    return () => {
      setReviewGuideVisible(false)
      stop()
    }
  }, [content, setReviewGuideVisible, speak, stop])

  const handleDismiss = () => {
    stop()
    if (onDismiss) onDismiss()
    else setCompleted(true)
  }

  return (
    <aside data-testid="review-guide" className="flex w-full max-w-xl flex-col items-center gap-3" aria-label="Review guide">
      <img
        src={`${import.meta.env.BASE_URL}${REVIEW_GUIDE.imageAsset}`}
        alt="Tamamizu explains Review"
        className="w-full max-w-xl object-contain"
      />
      <dl className="w-full max-w-xs text-base">
        <div className="mb-2">
          <dt className="font-semibold text-green-600 dark:text-green-400">Retry</dt>
          <dd className="text-neutral-600 dark:text-neutral-400">Practice this round's mistakes.</dd>
        </div>
        <div>
          <dt className="font-semibold text-orange-600 dark:text-orange-400">Review</dt>
          <dd className="text-neutral-600 dark:text-neutral-400">Practice saved kana and words anytime.</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={handleDismiss}
        className="w-full max-w-xs rounded-full bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600"
      >
        {content.dismissLabel}
      </button>
    </aside>
  )
}
