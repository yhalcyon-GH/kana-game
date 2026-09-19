import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useServiceWorkerUpdateChecks } from './useServiceWorkerUpdateChecks'

function createRegistration() {
  return { update: vi.fn().mockResolvedValue(undefined) } as unknown as ServiceWorkerRegistration
}

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

describe('useServiceWorkerUpdateChecks', () => {
  afterEach(() => {
    vi.useRealTimers()
    setVisibilityState('visible')
  })

  it('does nothing when there is no registration yet', () => {
    renderHook(() => useServiceWorkerUpdateChecks(undefined))

    window.dispatchEvent(new Event('focus'))

    // No registration to assert on, but this should not throw and there is
    // nothing to check for an update against.
  })

  it('checks for an update as soon as a registration is available (mount)', () => {
    const registration = createRegistration()

    renderHook(() => useServiceWorkerUpdateChecks(registration))

    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('re-checks on window focus, throttled so repeated focus does not hammer the network', () => {
    vi.useFakeTimers()
    const registration = createRegistration()
    renderHook(() => useServiceWorkerUpdateChecks(registration, { throttleMs: 1000, periodicCheckMs: null }))
    expect(registration.update).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('focus'))
    expect(registration.update).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    window.dispatchEvent(new Event('focus'))
    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('re-checks when the page becomes visible again, but not when it becomes hidden', () => {
    vi.useFakeTimers()
    const registration = createRegistration()
    renderHook(() => useServiceWorkerUpdateChecks(registration, { throttleMs: 1000, periodicCheckMs: null }))
    expect(registration.update).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(1)

    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('schedules a bounded periodic check while the app stays open', () => {
    vi.useFakeTimers()
    const registration = createRegistration()
    renderHook(() =>
      useServiceWorkerUpdateChecks(registration, { throttleMs: 1000, periodicCheckMs: 60_000 }),
    )
    expect(registration.update).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    expect(registration.update).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(60_000)
    expect(registration.update).toHaveBeenCalledTimes(3)
  })

  it('does not schedule a periodic check when periodicCheckMs is null', () => {
    vi.useFakeTimers()
    const registration = createRegistration()
    renderHook(() => useServiceWorkerUpdateChecks(registration, { periodicCheckMs: null }))
    expect(registration.update).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(24 * 60 * 60_000)
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('removes listeners and clears the interval on unmount', () => {
    vi.useFakeTimers()
    const registration = createRegistration()
    const { unmount } = renderHook(() =>
      useServiceWorkerUpdateChecks(registration, { throttleMs: 1000, periodicCheckMs: 60_000 }),
    )
    expect(registration.update).toHaveBeenCalledTimes(1)

    unmount()

    vi.advanceTimersByTime(1000)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(60_000)

    expect(registration.update).toHaveBeenCalledTimes(1)
  })
})
