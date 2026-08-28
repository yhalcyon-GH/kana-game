import { useLayoutEffect, useEffect, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTTS } from '../hooks/useTTS'
import { CHOUON_GUIDE_STEPS } from '../data/chouonGuide'
import { DEFAULT_CHOUON_GUIDE_LOCALE, CHOUON_GUIDE_CONTENT } from '../data/chouonGuideContent'
import { useProgressStore } from '../store/progressStore'

type Props = {
  // Overrides the default "mark completed" dismissal — used for a manual
  // Settings replay (see guideCatalog.ts), where dismissing must clear the
  // ephemeral replay target instead of ever touching
  // `hasCompletedChouonGuide`. Omitted for the normal automatic first-time
  // appearance (see PracticeHubPage's showChouonGuide).
  onDismiss?: () => void
}

// Bespoke multi-step full-screen Guide for Chōon — 8 slides (Intro, a/i/u/
// e/o sound, Quiz, Answers), each with its OWN completed slide image (unlike
// Yōon's single shared image). Slide 7 (Quiz) is look-only: it never reads
// out answers, collects input, or touches any learning/SRS/Review state —
// Next just advances to slide 8, which shows the same quiz image with
// answers filled in. Modeled on YouonGuide.tsx's step-advance mechanics and
// onDismiss?-prop replay convention.
export function ChouonGuide({ onDismiss }: Props = {}) {
  const setCompleted = useProgressStore((s) => s.setHasCompletedChouonGuide)
  const { speak, stop } = useTTS()
  const [stepIndex, setStepIndex] = useState(0)
  const containerRef = useFocusTrap<HTMLDivElement>(true)

  const locale = CHOUON_GUIDE_CONTENT[DEFAULT_CHOUON_GUIDE_LOCALE]
  const step = CHOUON_GUIDE_STEPS[stepIndex]
  const stepContent = locale.steps[step.id]

  // useLayoutEffect, not useEffect — see ConceptGuide's identical comment.
  useLayoutEffect(() => {
    speak(stepContent.audioKey, stepContent.subtitle, locale.lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  useEffect(() => stop, [stop])

  const isLast = stepIndex === CHOUON_GUIDE_STEPS.length - 1

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
      aria-label="Tamamizu explains long vowels"
      tabIndex={-1}
      data-testid="chouon-guide"
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
            src={`${import.meta.env.BASE_URL}${step.slideAsset}`}
            alt="Tamamizu explains long vowels"
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
