import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

describe('PrivacyPage', () => {
  it('renders the Privacy Policy heading', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeInTheDocument()
  })

  it('discloses local-storage-only free progress and the live OTP-with-Magic-Link-fallback account flow', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Account (optional)', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/You do not need an account to use the free parts/i)
    expect(text).toMatch(/buy Full Access or restore paid access/i)
    expect(text).toMatch(/six-digit one-time code/i)
    expect(text).toMatch(/fall back to a one-time Magic Link/i)
    expect(screen.getAllByText(/local storage/i).length).toBeGreaterThan(0)
  })

  it('discloses both authentication cookies accurately, including security attributes and remembered-browser limits', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Cookies', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/two authentication cookies/i)
    expect(text).toMatch(/short-lived session credential/i)
    expect(text).toMatch(/remember this browser/i)
    expect(text).toMatch(/do not contain your email address/i)
    expect(text).toMatch(/not tracking or analytics/i)
    expect(text).toMatch(/Secure, HttpOnly,\s*SameSite=Lax, and Path=\//)
    expect(text).toMatch(/host-only/i)
    expect(text).toMatch(/up to 90 days/i)
    expect(text).toMatch(/at most three remembered browsers or devices/i)
    expect(text).toMatch(/If you don't sign in, these authentication\s*cookies are not set/i)
  })

  it('accurately states analytics is currently inactive, and names Umami as the provider if a future build enables it', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Analytics', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/As of this build, analytics is inactive/)
    expect(text).toMatch(/Umami/)
  })

  it('accurately states no feedback destination is currently configured, and names Tally as the destination if a future build enables it', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/no feedback destination is configured/)
    expect(text).toMatch(/Tally/)
  })

  it('does not mention a Tally Respondent ID while feedback is inactive (no Tally form is ever loaded)', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).not.toMatch(/Respondent ID/)
  })

  it('describes speech recognition as browser/platform-handled, not server-recorded, and notes that provider\'s own terms apply', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/Web Speech API/)).toBeInTheDocument()
    expect(screen.getByText(/does not record, upload, or store your microphone audio/i)).toBeInTheDocument()
    const heading = screen.getByRole('heading', { name: 'Microphone / speech recognition', level: 2 })
    expect(heading.parentElement?.textContent).toMatch(/browser or platform provider's own privacy terms/)
  })

  it('discloses the separate authentication and purchase-access service, without calling the app backend-free', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Hosting', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/static web app/)
    expect(text).toMatch(/separate, security-focused authentication and purchase-access service/)
    expect(text).not.toMatch(/no backend server of its own/)
  })

  it('describes the data kept for purchases, retention, and account deletion', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { name: 'Purchases and access', level: 2 })).toBeInTheDocument()
    const retention = screen.getByRole('heading', { name: 'Retention and deletion', level: 2 }).parentElement?.textContent ?? ''
    expect(retention).toMatch(/as long as reasonably needed/i)
    expect(retention).toMatch(/user-area error-log retention.*nine weeks/i)
    expect(retention).not.toMatch(/about 90 days/)
    expect(retention).toMatch(/cannot be reversed/)
    expect(retention).toMatch(/does not itself provide a refund/)
  })

  it('states the child and guardian data-minimisation policy', () => {
    render(<PrivacyPage />)
    const text = screen.getByRole('heading', { name: 'Children and guardians', level: 2 }).parentElement?.textContent ?? ''
    expect(text).toMatch(/does not set a minimum learning age/)
    expect(text).toMatch(/date of birth/)
    expect(text).toMatch(/school/)
  })

  it('identifies Tamamizu as controller/operator without exposing a private legal identity', () => {
    render(<PrivacyPage />)
    const controller = screen.getByRole('heading', { name: 'Controller / operator', level: 2 }).parentElement?.textContent ?? ''
    expect(controller).toMatch(/Tamamizu/)
    expect(controller).toMatch(/from Thailand/)
    const section = screen.getByRole('heading', { name: 'Developer / operator', level: 2 }).parentElement?.textContent ?? ''
    expect(section).toMatch(/Tamamizu name/)
    expect(screen.getByRole('link', { name: 'kana-game' })).toHaveAttribute('href', 'https://github.com/yhalcyon-GH/kana-game')
    expect(section).not.toMatch(/yhalcyon-GH/)
  })

  it('describes applicable legal bases, service providers, transfers, and privacy rights', () => {
    render(<PrivacyPage />)
    const section = screen.getByRole('heading', { name: 'Legal bases and service providers', level: 2 }).parentElement?.textContent ?? ''
    expect(section).toMatch(/perform the purchase relationship/)
    expect(section).toMatch(/legitimate operational and security interests/)
    expect(section).toMatch(/countries other than your own/)
    expect(section).toMatch(/access, correction, deletion/)
  })

  it('provides a private support email for privacy inquiries', () => {
    render(<PrivacyPage />)
    const privacyLinks = screen.getAllByRole('link', { name: 'tamamizu.jp@gmail.com' })
    expect(privacyLinks.length).toBeGreaterThanOrEqual(1)
    for (const link of privacyLinks) {
      expect(link).toHaveAttribute('href', 'mailto:tamamizu.jp@gmail.com')
    }
  })

  it('discloses that the static host may process ordinary request metadata under its own terms', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Hosting', level: 2 })
    expect(heading.parentElement?.textContent).toMatch(/hosting provider/)
    expect(heading.parentElement?.textContent).toMatch(/under its own privacy terms/)
  })
})

// P1 fix (PR #210 final review): the wording used to be static regardless
// of whether VITE_ANALYTICS_PROVIDER/VITE_UMAMI_WEBSITE_ID or
// VITE_FEEDBACK_URL were actually set, so a rebuild with those enabled
// would silently make the page's "inactive" claims false. It must now
// read the same config functions the app itself uses (isUmamiConfigured,
// isFeedbackEnabled) and switch wording accordingly.
describe('PrivacyPage reflects actual build config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('Analytics section switches to active wording once Umami is actually configured', () => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'umami')
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'test-website-id')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Analytics', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/This build has Umami analytics active/)
    expect(text).not.toMatch(/As of this build, analytics is inactive/)
    expect(text).toMatch(/session-replay or heatmap/)
    expect(text).toMatch(/never includes.*speech transcript, microphone audio, free-text/)
  })

  it('Analytics active wording does not overclaim what Umami itself does', () => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'umami')
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'test-website-id')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Analytics', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    // Must not claim Umami generates no visitor/session information at
    // all — Umami's own servers derive approximate location/browser/OS
    // from standard request metadata (IP, User-Agent) regardless of what
    // this app's JS payload contains.
    expect(text).not.toMatch(/Umami (generates|receives) (no|only)/)
    expect(text).toMatch(/IP address and browser User-Agent/)
    expect(text).toMatch(/independent of this app's own payload/)
  })

  it('does not activate the Analytics section on a half-configured environment (provider flag with no website id)', () => {
    vi.stubEnv('VITE_ANALYTICS_PROVIDER', 'umami')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Analytics', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/As of this build, analytics is inactive/)
  })

  it('Feedback section switches to active wording once a feedback URL is actually configured', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/abc123')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/This build has Tally feedback enabled/)
    expect(text).not.toMatch(/no feedback destination is configured/)
  })

  // Round 3 fix (PR #210 final review): buildFeedbackDestinationUrl
  // (src/lib/feedback/config.ts) appends route/build/screen as query
  // parameters on the Tally URL itself, so simply OPENING the form already
  // sends that context to Tally as part of the HTTP request for the page —
  // it is not true that "nothing is sent until submission." The active
  // wording must say so precisely, and must not claim otherwise.
  it('Feedback active wording accurately describes when context is sent vs. when submission content is sent', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/abc123')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    // Opening the form sends route/build/screen via the URL itself.
    expect(text).toMatch(/opening that form itself sends your current in-app route/)
    // Written feedback + category are separate, and only sent on submit.
    expect(text).toMatch(/Your written feedback and the category you pick are sent separately, only if and when/)
    // Must not claim nothing is sent until submission — that's false for
    // the route/build/screen context, which goes out the moment the form
    // opens.
    expect(text).not.toMatch(/nothing is sent until you choose to fill it in and submit/)
  })

  // Round 4 fix (PR #210 final review): the active Feedback wording used
  // to say "Neither step sends ... any identifier tied to you," which
  // contradicts Tally's own documented Respondent ID — a UUID v4 Tally
  // automatically assigns to every form respondent, stores in the
  // browser's local storage, and which persists across every Tally form
  // in the same Tally workspace (per tally.so/help/faq and
  // tally.so/help/prevent-duplicate-submissions). Tally selection is
  // unchanged; only the disclosure accuracy is fixed here.
  it('discloses Tally\'s Respondent ID accurately once feedback is active', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/abc123')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/Respondent ID/)
    expect(text).toMatch(/randomly generated identifier/)
    expect(text).toMatch(/local storage/)
    expect(text).toMatch(/persist across every Tally form in the same Tally workspace/)
    expect(text).toMatch(/whether the same browser has responded before/)
  })

  it('does not falsely claim no identifier is sent/used once feedback is active (Tally\'s Respondent ID exists)', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/abc123')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).not.toMatch(/any identifier tied to you/)
    expect(text).not.toMatch(/no identifier (is|of any kind)/i)
  })

  it('states Tamamizu does not ask for name/email and does not add its own persistent feedback identifier', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/abc123')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/does not ask for either/)
    expect(text).toMatch(/does not add any identifier of its own/)
  })

  it('describes the operator/Tally data role and EU storage using only confirmed official wording', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/abc123')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/Tamamizu's operator.*as the feedback form's creator.*is the party responsible for that response data/)
    expect(text).toMatch(/Tally acts as the service that stores and processes it on the operator's behalf/)
    expect(text).toMatch(/stored in the EU/)
  })

  // Issue #270: the 12-month figure describes when Tamamizu aims to remove a
  // response from active use, not Tally's own permanent deletion — Tally
  // retains a deleted submission in Trash for up to a further 90 days first.
  // The wording must not imply immediate, irreversible deletion at month 12.
  it('clarifies that Tally Trash retention follows removal from active records, not immediate permanent deletion', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://tally.so/r/abc123')
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Feedback', level: 2 })
    const text = heading.parentElement?.textContent ?? ''
    expect(text).toMatch(/aims to remove it from active records within 12 months/)
    expect(text).toMatch(/moves to Tally's Trash/)
    expect(text).toMatch(/up to a further 90 days/)
    expect(text).toMatch(/unless it is permanently deleted sooner/)
  })
})
