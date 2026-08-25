import { useEffect, useState } from 'react'
import { KANA_INTRO_EXCERPT_STEP_IDS } from '../data/kanaIntroExcerptGuide'
import { DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE, KANA_INTRO_EXCERPT_GUIDE_CONTENT } from '../data/kanaIntroExcerptGuideContent'
import { INTRO_GUIDE_STEPS } from '../data/introGuide'
import { DEFAULT_INTRO_GUIDE_LOCALE, INTRO_GUIDE_CONTENT } from '../data/introGuideContent'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTTS } from '../hooks/useTTS'

const STEPS = KANA_INTRO_EXCERPT_STEP_IDS.map((id) => INTRO_GUIDE_STEPS.find((step) => step.id === id)!)

type Props = {
  onDismiss: () => void
}

// Hiragana/Katakana section replay (Issue #46) — an ephemeral, two-step
// excerpt of the Introduction ("kana represent sounds" -> "Hiragana vs
// Katakana usage"), reusing PR #43's step data/copy/audio verbatim. Never
// reads or writes `hasCompletedIntroGuide` or any other progress state —
// dismissing (Next past the last step, or Close) just calls `onDismiss`.
export function KanaIntroExcerptGuide({ onDismiss }: Props) {
  const { speak, stop } = useTTS()
  const [stepIndex, setStepIndex] = useState(0)
  const containerRef = useFocusTrap<HTMLDivElement>(true)

  const locale = INTRO_GUIDE_CONTENT[DEFAULT_INTRO_GUIDE_LOCALE]
  const excerptLocale = KANA_INTRO_EXCERPT_GUIDE_CONTENT[DEFAULT_KANA_INTRO_EXCERPT_GUIDE_LOCALE]
  const step = STEPS[stepIndex]
  const stepContent = locale.steps[step.id]

  useEffect(() => {
    speak(stepContent.audioKey, stepContent.subtitle, locale.lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  useEffect(() => stop, [stop])

  const isLast = stepIndex === STEPS.length - 1

  const advance = () => {
    stop()
    if (isLast) {
      onDismiss()
      return
    }
    setStepIndex((i) => i + 1)
  }

  const close = () => {
    stop()
    onDismiss()
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={excerptLocale.buttonLabel}
      tabIndex={-1}
      data-testid="kana-intro-excerpt-guide"
      className="fixed inset-0 z-50 flex flex-col bg-white p-4 dark:bg-neutral-900"
    >
      <div className="flex w-full shrink-0 justify-end">
        <button
          type="button"
          onClick={close}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {excerptLocale.closeLabel}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 py-2">
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}${step.slideAsset}`}
            alt=""
            className="max-h-full max-w-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
        <p className="max-w-sm shrink-0 text-center text-base whitespace-pre-line sm:text-lg">{stepContent.subtitle}</p>
      </div>

      <button
        type="button"
        onClick={advance}
        className="mx-auto w-full max-w-xs shrink-0 rounded-full bg-blue-600 px-6 py-3 text-center font-semibold text-white hover:bg-blue-700"
      >
        {isLast ? excerptLocale.doneLabel : excerptLocale.nextLabel}
      </button>
    </div>
  )
}
