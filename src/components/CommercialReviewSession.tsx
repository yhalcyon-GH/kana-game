import { Fragment, useLayoutEffect, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { CATEGORIES } from '../data/curriculum'
import { REVIEW_SCOPE_ID } from '../hooks/useCurriculum'
import { useTTS } from '../hooks/useTTS'
import { isReviewContentAccessible } from '../lib/commercialAccess'
import { useEntitlement } from './EntitlementContext'

// Review queues, frozen word resolvers, answers, and pending timers must all
// expire together when access changes. Equivalent restricted states keep the
// same free session, and real row sessions retain their existing lifecycle.
export function CommercialReviewSession({ rowIdOverride, children }: { rowIdOverride?: string; children: ReactNode }) {
  const { rowId } = useParams<{ rowId: string }>()
  const { state } = useEntitlement()
  const { stop } = useTTS()
  const key = (rowIdOverride ?? rowId) === REVIEW_SCOPE_ID
    ? CATEGORIES.filter((category) => isReviewContentAccessible(category.id, state.status)).map((category) => category.id).join(':')
    : undefined
  useLayoutEffect(() => {
    if (key !== undefined) return stop
  }, [key, stop])
  return <Fragment key={key}>{children}</Fragment>
}
