import { Link } from 'react-router-dom'
import { Mascot } from './Mascot'

// Shown when a Review game is opened but its live pool (character or word,
// see useCurriculum's weakCharacterIds/weakWords) is currently empty — a
// genuine success state (nothing is currently missed enough to need
// review), not an error. Review deliberately has no "mix in everything
// taught" fallback any more, so this replaces what would otherwise be a
// blank/null page for a Review route with nothing eligible.
export function ReviewEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Mascot mood="correct" />
      <h1 className="text-xl font-bold">Review complete!</h1>
      <p className="text-neutral-500 dark:text-neutral-400">Nothing to review right now — nice work!</p>
      <Link to="/practice/review" className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700">
        Back to Review
      </Link>
    </div>
  )
}
