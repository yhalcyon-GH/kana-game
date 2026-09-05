import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

describe('PrivacyPage', () => {
  it('renders the Privacy Policy heading', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeInTheDocument()
  })

  it('discloses local-storage-only progress data and no accounts', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/No accounts/i)).toBeInTheDocument()
    expect(screen.getAllByText(/local storage/i).length).toBeGreaterThan(0)
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

  it('describes speech recognition as browser/platform-handled, not server-recorded, and notes that provider\'s own terms apply', () => {
    render(<PrivacyPage />)
    expect(screen.getByText(/Web Speech API/)).toBeInTheDocument()
    expect(screen.getByText(/does not record, upload, or store your microphone audio/i)).toBeInTheDocument()
    const heading = screen.getByRole('heading', { name: 'Microphone / speech recognition', level: 2 })
    expect(heading.parentElement?.textContent).toMatch(/browser or platform provider's own privacy terms/)
  })

  it('identifies the developer/operator using only public GitHub identity, no private info', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('link', { name: 'yhalcyon-GH' })).toHaveAttribute('href', 'https://github.com/yhalcyon-GH')
    expect(screen.getByRole('link', { name: 'kana-game' })).toHaveAttribute('href', 'https://github.com/yhalcyon-GH/kana-game')
    expect(screen.queryByText(/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)).not.toBeInTheDocument()
  })

  it('provides a GitHub issues contact mechanism for privacy inquiries', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('link', { name: /github\.com\/yhalcyon-GH\/kana-game\/issues/ })).toHaveAttribute(
      'href',
      'https://github.com/yhalcyon-GH/kana-game/issues',
    )
  })

  it('discloses that the static host may process ordinary request metadata under its own terms', () => {
    render(<PrivacyPage />)
    const heading = screen.getByRole('heading', { name: 'Hosting', level: 2 })
    expect(heading.parentElement?.textContent).toMatch(/hosting provider/)
    expect(heading.parentElement?.textContent).toMatch(/provider's own privacy terms/)
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
})
