import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntitlementContext, type EntitlementContextValue } from '../components/EntitlementContext'
import LoginPage from './LoginPage'

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const fetchMock = vi.fn<typeof fetch>()
const refresh = vi.fn<EntitlementContextValue['refresh']>().mockResolvedValue({ kind: 'stale' })

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <EntitlementContext.Provider value={{ state: { status: 'signed-out', user: null }, refresh, markSignedOut: vi.fn() }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/account" element={<p>Account page</p>} />
        </Routes>
      </EntitlementContext.Provider>
    </MemoryRouter>,
  )
}

async function waitForCapabilityCheck() {
  await act(async () => {})
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://api.example.com')
  refresh.mockClear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('LoginPage — capability detection', () => {
  it('shows the OTP email step when the capability probe reports true', async () => {
    fetchMock.mockResolvedValueOnce(json({ email_code_auth: true }))
    renderLogin()
    await waitForCapabilityCheck()
    expect(screen.getByRole('heading', { name: 'Sign in for Full Access' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
  })

  it.each([
    ['false', json({ email_code_auth: false })],
    ['404', json({ error: 'not found' }, 404)],
    ['malformed', json({})],
  ])('falls back to Magic Link when the capability probe is %s', async (_label, response) => {
    fetchMock.mockResolvedValueOnce(response)
    renderLogin()
    await waitForCapabilityCheck()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeInTheDocument()
  })

  it('falls back to Magic Link when the capability probe is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    renderLogin()
    await waitForCapabilityCheck()
    expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeInTheDocument()
  })
})

describe('LoginPage — OTP email step', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValueOnce(json({ email_code_auth: true }))
  })

  it('disables submit until the email looks syntactically valid', async () => {
    renderLogin()
    await waitForCapabilityCheck()
    const button = screen.getByRole('button', { name: 'Send code' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.com' } })
    expect(button).toBeEnabled()
  })

  it('advances to the code step showing the destination email on a successful send', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 'ok', challenge: 'opaque-challenge' }))
    renderLogin()
    await waitForCapabilityCheck()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.com' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })) })
    expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeInTheDocument()
    expect(screen.getByText('learner@example.com')).toBeInTheDocument()
  })

  it('shows a generic error and stays on the email step when no challenge is issued (rate-limited/invalid, enumeration-safe)', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 'ok' }))
    renderLogin()
    await waitForCapabilityCheck()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.com' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
  })

  it('prevents a double submit while a request is in flight', async () => {
    let resolveFetch!: (value: Response) => void
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve }))
    renderLogin()
    await waitForCapabilityCheck()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(2) // capability probe + one request-code call
    await act(async () => { resolveFetch(json({ status: 'ok', challenge: 'c' })) })
  })
})

describe('LoginPage — OTP code step', () => {
  async function advanceToCodeStep() {
    fetchMock.mockResolvedValueOnce(json({ email_code_auth: true }))
    renderLogin()
    await waitForCapabilityCheck()
    fetchMock.mockResolvedValueOnce(json({ status: 'ok', challenge: 'opaque-challenge' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.com' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })) })
  }

  it('is an accessible numeric input with the correct attributes', async () => {
    await advanceToCodeStep()
    const input = screen.getByLabelText('6-digit code')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('maxlength', '6')
  })

  it('preserves leading zeros in the typed code', async () => {
    await advanceToCodeStep()
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '012345' } })
    expect(screen.getByLabelText('6-digit code')).toHaveValue('012345')
  })

  it('supports paste, stripping non-digits and clamping to 6', async () => {
    await advanceToCodeStep()
    const input = screen.getByLabelText('6-digit code')
    const clipboardData = { getData: () => '01 23-45extra' }
    fireEvent.paste(input, { clipboardData })
    expect(input).toHaveValue('012345')
  })

  it('submits on Enter once 6 digits are entered, and authenticates', async () => {
    await advanceToCodeStep()
    fetchMock.mockResolvedValueOnce(json({ user: { user_id: 'u1', email_normalized: 'learner@example.com' } }))
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '012345' } })
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Verify code' }).closest('form')!) })
    expect(await screen.findByText('Account page')).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('shows the exact invalid/expired copy on a wrong code and does NOT fall back to Magic Link', async () => {
    await advanceToCodeStep()
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid or expired code' }, 400))
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '999999' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Verify code' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid or expired code. Please request a new code.')
    expect(screen.queryByRole('button', { name: 'Send sign-in link' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('6-digit code')).toHaveValue('')
  })

  it('prevents a double submit while verification is in flight', async () => {
    await advanceToCodeStep()
    let resolveFetch!: (value: Response) => void
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve }))
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '012345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled()
    await act(async () => { resolveFetch(json({ user: { user_id: 'u1', email_normalized: 'learner@example.com' } })) })
  })

  it('starts the resend countdown at 60 seconds and enables resend once it elapses', async () => {
    await advanceToCodeStep()
    expect(screen.getByRole('button', { name: 'Resend code (60s)' })).toBeDisabled()
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
    expect(screen.getByRole('button', { name: 'Resend code (1s)' })).toBeDisabled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled()
  })

  it('resend requests a fresh challenge and restarts the countdown', async () => {
    await advanceToCodeStep()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    fetchMock.mockResolvedValueOnce(json({ status: 'ok', challenge: 'second-challenge' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resend code' })) })
    expect(screen.getByRole('button', { name: 'Resend code (60s)' })).toBeDisabled()
  })

  it('Change email returns to the email step', async () => {
    await advanceToCodeStep()
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }))
    expect(screen.getByRole('heading', { name: 'Sign in for Full Access' })).toBeInTheDocument()
  })
})
