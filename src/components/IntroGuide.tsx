import { useEffect, useState } from 'react'
import { INTRO_GUIDE_STEPS } from '../data/introGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../data/introGuideContent'
import { useTTS } from '../hooks/useTTS'
import { useProgressStore } from '../store/progressStore'

// Tamamizu Guide Phase 1 (Issue #29) — the one-time first-launch
// introduction. Deliberately dumb about CONTENT: this component only knows
// how to show the current step's slide/mascot/subtitle, play its audio, and
// advance/skip — every step's actual copy, asset paths, and button labels
// come from data/introGuide.ts (step structure) + data/introGuideContent.ts
// (locale text/audio), so swapping assets/copy or adding a locale later
// never touches this file.
export function IntroGuide() {
  const completed = useProgressStore((s) => s.hasCompletedIntroGuide)
  const setCompleted = useProgressStore((s) => s.setHasCompletedIntroGuide)
  const { speak } = useTTS()
  const [stepIndex, setStepIndex] = useState(0)

  // Settings' "View introduction again" flips `completed` back to false on
  // an instance that may already be past step 0 from a prior viewing —
  // this component stays mounted throughout (see App.tsx), so its own
  // local step state wouldn't otherwise reset on its own.
  useEffect(() => {
    if (!completed) setStepIndex(0)
  }, [completed])

  const locale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]
  const step = INTRO_GUIDE_STEPS[stepIndex]
  const stepContent = locale.steps[step.id]

  useEffect(() => {
    if (completed) return
    speak(stepContent.audioKey, stepContent.subtitle, locale.lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, step.id])

  if (completed) return null

  const isLast = stepIndex === INTRO_GUIDE_STEPS.length - 1

  const advance = () => {
    // Usable even while step audio is still playing — no wait/gate here.
    if (isLast) {
      setCompleted(true)
      return
    }
    setStepIndex((i) => i + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between gap-6 bg-white p-6 dark:bg-neutral-900">
      <div className="flex w-full justify-end">
        <button
          type="button"
          onClick={() => setCompleted(true)}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {locale.skipLabel}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        {step.slideAsset && (
          <img
            src={`${import.meta.env.BASE_URL}${step.slideAsset}`}
            alt=""
            className="max-h-56 w-full max-w-xs object-contain"
            // Degrade safely if the asset isn't shipped yet — never a
            // broken-image icon (see Issue #29's "missing assets" note).
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        <img
          src={`${import.meta.env.BASE_URL}${step.mascotAsset}`}
          alt=""
          className={step.slideAsset ? 'h-16 w-16' : 'h-32 w-32'}
        />
        <p className="max-w-sm text-center text-lg whitespace-pre-line">{stepContent.subtitle}</p>
      </div>

      <button
        type="button"
        onClick={advance}
        className="w-full max-w-xs rounded-full bg-blue-600 px-6 py-3 text-center font-semibold text-white hover:bg-blue-700"
      >
        {isLast ? locale.finalLabel : locale.nextLabel}
      </button>
    </div>
  )
}
