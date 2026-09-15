import { describe, expect, it } from 'vitest'
import { calculateReleaseFingerprint } from './productionReleaseIntegrity.mjs'

describe('production release integrity fingerprint', () => {
  it('calculates a stable non-secret SHA-256 fingerprint for the reviewed API release', () => {
    expect(calculateReleaseFingerprint()).toMatch(/^[a-f0-9]{64}$/)
  })
})
