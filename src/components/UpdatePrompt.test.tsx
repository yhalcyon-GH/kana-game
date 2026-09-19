import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const updateServiceWorker = vi.fn()
const registrationUpdate = vi.fn().mockResolvedValue(undefined)
let needRefresh = false
let registerOptions: {
  onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void
} | undefined

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: typeof registerOptions) => {
    registerOptions = options
    return {
      needRefresh: [needRefresh, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    }
  },
}))

import {
  UPDATE_CHECK_MIN_INTERVAL_MS,
  UPDATE_CHECK_PERIOD_MS,
  UpdatePrompt,
} from './UpdatePrompt'

function provideRegistration() {
  act(() => {
    registerOptions?.onRegisteredSW?.('/sw.js', {
      update: registrationUpdate,
    } as unknown as ServiceWorkerRegistration)
  })
}

describe('UpdatePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T00:00:00Z'))
    needRefresh = false
    registerOptions = undefined
    updateServiceWorker.mockReset()
    registrationUpdate.mockReset()
    registrationUpdate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when no update is waiting', () => {
    render(<UpdatePrompt />)
    expect(screen.queryByText('A new version is available.')).not.toBeInTheDocument()
  })

  it('shows the update prompt once a new service worker is waiting', () => {
    needRefresh = true
    render(<UpdatePrompt />)

    expect(screen.getByText('A new version is available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
  })

  it('activates the waiting worker and reloads when Update is pressed', () => {
    needRefresh = true
    render(<UpdatePrompt />)

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('actively checks for an update as soon as the registration is available', () => {
    render(<UpdatePrompt />)
    provideRegistration()

    expect(registrationUpdate).toHaveBeenCalledTimes(1)
  })

  it('checks again on focus after the throttle window', () => {
    render(<UpdatePrompt />)
    provideRegistration()

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_MIN_INTERVAL_MS)
      window.dispatchEvent(new Event('focus'))
    })

    expect(registrationUpdate).toHaveBeenCalledTimes(2)
  })

  it('does not hammer update checks when focus repeats inside the throttle window', () => {
    render(<UpdatePrompt />)
    provideRegistration()

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_MIN_INTERVAL_MS - 1)
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
    })

    expect(registrationUpdate).toHaveBeenCalledTimes(1)
  })

  it('checks again when the app becomes visible after the throttle window', () => {
    render(<UpdatePrompt />)
    provideRegistration()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_MIN_INTERVAL_MS)
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(registrationUpdate).toHaveBeenCalledTimes(2)
  })

  it('performs a bounded periodic check while the app remains open', () => {
    render(<UpdatePrompt />)
    provideRegistration()

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_PERIOD_MS)
    })

    expect(registrationUpdate).toHaveBeenCalledTimes(2)
  })
})
