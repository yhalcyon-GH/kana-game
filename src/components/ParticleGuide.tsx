import { useLayoutEffect, useEffect, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTTS } from '../hooks/useTTS'
import { PARTICLE_GUIDE_STEPS } from '../data/particleGuide'
import { DEFAULT_PARTICLE_GUIDE_LOCALE, PARTICLE_GUIDE_CONTENT } from '../data/particleGuideContent'

type Props = {
  // Called on Skip/final "Got it!" dismissal. There is no automatic
  // first-time appearance for this Guide (see particleGuide.ts's comment —
  // particles have no dedicated curriculum row to trigger from), so this is
  // always supplied by the caller: the Hiragana page decides whether to
  // mark `hasCompletedParticleGuide` true (only the very first completion)
  // or leave it untouched (every later manual replay via "Ask Tamamizu
  // about particles").
  onDismiss: () => void
}

// Bespoke 3-step full-screen Guide for particles (は/へ/を pronunciation —
// see particleGuide.ts) — modeled directly on IntroGuide/YouonGuide's
// step-advance mechanics (same Back/Next/Skip/"Got it!" shape, same focus
// trap, same stop-on-step-change/stop-on-unmount audio rules). Unlike
// YouonGuide/SpecialKatakanaGuide (one shared slide for every step), each
// step here has its own slide image (see PARTICLE_GUIDE_STEPS), matching
// IntroGuide's per-step `slideAsset` convention instead.
export function ParticleGuide({ onDismiss }: Props) {
  const { speak, stop } = useTTS()
  const [stepIndex, setStepIndex] = useState(0)
  const containerRef = useFocusTrap<HTMLDivElement>(true)

  const locale = PARTICLE_GUIDE_CONTENT[DEFAULT_PARTICLE_GUIDE_LOCALE]
  const step = PARTICLE_GUIDE_STEPS[stepIndex]
  const stepContent = locale.steps[step.id]

  // useLayoutEffect, not useEffect — see ConceptGuide's identical comment.
  useLayoutEffect(() => {
    speak(stepContent.audioKey, stepContent.subtitle, locale.lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  useEffect(() => stop, [stop])

  const isLast = stepIndex === PARTICLE_GUIDE_STEPS.length - 1

  const finish = () => {
    stop()
    onDismiss()
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

  const goBack = () => {
    if (stepIndex === 0) return
    stop()
    setStepIndex((i) => i - 1)
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Tamamizu explains particles"
      tabIndex={-1}
      data-testid="particle-guide"
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
          — see ConceptGuide/YouonGuide's identical comment for why the
          image wrapper sizes to content instead of a flex-1 centering box. */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-2">
        <div className="flex w-full items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}${step.slideAsset}`}
            alt="Tamamizu explains particles"
            data-testid="particle-guide-image"
            className="w-full h-auto max-w-full object-contain sm:w-auto sm:max-h-[60vh]"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
        <p className="mt-3 max-w-sm shrink-0 text-center text-lg whitespace-pre-line sm:text-xl">{stepContent.subtitle}</p>
        <div className="flex-1" />
      </div>

      <div className="mx-auto flex w-full max-w-xs shrink-0 gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0}
          className="flex-1 rounded-full border border-neutral-300 px-6 py-3 text-center font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Back
        </button>
        <button
          type="button"
          onClick={advance}
          className="flex-1 rounded-full bg-blue-600 px-6 py-3 text-center font-semibold text-white hover:bg-blue-700"
        >
          {isLast ? locale.finalLabel : locale.nextLabel}
        </button>
      </div>
    </div>
  )
}
