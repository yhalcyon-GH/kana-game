import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const updateServiceWorker = vi.fn()
let needRefresh = false

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}))

import { UpdatePrompt } from './UpdatePrompt'

describe('UpdatePrompt', () => {
  it('renders nothing when no update is waiting', () => {
    needRefresh = false
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
})
