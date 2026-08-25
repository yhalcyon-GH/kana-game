import { useEffect } from 'react'
import { useTTS } from '../hooks/useTTS'

type ConceptGuideProps = {
  testId: string
  imageAsset: string
  imageAlt: string
  lang: string
  subtitle: string
  audioKey: string
  dismissLabel: string
  onDismiss: () => void
}

// Shared only by the short concept slides that genuinely need the same
// full-screen image + subtitle + narration pattern. Target logic, locale
// content, and persisted state deliberately remain outside this component.
export function ConceptGuide({
  testId,
  imageAsset,
  imageAlt,
  lang,
  subtitle,
  audioKey,
  dismissLabel,
  onDismiss,
}: ConceptGuideProps) {
  const { speak, stop } = useTTS()

  useEffect(() => {
    speak(audioKey, subtitle, lang)
    return stop
  }, [audioKey, lang, speak, stop, subtitle])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={imageAlt}
      data-testid={testId}
      className="fixed inset-0 z-50 flex flex-col bg-white p-4 dark:bg-neutral-900"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 py-2">
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}${imageAsset}`}
            alt={imageAlt}
            className="max-h-full max-w-full object-contain"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        </div>
        <p className="max-w-md shrink-0 text-center text-base whitespace-pre-line sm:text-lg">{subtitle}</p>
      </div>

      <button
        type="button"
        onClick={() => {
          stop()
          onDismiss()
        }}
        className="mx-auto w-full max-w-xs shrink-0 rounded-full bg-blue-600 px-6 py-3 text-center font-semibold text-white hover:bg-blue-700"
      >
        {dismissLabel}
      </button>
    </div>
  )
}
