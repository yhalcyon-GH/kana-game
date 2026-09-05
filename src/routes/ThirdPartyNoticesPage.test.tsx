import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThirdPartyNoticesPage } from './ThirdPartyNoticesPage'

describe('ThirdPartyNoticesPage', () => {
  it('renders the Third-Party Notices heading', () => {
    render(<ThirdPartyNoticesPage />)
    expect(screen.getByRole('heading', { name: 'Third-Party Notices', level: 1 })).toBeInTheDocument()
  })

  it('lists strokesvg and Klee One with license links', () => {
    render(<ThirdPartyNoticesPage />)
    expect(screen.getAllByText(/strokesvg/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Klee One/).length).toBeGreaterThan(0)
    const licenseLinks = screen.getAllByRole('link', { name: /Full license text/ })
    expect(licenseLinks.length).toBeGreaterThanOrEqual(2)
  })

  // Regression for a GitHub Pages sub-path bug: production serves this app
  // under base '/kana-game/' (vite.config.ts), so a hardcoded root-absolute
  // '/licenses/...' href would resolve OUTSIDE the app's own path once
  // deployed there. Every license link must instead be built from
  // import.meta.env.BASE_URL — asserted dynamically here (rather than
  // hardcoding '/kana-game/', which vitest's own env doesn't use) so this
  // test passes under any configured base and still catches a link that
  // ignores BASE_URL entirely.
  it('every license link is built from the configured app base, not a hardcoded root-absolute path', () => {
    render(<ThirdPartyNoticesPage />)
    const licenseLinks = screen.getAllByRole('link', { name: /Full license text/ })
    expect(licenseLinks.length).toBeGreaterThan(0)
    const expectedPrefix = `${import.meta.env.BASE_URL}licenses/`
    for (const link of licenseLinks) {
      const href = link.getAttribute('href')
      expect(href?.startsWith(expectedPrefix)).toBe(true)
      expect(href?.endsWith('-LICENSE.txt')).toBe(true)
    }
  })

  // Stronger regression than the test above: actually changes BASE_URL
  // (simulating GitHub Pages' production '/kana-game/' sub-path, per
  // vite.config.ts) and asserts the rendered hrefs move WITH it. A
  // component that hardcoded '/licenses/...' would fail this specific
  // test even though it might coincidentally pass the one above under
  // vitest's own default '/' base.
  describe('with a non-root app base (simulating GitHub Pages)', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('rewrites license links under the stubbed base', () => {
      vi.stubEnv('BASE_URL', '/kana-game/')
      render(<ThirdPartyNoticesPage />)
      const licenseLinks = screen.getAllByRole('link', { name: /Full license text/ })
      expect(licenseLinks.length).toBeGreaterThan(0)
      for (const link of licenseLinks) {
        const href = link.getAttribute('href')
        expect(href).toMatch(/^\/kana-game\/licenses\/.+-LICENSE\.txt$/)
      }
    })
  })

  it('lists the bundled runtime software packages', () => {
    render(<ThirdPartyNoticesPage />)
    expect(screen.getAllByText(/React/).length).toBeGreaterThan(0)
    expect(screen.getByText(/React Router/)).toBeInTheDocument()
    expect(screen.getByText(/Zustand/)).toBeInTheDocument()
    expect(screen.getAllByText(/Workbox/).length).toBeGreaterThan(0)
  })
})
