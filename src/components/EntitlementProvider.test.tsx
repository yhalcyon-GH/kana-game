import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as productionAuthClient from '../lib/auth/productionAuthClient'
import { useProgressStore } from '../store/progressStore'
import { useEntitlement, type EntitlementContextValue } from './EntitlementContext'
import { EntitlementProvider } from './EntitlementProvider'

vi.mock('../lib/auth/productionAuthClient', async () => {
  const actual = await vi.importActual<typeof import('../lib/auth/productionAuthClient')>('../lib/auth/productionAuthClient')
  return {
    ...actual,
    fetchCurrentUserResult: vi.fn(),
    fetchCurrentEntitlementResult: vi.fn(),
  }
})

function Harness() {
  const { state, refresh } = useEntitlement()
  return (
    <>
      <output>{state.status}</output>
      <span>{state.user?.emailNormalized ?? 'no-user'}</span>
      <button type="button" onClick={() => void refresh()}>Refresh</button>
    </>
  )
}

function renderProvider() {
  return render(
    <EntitlementProvider>
      <Harness />
    </EntitlementProvider>,
  )
}

const user = { userId: 'u1', emailNormalized: 'learner@example.com' }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function captureProvider() {
  let context!: EntitlementContextValue
  function Capture() {
    context = useEntitlement()
    return <Harness />
  }
  const view = render(<EntitlementProvider><Capture /></EntitlementProvider>)
  return { ...view, current: () => context }
}

beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://auth-dev.example.com/api')
  vi.mocked(productionAuthClient.fetchCurrentUserResult).mockReset().mockResolvedValue({ kind: 'signed-out' })
  vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockReset()
  useProgressStore.getState().resetProgress()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('EntitlementProvider', () => {
  it.each(['before', 'user', 'entitlement'] as const)('returns stale without applying an aborted refresh at %s', async (stage) => {
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'authenticated', user })
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockResolvedValue({ kind: 'available', entitlement: { active: false } })
    const provider = captureProvider()
    await screen.findByText('inactive')
    const abort = new AbortController()
    const pendingUser = deferred<productionAuthClient.CurrentUserResult>()
    const pendingEntitlement = deferred<productionAuthClient.CurrentEntitlementResult>()
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockReturnValueOnce(
      stage === 'user' ? pendingUser.promise : Promise.resolve({ kind: 'authenticated', user }),
    )
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockReturnValueOnce(pendingEntitlement.promise)
    if (stage === 'before') abort.abort()
    let refresh!: ReturnType<EntitlementContextValue['refresh']>
    await act(async () => { refresh = provider.current().refresh({ nonDisruptive: true, signal: abort.signal }) })
    abort.abort()
    await act(async () => {
      pendingUser.resolve({ kind: 'authenticated', user })
      pendingEntitlement.resolve({ kind: 'available', entitlement: { active: true } })
      await refresh
    })
    expect(await refresh).toEqual({ kind: 'stale' })
    expect(screen.getByText('inactive')).toBeInTheDocument()
    expect(productionAuthClient.fetchCurrentUserResult).toHaveBeenCalledTimes(stage === 'before' ? 1 : 2)
    expect(productionAuthClient.fetchCurrentEntitlementResult).toHaveBeenCalledTimes(stage === 'entitlement' ? 2 : 1)
  })

  it('returns the same applied state from one non-disruptive verification', async () => {
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'authenticated', user })
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockResolvedValue({ kind: 'available', entitlement: { active: false } })
    const provider = captureProvider()
    await screen.findByText('inactive')
    const pending = deferred<productionAuthClient.CurrentEntitlementResult>()
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockReturnValueOnce(pending.promise)

    let refresh!: ReturnType<EntitlementContextValue['refresh']>
    act(() => { refresh = provider.current().refresh({ nonDisruptive: true }) })
    await waitFor(() => expect(productionAuthClient.fetchCurrentEntitlementResult).toHaveBeenCalledTimes(2))
    expect(screen.getByText('inactive')).toBeInTheDocument()
    expect(screen.getByText(user.emailNormalized)).toBeInTheDocument()
    await act(async () => { pending.resolve({ kind: 'available', entitlement: { active: true } }); await refresh })

    expect(await refresh).toEqual({ kind: 'applied', state: { status: 'active', user } })
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(productionAuthClient.fetchCurrentUserResult).toHaveBeenCalledTimes(2)
    expect(productionAuthClient.fetchCurrentEntitlementResult).toHaveBeenCalledTimes(2)
  })

  it('preserves authenticated state when a non-disruptive refresh is temporarily unavailable', async () => {
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'authenticated', user })
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult)
      .mockResolvedValueOnce({ kind: 'available', entitlement: { active: false } })
      .mockResolvedValueOnce({ kind: 'unavailable' })
    const provider = captureProvider()
    await screen.findByText('inactive')

    let result!: Awaited<ReturnType<EntitlementContextValue['refresh']>>
    await act(async () => {
      result = await provider.current().refresh({ nonDisruptive: true })
    })

    expect(result).toEqual({ kind: 'unavailable' })
    expect(screen.getByText('inactive')).toBeInTheDocument()
    expect(screen.getByText(user.emailNormalized)).toBeInTheDocument()
  })

  it('returns stale for a refresh superseded by a newer verification', async () => {
    const provider = captureProvider()
    await screen.findByText('signed-out')
    const pending = deferred<productionAuthClient.CurrentUserResult>()
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockReturnValueOnce(pending.promise)
    let oldRefresh!: ReturnType<EntitlementContextValue['refresh']>
    act(() => { oldRefresh = provider.current().refresh() })
    await act(async () => {
      expect(await provider.current().refresh()).toEqual({ kind: 'applied', state: { status: 'signed-out', user: null } })
    })
    await act(async () => { pending.resolve({ kind: 'authenticated', user }); await oldRefresh })
    expect(await oldRefresh).toEqual({ kind: 'stale' })
    expect(screen.getByText('signed-out')).toBeInTheDocument()
    expect(productionAuthClient.fetchCurrentEntitlementResult).not.toHaveBeenCalled()
  })

  it.each(['user', 'entitlement'] as const)('invalidates a pending %s response when signed out', async (stage) => {
    const provider = captureProvider()
    await screen.findByText('signed-out')
    const pendingUser = deferred<productionAuthClient.CurrentUserResult>()
    const pendingEntitlement = deferred<productionAuthClient.CurrentEntitlementResult>()
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockReturnValueOnce(
      stage === 'user' ? pendingUser.promise : Promise.resolve({ kind: 'authenticated', user }),
    )
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockReturnValueOnce(pendingEntitlement.promise)
    let refresh!: ReturnType<EntitlementContextValue['refresh']>
    await act(async () => { refresh = provider.current().refresh({ nonDisruptive: true }) })
    act(() => provider.current().markSignedOut())
    await act(async () => {
      pendingUser.resolve({ kind: 'authenticated', user })
      pendingEntitlement.resolve({ kind: 'available', entitlement: { active: true } })
      await refresh
    })
    expect(await refresh).toEqual({ kind: 'stale' })
    expect(screen.getByText('signed-out')).toBeInTheDocument()
  })

  it('returns stale when unmounted during verification', async () => {
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockResolvedValue({ kind: 'available', entitlement: { active: true } })
    const provider = captureProvider()
    await screen.findByText('signed-out')
    const pending = deferred<productionAuthClient.CurrentUserResult>()
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockReturnValueOnce(pending.promise)
    let refresh!: ReturnType<EntitlementContextValue['refresh']>
    act(() => { refresh = provider.current().refresh() })
    provider.unmount()
    pending.resolve({ kind: 'authenticated', user })
    expect(await refresh).toEqual({ kind: 'stale' })
    expect(productionAuthClient.fetchCurrentEntitlementResult).not.toHaveBeenCalled()
  })

  it('does not promote a truthy non-boolean entitlement to active', async () => {
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'authenticated', user })
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockResolvedValue({ kind: 'available', entitlement: { active: 'true' as unknown as boolean } })
    renderProvider()
    expect(await screen.findByText('inactive')).toBeInTheDocument()
  })

  it('refreshes on startup and focus in production', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', '')

    renderProvider()
    await screen.findByText('signed-out')
    expect(productionAuthClient.fetchCurrentUserResult).toHaveBeenCalledWith(
      'https://tamamizu.giganihongo.com/api',
    )

    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(productionAuthClient.fetchCurrentUserResult).toHaveBeenCalledTimes(2))
  })

  it('does not contact production auth on startup, focus, or manual refresh in unconfigured development', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', '')

    renderProvider()
    expect(await screen.findByText('signed-out')).toBeInTheDocument()
    act(() => window.dispatchEvent(new Event('focus')))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(productionAuthClient.fetchCurrentUserResult).not.toHaveBeenCalled()
    expect(productionAuthClient.fetchCurrentEntitlementResult).not.toHaveBeenCalled()
  })

  it('uses an explicitly configured auth API in development', async () => {
    renderProvider()

    await screen.findByText('signed-out')
    expect(productionAuthClient.fetchCurrentUserResult).toHaveBeenCalledWith('https://auth-dev.example.com/api')
  })

  it('distinguishes signed-out, inactive, active, and unavailable server states', async () => {
    const user = { userId: 'u1', emailNormalized: 'learner@example.com' }
    vi.mocked(productionAuthClient.fetchCurrentUserResult)
      .mockResolvedValueOnce({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'authenticated', user })
      .mockResolvedValueOnce({ kind: 'authenticated', user })
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'authenticated', user })
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult)
      .mockResolvedValueOnce({ kind: 'available', entitlement: { active: false } })
      .mockResolvedValueOnce({ kind: 'available', entitlement: { active: true } })
      .mockResolvedValueOnce({ kind: 'unavailable' })

    renderProvider()
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(await screen.findByText('signed-out')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('inactive')).toBeInTheDocument()
    expect(screen.getByText('learner@example.com')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('active')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('learner@example.com')).toBeInTheDocument()
    expect(screen.getByText('unavailable')).toBeInTheDocument()
  })

  it('refreshes on window focus and supports an explicit manual refresh', async () => {
    const user = { userId: 'u1', emailNormalized: 'learner@example.com' }
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'authenticated', user })
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult).mockResolvedValue({
      kind: 'available',
      entitlement: { active: false },
    })

    renderProvider()
    await screen.findByText('inactive')

    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(productionAuthClient.fetchCurrentUserResult).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(productionAuthClient.fetchCurrentUserResult).toHaveBeenCalledTimes(3))
  })

  it('does not delete learning progress when entitlement changes from active to inactive', async () => {
    const user = { userId: 'u1', emailNormalized: 'learner@example.com' }
    useProgressStore.getState().markRowTaught('a-row')
    const progressBefore = localStorage.getItem('kana-game-progress')
    vi.mocked(productionAuthClient.fetchCurrentUserResult).mockResolvedValue({ kind: 'authenticated', user })
    vi.mocked(productionAuthClient.fetchCurrentEntitlementResult)
      .mockResolvedValueOnce({ kind: 'available', entitlement: { active: true } })
      .mockResolvedValueOnce({ kind: 'available', entitlement: { active: false } })

    renderProvider()
    await screen.findByText('active')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('inactive')

    expect(localStorage.getItem('kana-game-progress')).toBe(progressBefore)
    expect(useProgressStore.getState().taughtRowIds).toContain('a-row')
  })

  it('never persists entitlement state in localStorage, sessionStorage, or IndexedDB', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    const indexedDbOpen = vi.fn()
    const indexedDbDelete = vi.fn()
    vi.stubGlobal('indexedDB', { open: indexedDbOpen, deleteDatabase: indexedDbDelete })

    renderProvider()
    await screen.findByText('signed-out')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(productionAuthClient.fetchCurrentUserResult).toHaveBeenCalledTimes(2))

    expect(storageWrite).not.toHaveBeenCalled()
    expect(indexedDbOpen).not.toHaveBeenCalled()
    expect(indexedDbDelete).not.toHaveBeenCalled()
  })
})
