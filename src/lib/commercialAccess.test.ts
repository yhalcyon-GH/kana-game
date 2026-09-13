import { describe, expect, it } from 'vitest'
import { CATEGORIES, ROWS } from '../data/curriculum'
import type { AssessmentScript } from '../store/progressStore'
import {
  isActivityAccessible,
  isAssessmentAccessible,
  isCategoryAccessible,
  isReviewContentAccessible,
  isRowAccessible,
  isSavedContentAccessible,
  type EntitlementStatus,
} from './commercialAccess'

const NON_ACTIVE_STATUSES: EntitlementStatus[] = ['signed-out', 'loading', 'inactive', 'unavailable']

describe('commercial access policy', () => {
  it.each(NON_ACTIVE_STATUSES)('keeps every Hiragana row and activity free while %s', (status) => {
    const hiraganaRows = ROWS.filter((row) => row.categoryId === 'hiragana')

    expect(hiraganaRows.length).toBeGreaterThan(0)
    for (const row of hiraganaRows) {
      expect(isRowAccessible(row.id, status)).toBe(true)
      expect(isActivityAccessible({ rowId: row.id, activity: 'learn' }, status)).toBe(true)
      expect(isActivityAccessible({ rowId: row.id, activity: 'restaurant' }, status)).toBe(true)
    }
    expect(isAssessmentAccessible('hiragana', status)).toBe(true)
    expect(isReviewContentAccessible('hiragana', status)).toBe(true)
    expect(isSavedContentAccessible('hiragana', status)).toBe(true)
  })

  it.each(NON_ACTIVE_STATUSES)('denies every paid category and row while %s', (status) => {
    const paidCategories = CATEGORIES.filter((category) => category.id !== 'hiragana')
    const paidRows = ROWS.filter((row) => row.categoryId !== 'hiragana')

    expect(paidCategories.length).toBeGreaterThan(0)
    expect(paidRows.length).toBeGreaterThan(0)
    for (const category of paidCategories) expect(isCategoryAccessible(category.id, status)).toBe(false)
    for (const category of paidCategories) {
      expect(isReviewContentAccessible(category.id, status)).toBe(false)
      expect(isSavedContentAccessible(category.id, status)).toBe(false)
    }
    for (const row of paidRows) {
      expect(isRowAccessible(row.id, status)).toBe(false)
      expect(isActivityAccessible({ rowId: row.id, activity: 'listening' }, status)).toBe(false)
    }
  })

  it('allows all known categories, rows, activities, and assessments when active', () => {
    const assessments: AssessmentScript[] = [
      'hiragana',
      'katakana',
      'sokuon-chouon',
      'youon-special-katakana',
      'final-graduation',
    ]

    for (const category of CATEGORIES) expect(isCategoryAccessible(category.id, 'active')).toBe(true)
    for (const row of ROWS) {
      expect(isRowAccessible(row.id, 'active')).toBe(true)
      expect(isActivityAccessible({ rowId: row.id, activity: 'word-builder' }, 'active')).toBe(true)
    }
    for (const assessment of assessments) expect(isAssessmentAccessible(assessment, 'active')).toBe(true)
  })

  it('fails closed for unknown commercial targets even when active', () => {
    expect(isCategoryAccessible('future-unknown-category', 'active')).toBe(false)
    expect(isRowAccessible('future-unknown-row', 'active')).toBe(false)
  })
})
