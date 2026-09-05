import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { INTRO_GUIDE_STEPS } from '../data/introGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../data/introGuideContent'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTTS } from '../hooks/useTTS'
import { track } from '../lib/analytics/track'
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
  // Set by the reset effect below when a replay session starts from a
  // stale, non-zero `stepIndex` (the user previously exited past step 0).
  // On that render, `step` below is still derived from the STALE index —
  // the reset effect's `setStepIndex(0)` hasn't committed yet — so the
  // audio-start effect would otherwise fire for the wrong (stale) step.
  // This flag tells that one pass to skip playback entirely and let the
  // very next render (with the corrected stepIndex 0) start step 0's audio
  // instead. It's consumed (reset to false) the moment it's read, so it
  // only ever suppresses the single stale-render's playback.
  const skipResetAudioRef = useRef(false)

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
  useLayoutEffect(() => {
    if (!completed) {
      // If we're resetting away from a non-zero step, this same commit's
      // audio-start effect (below) still sees the OLD stepIndex (the
      // setStepIndex(0) below hasn't been rendered yet) — flag that one
      // pass so it skips playing the stale step's audio; the corrected
      // stepIndex=0 render that follows will start step 0's audio instead.
      if (stepIndex !== 0) {
        skipResetAudioRef.current = true
      }
      setStepIndex(0)
      // A fresh viewing session (e.g. Settings' "View introduction again")
      // may reuse this same mounted instance after a prior session already
      // played step 0's audio and recorded it in startedStepRef — without
      // clearing that here, the step-change effect below would see its
      // guard already satisfied for step 0 and skip replaying its audio.
      startedStepRef.current = null
      setPlaybackFailed(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed])

  const locale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]
  const step = INTRO_GUIDE_STEPS[stepIndex]
  const stepContent = locale.steps[step.id]

  // useLayoutEffect, not useEffect — a cold-launch first appearance (no
  // user gesture at all yet) still legitimately hits the browser's
  // autoplay policy with nothing to do about it (see IntroGuide's own
  // module comment / the PR description's "remaining unavoidable
  // constraint"), but for every OTHER case — e.g. Settings' "View
  // introduction again" flipping `completed` back to false from a button
  // tap — this keeps the very first speakStaticOnly call in the same
  // synchronous commit as that tap instead of a post-paint passive effect.
  useLayoutEffect(() => {
    if (completed) return
    // The reset effect above just flagged this pass as using a stale,
    // pre-reset step (see skipResetAudioRef's declaration) — skip playing
    // it; the next render's corrected stepIndex 0 will trigger this effect
    // again for the real step 0.
    if (skipResetAudioRef.current) {
      skipResetAudioRef.current = false
      return
    }
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
      track('intro_completed')
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

  const goBack = () => {
    if (stepIndex === 0) return
    stop()
    const prevIndex = stepIndex - 1
    const prevStep = INTRO_GUIDE_STEPS[prevIndex]
    const prevContent = locale.steps[prevStep.id]
    // Same "start audio from the gesture, let the step-change effect's
    // guard skip its own play()" trick as advance() above.
    playStep(prevStep.id, prevContent.audioKey, prevContent.subtitle, locale.lang)
    setStepIndex(prevIndex)
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
          onClick={() => { stop(); track('intro_completed'); setCompleted(true) }}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {locale.skipLabel}
        </button>
      </div>

      {/* Slide -> small gap -> subtitle -> flexible remaining space -> button.
          The image wrapper sizes to its own content (bounded by max-h on the
          <img>, object-contain still preserves aspect ratio, never crops)
          instead of a flex-1 box that would center it with dead space above/
          below — the trailing flex-1 spacer (not the image wrapper) absorbs
          whatever vertical space is left over on a tall screen. */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-2">
        <div className="flex w-full items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}${step.slideAsset}`}
            alt=""
            className="w-full h-auto max-w-full object-contain sm:w-auto sm:max-h-[60vh]"
            // Degrade safely if the asset isn't shipped yet — never a
            // broken-image icon (see Issue #29's "missing assets" note).
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
        <p className="mt-3 max-w-sm shrink-0 text-center text-lg whitespace-pre-line sm:text-xl">{stepContent.subtitle}</p>
        {playbackFailed && audioEnabled && (
          <button
            type="button"
            onClick={retryPlayback}
            className="mt-2 shrink-0 rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            🔊 Play narration
          </button>
        )}
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
