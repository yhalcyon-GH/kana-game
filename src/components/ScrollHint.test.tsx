import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrollHint } from './ScrollHint'

// jsdom doesn't implement ResizeObserver or real layout — stub it so the
// component's effect can register/observe without crashing, and drive
// scrollHeight/clientHeight/scrollY manually to simulate scroll state.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

function setViewport(scrollHeight: number, clientHeight: number, scrollY: number) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(document.documentElement, 'clientHeight', { value: clientHeight, configurable: true })
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true })
}

function getHint(container: HTMLElement) {
  return container.querySelector('[aria-hidden="true"]') as HTMLElement
}

describe('ScrollHint', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is hidden (opacity-0) on a non-scrollable page', () => {
    setViewport(500, 500, 0)
    const { container } = render(
      <MemoryRouter>
        <ScrollHint />
      </MemoryRouter>,
    )
    expect(getHint(container).className).toContain('opacity-0')
  })

  it('is visible when the page is scrollable and not near the bottom', () => {
    setViewport(2000, 500, 0)
    const { container } = render(
      <MemoryRouter>
        <ScrollHint />
      </MemoryRouter>,
    )
    expect(getHint(container).className).toContain('opacity-60')
  })

  it('hides again once scrolled near the bottom', () => {
    setViewport(2000, 500, 0)
    const { container } = render(
      <MemoryRouter>
        <ScrollHint />
      </MemoryRouter>,
    )
    expect(getHint(container).className).toContain('opacity-60')

    act(() => {
      setViewport(2000, 500, 1500)
      window.dispatchEvent(new Event('scroll'))
    })
    expect(getHint(container).className).toContain('opacity-0')
  })
})
