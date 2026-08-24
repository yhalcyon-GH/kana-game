import { useEffect } from 'react'
import { PRACTICE_GUIDE } from '../data/practiceGuide'
import { DEFAULT_PRACTICE_GUIDE_LOCALE, PRACTICE_GUIDE_CONTENT } from '../data/practiceGuideContent'
import { useTTS } from '../hooks/useTTS'
import { useProgressStore } from '../store/progressStore'

// In-context explanation of the Practice Hub's existing Recommended area.
// The supplied artwork contains the visible English copy, so no duplicate
// application-side subtitle is rendered here.
export function PracticeGuide() {
  const setCompleted = useProgressStore((s) => s.setHasCompletedPracticeGuide)
  const { speak, stop } = useTTS()
  const content = PRACTICE_GUIDE_CONTENT[DEFAULT_PRACTICE_GUIDE_LOCALE]

  useEffect(() => {
    speak(content.audioKey, content.speechText, content.lang)
    // Guide content is static for the component's one-time mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return stop
  }, [stop])

  return (
    <aside data-testid="practice-guide" className="flex w-full max-w-md flex-col items-center gap-3" aria-label="Practice guide">
      <img
        src={`${import.meta.env.BASE_URL}${PRACTICE_GUIDE.imageAsset}`}
        alt="Tamamizu explains Practice and Recommended"
        className="w-full max-w-md object-contain"
      />
      <button
        type="button"
        onClick={() => { stop(); setCompleted(true) }}
        className="w-full max-w-xs rounded-full bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {content.dismissLabel}
      </button>
    </aside>
  )
}
