import { useEffect } from 'react'
import { LEARN_TRACING_GUIDE } from '../data/learnTracingGuide'
import { DEFAULT_LEARN_TRACING_GUIDE_LOCALE, LEARN_TRACING_GUIDE_CONTENT } from '../data/learnTracingGuideContent'
import { useTTS } from '../hooks/useTTS'
import { useProgressStore } from '../store/progressStore'

// A small in-context guide for the first Hiragana row. It intentionally
// contains no separate visual caption: the supplied art already includes
// Tamamizu's English speech bubble.
export function LearnTracingGuide() {
  const setCompleted = useProgressStore((s) => s.setHasCompletedLearnTracingGuide)
  const { speak } = useTTS()
  const content = LEARN_TRACING_GUIDE_CONTENT[DEFAULT_LEARN_TRACING_GUIDE_LOCALE]

  useEffect(() => {
    speak(content.audioKey, content.speechText, content.lang)
    // Guide content is static for the component's one-time mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <aside data-testid="learn-tracing-guide" className="flex w-full max-w-md flex-col items-center gap-3" aria-label="Learn and Tracing guide">
      <img
        src={`${import.meta.env.BASE_URL}${LEARN_TRACING_GUIDE.imageAsset}`}
        alt="Tamamizu explains Learn and Tracing"
        className="max-h-56 w-full max-w-sm object-contain sm:max-h-64"
      />
      <button
        type="button"
        onClick={() => setCompleted(true)}
        className="w-full max-w-xs rounded-full bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {content.dismissLabel}
      </button>
    </aside>
  )
}
