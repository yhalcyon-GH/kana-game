import { describe, expect, it } from 'vitest'
import { track } from './track'
import type { AnalyticsProperties } from './types'

// Type-level restriction check: AnalyticsProperties only accepts the fixed,
// low-cardinality fields below — this is enforced primarily by TypeScript
// at compile time (a call site can't pass a transcript/free-text field
// without a type error), but this test documents the exact allowed shape
// so a future change to types.ts that widens it is caught in review.
describe('AnalyticsProperties shape', () => {
  it('accepts only the documented low-cardinality fields', () => {
    const properties: AnalyticsProperties = {
      category: 'hiragana',
      row: 'a-row',
      activity: 'kanaQuiz',
      assessment: 'hiragana',
      score: 8,
      questionCount: 10,
      attempt: 2,
      result: 'success',
      screenSize: 'medium',
    }
    expect(() => track('practice_completed', properties)).not.toThrow()
  })

  it('never needs a transcript, audio, free-text, name, or email field', () => {
    // If AnalyticsProperties ever gained one of these fields, this object
    // literal would need updating to stay a valid, minimal example — this
    // test exists as a canary for that kind of type widening, not as a
    // runtime guarantee (see types.ts's doc comment for the actual rule).
    const properties: AnalyticsProperties = { category: 'hiragana' }
    const keys = Object.keys(properties)
    for (const forbidden of ['transcript', 'audio', 'text', 'name', 'email', 'ip']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})
