import type { FeedbackContext } from './types'

const TALLY_FORM_ORIGIN = 'https://tally.so'
const TALLY_FORM_PATH = /^\/r\/[A-Za-z0-9]+\/?$/

// Whether the Send Feedback UI should render at all. Feedback is deliberately
// constrained to the reviewed Tally public-form URL shape: an HTTPS
// https://tally.so/r/<form-id> link. This keeps the runtime behavior aligned
// with the Privacy Policy; an accidental or unreviewed third-party URL leaves
// the control hidden rather than opening a new data destination.
export function isFeedbackEnabled(): boolean {
  return getFeedbackUrl() !== undefined
}

export function getFeedbackUrl(): string | undefined {
  const configured = import.meta.env.VITE_FEEDBACK_URL
  if (!configured) return undefined

  try {
    const url = new URL(configured)
    if (url.origin !== TALLY_FORM_ORIGIN || !TALLY_FORM_PATH.test(url.pathname)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

// Builds the actual Tally destination URL the Send Feedback button opens.
// It carries only reproduction context as generic query parameters; it never
// includes free-text feedback or learner/account data.
export function buildFeedbackDestinationUrl(context: FeedbackContext): string | undefined {
  const base = getFeedbackUrl()
  if (!base) return undefined
  const url = new URL(base)
  url.searchParams.set('route', context.route)
  url.searchParams.set('build', context.buildSha)
  url.searchParams.set('screen', context.screenSize)
  if (context.appVersion) url.searchParams.set('version', context.appVersion)
  return url.toString()
}
