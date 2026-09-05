// Provider-neutral feedback foundation. No feedback destination is
// configured in this release (VITE_FEEDBACK_URL is unset) — see
// docs/analytics-foundation.md. The Send Feedback UI hides itself entirely
// when unconfigured; it never shows a broken link or a fake submit button.
export type FeedbackContext = {
  // Current route (e.g. location.pathname) — helps reproduce a report.
  route: string
  buildSha: string
  // App version, when this project adopts one — see
  // docs/analytics-foundation.md's version-policy note. Omitted rather than
  // a fake value while package.json's version isn't a real release number.
  appVersion?: string
  screenSize: 'small' | 'medium' | 'large'
}

export type FeedbackSubmission = {
  message: string
  context: FeedbackContext
}

// Implemented once a real destination is chosen — see
// docs/analytics-foundation.md. Never implemented against a guessed URL.
export type FeedbackProvider = {
  submit(submission: FeedbackSubmission): Promise<void>
}
