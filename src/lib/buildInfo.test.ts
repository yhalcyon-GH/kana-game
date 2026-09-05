import { describe, expect, it } from 'vitest'
import { BUILD_SHA, SHORT_BUILD_SHA } from './buildInfo'

// Vitest runs with import.meta.env.DEV === true and no VITE_BUILD_SHA set
// (no CI env var in the test environment), so this proves the safe 'dev'
// fallback path specifically — the 'unknown' production fallback and the
// real-SHA path are exercised by inspection of buildInfo.ts's logic, since
// import.meta.env.DEV is compile-time-constant and can't be flipped per-test
// without a separate build.
describe('buildInfo', () => {
  it('falls back to a safe non-empty placeholder when no CI SHA is injected', () => {
    expect(BUILD_SHA).toBe('dev')
  })

  it('never produces an empty string', () => {
    expect(BUILD_SHA.length).toBeGreaterThan(0)
    expect(SHORT_BUILD_SHA.length).toBeGreaterThan(0)
  })

  it('does not truncate the dev/unknown placeholders', () => {
    expect(SHORT_BUILD_SHA).toBe(BUILD_SHA)
  })
})
