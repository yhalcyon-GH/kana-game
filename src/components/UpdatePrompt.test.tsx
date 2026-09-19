import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateServiceWorker = vi.fn()
let needRefresh = false
let registeredSW: ((swUrl: string, registration: ServiceWorkerRegistration | undefined) => void) | undefined

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: {
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  }) => {
    registeredSW = options?.onRegisteredSW
    return {
      needRefresh: [needRefresh, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    }
  },
}))

import { UpdatePrompt } from './UpdatePrompt'

describe('UpdatePrompt', () => {
  beforeEach(() => {
    registeredSW = undefined
  })

  it('renders nothing when no update is waiting', () => {
    needRefresh = false
    render(<UpdatePrompt />)

    expect(screen.queryByText('A new version is available.')).not.toBeInTheDocument()
  })

  it('asks the registered service worker to check for an update on mount', () => {
    needRefresh = false
    const registrationUpdate = vi.fn().mockResolvedValue(undefined)
    render(<UpdatePrompt />)

    act(() => {
      registeredSW?.('/sw.js', { update: registrationUpdate } as unknown as ServiceWorkerRegistration)
    })

    expect(registrationUpdate).toHaveBeenCalledTimes(1)
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
})
