import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Vitest's `globals` option is off (see vite.config.ts), so
// @testing-library/react can't auto-detect a global `afterEach` to register
// its usual automatic unmount-between-tests cleanup — without this, render()
// output from one test leaks into the next test's assertions.
afterEach(() => {
  cleanup()
})

// jsdom doesn't implement SVGGeometryElement.getTotalLength (real browsers
// all do) — StrokeOrderAnimation calls it unconditionally on mount, so any
// test rendering it needs this stubbed or it throws. Stubbed on SVGElement
// (not SVGPathElement) since jsdom's actual <path> instances inherit
// getTotalLength from there rather than exposing their own override.
if (typeof window.SVGElement !== 'undefined') {
  // @ts-expect-error -- jsdom's SVGElement type doesn't declare this method
  window.SVGElement.prototype.getTotalLength = () => 100
}
