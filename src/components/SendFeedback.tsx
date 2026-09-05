import { useLocation } from 'react-router-dom'
import { BUILD_SHA } from '../lib/buildInfo'
import { buildFeedbackDestinationUrl, isFeedbackEnabled } from '../lib/feedback/config'
import { currentScreenSizeCategory } from '../lib/screenSizeCategory'
import { track } from '../lib/analytics/track'

// Renders nothing at all when no feedback destination is configured
// (VITE_FEEDBACK_URL unset) — never a broken link or a fake submit button.
// When configured, clicking actually opens the configured destination in a
// new tab (window.open, not just tracking an event) — see
// docs/analytics-foundation.md: no specific provider is chosen by this
// foundation, so this stays a plain external-link action rather than an
// in-app submission flow tied to one provider's API shape.
export function SendFeedback() {
  const location = useLocation()

  if (!isFeedbackEnabled()) return null

  const context = { route: location.pathname, buildSha: BUILD_SHA, screenSize: currentScreenSizeCategory() }
  const destination = buildFeedbackDestinationUrl(context)
  // isFeedbackEnabled() and buildFeedbackDestinationUrl() read the same
  // config, so this is unreachable in practice — narrows destination to
  // string for the click handler below without an unnecessary early return.
  if (!destination) return null

  const openFeedback = () => {
    const opened = window.open(destination, '_blank', 'noopener,noreferrer')
    // Only counts as "opened" if the destination actually launched (a
    // popup blocker can silently return null) — an event that fires
    // regardless of whether anything happened would misrepresent this as a
    // working feedback flow when it wasn't.
    if (opened) track('feedback_opened')
  }

  return (
    <button
      type="button"
      onClick={openFeedback}
      className="flex w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 py-3 text-left hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
      title={`route: ${context.route} · build: ${context.buildSha}`}
    >
      <span>Send Feedback</span>
      <span className="text-blue-600 dark:text-blue-400">›</span>
    </button>
  )
}
