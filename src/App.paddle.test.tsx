import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useProgressStore } from './store/progressStore'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', '')
  vi.stubEnv('VITE_PADDLE_PRICE_ID', '')
})

afterEach(() => vi.unstubAllEnvs())

function renderTestRoute() {
  render(<MemoryRouter initialEntries={['/paddle-test']}><App /></MemoryRouter>)
}

describe('Paddle PoC route isolation', () => {
  it('allows direct development access without adding navigation links', async () => {
    renderTestRoute()
    expect(await screen.findByRole('heading', { name: 'Full Tamamizu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Paddle Sandbox Checkout' })).toBeDisabled()
    expect(screen.queryAllByRole('link').some((link) => link.getAttribute('href') === '/paddle-test')).toBe(false)
  })

  it('uses the not-found route in production even with sandbox configuration', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'sandbox')
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_poc_fixture')
    vi.stubEnv('VITE_PADDLE_PRICE_ID', 'pri_poc_fixture')
    renderTestRoute()
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Paddle Sandbox Checkout' })).not.toBeInTheDocument()
  })
})
