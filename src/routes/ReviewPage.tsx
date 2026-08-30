import { Navigate } from 'react-router-dom'

// Review mixes every taught row's words/characters — reuses the same
// PracticeHubPage and mini-game components as a per-row hub by passing the
// REVIEW_SCOPE_ID pseudo row id ("review") through the existing
// /practice/:rowId route shape (see hooks/useCurriculum.ts).
export function ReviewPage() {
  return <Navigate to="/practice/review" replace />
}
