import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useProgressStore } from './store/progressStore'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  vi.stubEnv('VITE_PADDLE_AUTH_API_BASE_URL', 'https://api.example.com')
})

afterEach(() => vi.unstubAllEnvs())

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Account Test / Verify route production exclusion (Phase 3A PR C)', () => {
  it('/account-test is reachable in development, without adding a navigation link', async () => {
    renderAt('/account-test')
    expect(await screen.findByRole('heading', { name: 'Account Test' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link').some((link) => link.getAttribute('href') === '/account-test')).toBe(false)
  })

  it('/account-test uses the not-found route in production', () => {
    vi.stubEnv('DEV', false)
    renderAt('/account-test')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Account Test' })).not.toBeInTheDocument()
  })

  it('/verify is reachable in development', async () => {
    renderAt('/verify')
    expect(await screen.findByRole('heading', { name: 'Verifying sign-in link…' })).toBeInTheDocument()
  })

  // Phase 3B: /verify is no longer 404 in production -- it renders the
  // PRODUCTION verify page (ProductionVerifyPage), never the dev-only
  // harness's VerifyPage, at the exact same route the backend hardcodes
  // into every Magic Link URL (see MagicLinkUrlBuilder.php). The two
  // are mutually exclusive by build (DEV vs. production), never both
  // present.
  it('/verify renders the PRODUCTION verify page (not the dev harness, not 404) in production', async () => {
    vi.stubEnv('DEV', false)
    renderAt('/verify?token=raw-token')
    expect(await screen.findByRole('heading', { name: 'Signing in…' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Verifying sign-in link…' })).not.toBeInTheDocument()
  })

  it('/verify renders the dev harness verify page (not the production one) in development', () => {
    renderAt('/verify?token=raw-token')
    expect(screen.getByRole('heading', { name: 'Verifying sign-in link…' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Signing in…' })).not.toBeInTheDocument()
  })
})
