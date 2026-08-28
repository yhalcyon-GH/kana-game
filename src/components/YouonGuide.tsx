import { useLayoutEffect, useEffect, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTTS } from '../hooks/useTTS'
import { YOUON_GUIDE, YOUON_GUIDE_STEPS } from '../data/youonGuide'
import { DEFAULT_YOUON_GUIDE_LOCALE, YOUON_GUIDE_CONTENT } from '../data/youonGuideContent'
import { useProgressStore } from '../store/progressStore'

type Props = {
  // Overrides the default "mark completed" dismissal — used for a manual
  // Settings replay (see guideCatalog.ts), where dismissing must clear the
  // ephemeral replay target instead of ever touching
  // `hasCompletedYouonGuide`. Omitted for the normal automatic first-time
  // appearance (see PracticeHubPage's showYouonGuide).
  onDismiss?: () => void
}

// Bespoke multi-step full-screen Guide for Yōon (Issue #50) — Intro then
// numbered steps 1-4 then an unnumbered Katakana supplement, all narrating
// over the SAME completed slide image (it already has ①-④ drawn into a
// single piece of artwork, so there's no separate asset per step). Modeled
// on IntroGuide's step-advance mechanics, but route-targeted and reusing
// the onDismiss?-prop replay convention from LearnTracingGuide/PracticeGuide
// rather than being globally mounted.
export function YouonGuide({ onDismiss }: Props = {}) {
  const setCompleted = useProgressStore((s) => s.setHasCompletedYouonGuide)
  const { speak, stop } = useTTS()
  const [stepIndex, setStepIndex] = useState(0)
  const containerRef = useFocusTrap<HTMLDivElement>(true)

  const locale = YOUON_GUIDE_CONTENT[DEFAULT_YOUON_GUIDE_LOCALE]
  const stepId = YOUON_GUIDE_STEPS[stepIndex]
  const stepContent = locale.steps[stepId]

  // useLayoutEffect, not useEffect — see ConceptGuide's identical comment.
  useLayoutEffect(() => {
    speak(stepContent.audioKey, stepContent.subtitle, locale.lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId])

  useEffect(() => stop, [stop])

  const isLast = stepIndex === YOUON_GUIDE_STEPS.length - 1

  const finish = () => {
    stop()
    if (onDismiss) onDismiss()
    else setCompleted(true)
  }

  const advance = () => {
    stop()
    // Usable even while step audio is still playing — no wait/gate here.
    if (isLast) {
      finish()
      return
    }
    setStepIndex((i) => i + 1)
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Tamamizu explains small ya, yu, yo"
      tabIndex={-1}
      data-testid="youon-guide"
      className="fixed inset-0 z-50 flex flex-col bg-white p-4 dark:bg-neutral-900"
    >
      <div className="flex w-full shrink-0 justify-end">
        <button
          type="button"
          onClick={finish}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {locale.skipLabel}
        </button>
      </div>

      {/* Slide -> small gap -> subtitle -> flexible remaining space -> button
          — see ConceptGuide's identical comment for why the image wrapper
          sizes to content instead of a flex-1 centering box. */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-2">
        <div className="flex w-full items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}${YOUON_GUIDE.slideAsset}`}
            alt="Tamamizu explains small ya, yu, yo"
            className="w-full h-auto max-w-full object-contain sm:w-auto sm:max-h-[60vh]"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
        <p className="mt-3 max-w-sm shrink-0 text-center text-lg whitespace-pre-line sm:text-xl">{stepContent.subtitle}</p>
        <div className="flex-1" />
      </div>

      <button
        type="button"
        onClick={advance}
        className="mx-auto w-full max-w-xs shrink-0 rounded-full bg-blue-600 px-6 py-3 text-center font-semibold text-white hover:bg-blue-700"
      >
        {isLast ? locale.finalLabel : locale.nextLabel}
      </button>
    </div>
  )
}
