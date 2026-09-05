import { useLocation } from 'react-router-dom'
import { BUILD_SHA } from '../lib/buildInfo'
import { isFeedbackEnabled } from '../lib/feedback/config'
import { currentScreenSizeCategory } from '../lib/screenSizeCategory'
import { track } from '../lib/analytics/track'

// Renders nothing at all when no feedback destination is configured
// (VITE_FEEDBACK_URL unset) — never a broken link or a fake submit button.
// See docs/analytics-foundation.md: this release ships with no feedback
// provider connected, so this component is a foundation, not yet a working
// submission path.
export function SendFeedback() {
  const location = useLocation()

  if (!isFeedbackEnabled()) return null

  const context = { route: location.pathname, buildSha: BUILD_SHA, screenSize: currentScreenSizeCategory() }

  return (
    <button
      type="button"
      onClick={() => track('feedback_opened')}
      className="flex w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 py-3 text-left hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
      title={`route: ${context.route} · build: ${context.buildSha}`}
    >
      <span>Send Feedback</span>
      <span className="text-blue-600 dark:text-blue-400">›</span>
    </button>
  )
}
