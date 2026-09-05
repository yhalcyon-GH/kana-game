import { useLocation } from 'react-router-dom'
import { BUILD_SHA } from '../lib/buildInfo'
import { buildFeedbackDestinationUrl, isFeedbackEnabled } from '../lib/feedback/config'
import { currentScreenSizeCategory } from '../lib/screenSizeCategory'
import { track } from '../lib/analytics/track'

// Renders nothing at all when no feedback destination is configured
// (VITE_FEEDBACK_URL unset) — never a broken link or a fake submit button.
//
// A plain <a target="_blank" rel="noopener noreferrer"> rather than a
// window.open()-driven button: window.open()'s return value is not a
// reliable signal that a tab actually opened in every browser (some
// browsers/extensions still open the tab but return a value indistinguishable
// from a block, or vice versa), so gating an analytics event on it can
// under- or over-count. A normal link's click handler fires exactly when
// the user activates the link — see feedback_opened's doc comment below for
// what that event does and does not guarantee.
export function SendFeedback() {
  const location = useLocation()

  if (!isFeedbackEnabled()) return null

  const context = { route: location.pathname, buildSha: BUILD_SHA, screenSize: currentScreenSizeCategory() }
  const destination = buildFeedbackDestinationUrl(context)
  // isFeedbackEnabled() and buildFeedbackDestinationUrl() read the same
  // config, so this is unreachable in practice — narrows destination to
  // string for the anchor below without an unnecessary early return.
  if (!destination) return null

  // "Activated" means the learner clicked the link — it does NOT confirm
  // the destination tab actually rendered, loaded, or that the learner did
  // anything there. Never treat this as proof feedback was seen or
  // submitted (see docs/analytics-foundation.md: feedback_submitted is
  // never fired at all, precisely because that can't be confirmed either).
  const recordActivation = () => track('feedback_opened')

  return (
    <a
      href={destination}
      target="_blank"
      rel="noopener noreferrer"
      onClick={recordActivation}
      className="flex w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 py-3 text-left hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
      title={`route: ${context.route} · build: ${context.buildSha}`}
    >
      <span>Send Feedback</span>
      <span className="text-blue-600 dark:text-blue-400">›</span>
    </a>
  )
}
