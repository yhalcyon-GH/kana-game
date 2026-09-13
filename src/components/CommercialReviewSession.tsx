import { Fragment, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { REVIEW_SCOPE_ID } from '../hooks/useCurriculum'
import { useCommercialContentSession } from '../hooks/useCommercialContentSession'

// Review queues, frozen word resolvers, answers, and pending timers must all
// expire together when access changes. Equivalent restricted states keep the
// same free session, and real row sessions retain their existing lifecycle.
export function CommercialReviewSession({ rowIdOverride, children }: { rowIdOverride?: string; children: ReactNode }) {
  const { rowId } = useParams<{ rowId: string }>()
  const key = useCommercialContentSession((rowIdOverride ?? rowId) === REVIEW_SCOPE_ID ? 'review-content' : undefined)
  return <Fragment key={key}>{children}</Fragment>
}
