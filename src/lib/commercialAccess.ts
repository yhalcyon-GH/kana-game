import { CATEGORIES_BY_ID, DEFAULT_CATEGORY_ID, ROWS_BY_ID } from '../data/curriculum'
import type { AssessmentScript } from '../store/progressStore'

export type EntitlementStatus = 'signed-out' | 'loading' | 'inactive' | 'active' | 'unavailable'

export type CommercialActivity =
  | 'learn'
  | 'tracing'
  | 'kana-quiz'
  | 'listening'
  | 'kana-typing'
  | 'word-builder'
  | 'restaurant'
  | 'cafe'

export type CommercialAccessTarget =
  | { kind: 'category'; categoryId: string }
  | { kind: 'row'; rowId: string }
  | { kind: 'activity'; rowId: string; activity: CommercialActivity }
  | { kind: 'assessment'; assessment: AssessmentScript }
  | { kind: 'review-content'; sourceCategoryId: string }
  | { kind: 'saved-content'; sourceCategoryId: string }

const KNOWN_ASSESSMENTS = new Set<AssessmentScript>([
  'hiragana',
  'katakana',
  'sokuon-chouon',
  'youon-special-katakana',
  'final-graduation',
])

function isKnownCategory(categoryId: string): boolean {
  return CATEGORIES_BY_ID[categoryId] !== undefined
}

function hasCategoryAccess(categoryId: string, status: EntitlementStatus): boolean {
  if (!isKnownCategory(categoryId)) return false
  return categoryId === DEFAULT_CATEGORY_ID || status === 'active'
}

/**
 * Commercial access is deliberately separate from curriculum progression.
 * These pure checks never read or mutate mastery, SRS, Recommended Path, or
 * persisted progress; callers combine access with progression at the UI edge.
 */
export function isCommerciallyAccessible(target: CommercialAccessTarget, status: EntitlementStatus): boolean {
  switch (target.kind) {
    case 'category':
      return hasCategoryAccess(target.categoryId, status)
    case 'row': {
      const row = ROWS_BY_ID[target.rowId]
      return row !== undefined && hasCategoryAccess(row.categoryId, status)
    }
    case 'activity': {
      const row = ROWS_BY_ID[target.rowId]
      return row !== undefined && hasCategoryAccess(row.categoryId, status)
    }
    case 'assessment':
      if (!KNOWN_ASSESSMENTS.has(target.assessment)) return false
      return target.assessment === 'hiragana' || status === 'active'
    case 'review-content':
    case 'saved-content':
      return hasCategoryAccess(target.sourceCategoryId, status)
  }
}

export function isCategoryAccessible(categoryId: string, status: EntitlementStatus): boolean {
  return isCommerciallyAccessible({ kind: 'category', categoryId }, status)
}

export function isRowAccessible(rowId: string, status: EntitlementStatus): boolean {
  return isCommerciallyAccessible({ kind: 'row', rowId }, status)
}

export function isActivityAccessible(
  target: { rowId: string; activity: CommercialActivity },
  status: EntitlementStatus,
): boolean {
  return isCommerciallyAccessible({ kind: 'activity', ...target }, status)
}

export function isAssessmentAccessible(assessment: AssessmentScript, status: EntitlementStatus): boolean {
  return isCommerciallyAccessible({ kind: 'assessment', assessment }, status)
}

export function isReviewContentAccessible(sourceCategoryId: string, status: EntitlementStatus): boolean {
  return isCommerciallyAccessible({ kind: 'review-content', sourceCategoryId }, status)
}

export function isSavedContentAccessible(sourceCategoryId: string, status: EntitlementStatus): boolean {
  return isCommerciallyAccessible({ kind: 'saved-content', sourceCategoryId }, status)
}
