import { useLayoutEffect } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
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
  const containerRef = useFocusTrap<HTMLDivElement>(true)

  // useLayoutEffect (not useEffect) — this Guide typically mounts because a
  // parent screen just rendered in response to a tap/navigation, not from
  // its own gesture. A passive useEffect only runs after the browser has
  // painted the new screen, which can already be too late for a mobile
  // browser's "recent user activation" window on an <audio> element;
  // useLayoutEffect fires synchronously in the same commit, right after the
  // triggering gesture, giving playback the best real chance to start.
  useLayoutEffect(() => {
    speak(audioKey, subtitle, lang)
    return stop
  }, [audioKey, lang, speak, stop, subtitle])

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={imageAlt}
      tabIndex={-1}
      data-testid={testId}
      className="fixed inset-0 z-50 flex flex-col bg-white p-4 dark:bg-neutral-900"
    >
      {/* Slide -> small gap -> subtitle -> flexible remaining space -> button.
          The image wrapper is sized to its OWN content (bounded by max-h on
          the <img>, not a flex-1 box that would center it with dead space
          above/below) so the subtitle sits close beneath the slide's real
          bottom edge; the trailing flex-1 spacer (not the image wrapper)
          absorbs whatever vertical space is left over on a tall screen. */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-2">
        <div className="flex w-full items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}${imageAsset}`}
            alt={imageAlt}
            className="max-h-[48vh] max-w-full object-contain"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        </div>
        <p className="mt-3 max-w-md shrink-0 text-center text-lg whitespace-pre-line sm:text-xl">{subtitle}</p>
        <div className="flex-1" />
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
