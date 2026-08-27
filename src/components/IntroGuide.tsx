import { useEffect, useRef, useState } from 'react'
import { INTRO_GUIDE_STEPS } from '../data/introGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../data/introGuideContent'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTTS } from '../hooks/useTTS'
import { useProgressStore } from '../store/progressStore'

// Tamamizu Guide (Issue #29/#31) — the one-time first-launch introduction.
// Deliberately dumb about CONTENT: this component only knows how to show
// the current step's slide + subtitle, play its audio, and advance/skip —
// every step's actual copy, asset path, and button labels come from
// data/introGuide.ts (step structure) + data/introGuideContent.ts (locale
// text/audio), so swapping assets/copy or adding a locale later never
// touches this file. Tamamizu is drawn into each slide's own artwork, so
// there's no separate mascot image to render here.
export function IntroGuide() {
  const completed = useProgressStore((s) => s.hasCompletedIntroGuide)
  const setCompleted = useProgressStore((s) => s.setHasCompletedIntroGuide)
  const audioEnabled = useProgressStore((s) => s.audioEnabled)
  const { speakStaticOnly, stop } = useTTS()
  const [stepIndex, setStepIndex] = useState(0)
  // True once static playback for the CURRENT step has failed (missing
  // clip, or blocked by the browser's autoplay policy) — surfaces a manual
  // retry control instead of ever falling back to a different (non-
  // Tamamizu) Web Speech voice reading the narration.
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const containerRef = useFocusTrap<HTMLDivElement>(!completed)
  // Guards against the step-change effect re-triggering playback for a
  // step whose audio the Next-button handler already started as part of
  // the same user gesture (advance() bumps stepIndex, which would
  // otherwise cause the effect below to call speakStaticOnly a second
  // time for that step).
  const startedStepRef = useRef<string | null>(null)

  const playStep = (stepId: string, audioKey: string, fallbackText: string, lang: string) => {
    startedStepRef.current = stepId
    setPlaybackFailed(false)
    speakStaticOnly(audioKey, fallbackText, lang).then((started) => {
      if (!started) setPlaybackFailed(true)
    })
  }

  // Settings' "View introduction again" flips `completed` back to false on
  // an instance that may already be past step 0 from a prior viewing —
  // this component stays mounted throughout (see App.tsx), so its own
  // local step state wouldn't otherwise reset on its own.
  useEffect(() => {
    if (!completed) {
      setStepIndex(0)
      // A fresh viewing session (e.g. Settings' "View introduction again")
      // may reuse this same mounted instance after a prior session already
      // played step 0's audio and recorded it in startedStepRef — without
      // clearing that here, the step-change effect below would see its
      // guard already satisfied for step 0 and skip replaying its audio.
      startedStepRef.current = null
      setPlaybackFailed(false)
    }
  }, [completed])

  const locale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]
  const step = INTRO_GUIDE_STEPS[stepIndex]
  const stepContent = locale.steps[step.id]

  useEffect(() => {
    if (completed) return
    // Next's onClick already started this exact step's audio as part of
    // the same user gesture — don't double-play it here.
    if (startedStepRef.current === step.id) return
    playStep(step.id, stepContent.audioKey, stepContent.subtitle, locale.lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, step.id])

  useEffect(() => stop, [stop])

  if (completed) return null

  const isLast = stepIndex === INTRO_GUIDE_STEPS.length - 1

  const advance = () => {
    stop()
    // Usable even while step audio is still playing — no wait/gate here.
    if (isLast) {
      setCompleted(true)
      return
    }
    const nextIndex = stepIndex + 1
    const nextStep = INTRO_GUIDE_STEPS[nextIndex]
    const nextContent = locale.steps[nextStep.id]
    // This click IS a user gesture, so use it to start the next slide's
    // static audio right away (helps it dodge autoplay blocking) — the
    // step-change effect above sees startedStepRef already set and skips
    // its own play() for this step.
    playStep(nextStep.id, nextContent.audioKey, nextContent.subtitle, locale.lang)
    setStepIndex(nextIndex)
  }

  const retryPlayback = () => {
    playStep(step.id, stepContent.audioKey, stepContent.subtitle, locale.lang)
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Tamamizu Guide"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-white p-4 dark:bg-neutral-900"
    >
      <div className="flex w-full shrink-0 justify-end">
        <button
          type="button"
          onClick={() => { stop(); setCompleted(true) }}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {locale.skipLabel}
        </button>
      </div>

      {/* min-h-0 on every flex ancestor down to the image is what lets the
          slide actually grow to fill the remaining width AND height (object-
          contain still preserves its aspect ratio, never crops) — a plain
          flex-1 alone can't shrink an item below its content's natural size. */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 py-2">
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}${step.slideAsset}`}
            alt=""
            className="max-h-full max-w-full object-contain"
            // Degrade safely if the asset isn't shipped yet — never a
            // broken-image icon (see Issue #29's "missing assets" note).
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
        <p className="max-w-sm shrink-0 text-center text-base whitespace-pre-line sm:text-lg">{stepContent.subtitle}</p>
        {playbackFailed && audioEnabled && (
          <button
            type="button"
            onClick={retryPlayback}
            className="shrink-0 rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            🔊 Play narration
          </button>
        )}
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
