import { Link } from 'react-router-dom'
import { REVIEW_SCOPE_ID } from '../hooks/useCurriculum'

type Props = {
  rowId: string
}

// Mid-session exit affordance for the mini-games. Without this, the only
// way back to a specific row's hub while a game is in progress is the
// browser back button or navigating all the way through Home again — the
// only "back to hub" link used to live on the post-session PracticeSummary.
export function BackToHubLink({ rowId }: Props) {
  const isReview = rowId === REVIEW_SCOPE_ID
  return (
    <Link
      to={isReview ? '/review' : `/practice/${rowId}`}
      className="self-start rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-600 hover:border-blue-400 hover:text-neutral-900 dark:border-neutral-600 dark:text-neutral-300 dark:hover:text-neutral-100"
    >
      ← Back to {isReview ? 'Review' : 'hub'}
    </Link>
  )
}
