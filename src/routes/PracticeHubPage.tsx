import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ROWS_BY_ID } from '../data/curriculum'
import { REVIEW_SCOPE_ID, useCurriculum } from '../hooks/useCurriculum'

// Tracing sits with Learn rather than the games below: it's how you find
// out how to write a character (stroke order demo + guided trace), not a
// mastery check like the games are, so it belongs to the "learning" step of
// the flow, positioned right after Learn.
const PRACTICE_GAMES = [
  { path: 'word-builder', label: 'Word Builder', emoji: '🧩', description: 'Spell the word from tiles' },
  { path: 'listening', label: 'Listening', emoji: '🎧', description: 'Pick the kana you hear' },
  { path: 'kana-quiz', label: 'Kana Quiz', emoji: '❓', description: 'Read a kana, pick its sound' },
  { path: 'kana-typing', label: 'Kana Typing', emoji: '⌨️', description: 'Type the word — kana or romaji' },
]

type Activity = { path: string; label: string; emoji: string; description: string }

function ActivityGrid({ activities }: { activities: Activity[] }) {
  return (
    <div className="grid w-full max-w-md grid-cols-3 gap-3">
      {activities.map((activity) => (
        <Link
          key={activity.path}
          to={activity.path}
          className="flex flex-col items-center gap-1 rounded-xl border border-neutral-300 bg-white p-4 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
        >
          <span className="text-3xl">{activity.emoji}</span>
          <span className="font-semibold">{activity.label}</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{activity.description}</span>
        </Link>
      ))}
    </div>
  )
}

// Single hub page for a row: Learn plus every mini-game live here as equal
// activity cards, rather than Learn being a separate flow the learner has
// to navigate away from Practice to reach.
export function PracticeHubPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady, dueReviewCount } = useCurriculum()
  const isReview = rowId === REVIEW_SCOPE_ID
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId)) {
      navigate('/', { replace: true })
    }
  }, [rowId, isScopeReady, navigate])

  if (!rowId || (!isReview && !row)) return null

  // Tracing walks through "every word in this row" as its second phase (see
  // TracingPage) — that only makes sense for a single row's small word
  // list, not Review's every-taught-row mix, so it's excluded there.
  const learnActivities: Activity[] = [
    ...(isReview ? [] : [{ path: `/learn/${rowId}`, label: 'Learn', emoji: '📖', description: 'Meet the new characters' }]),
    ...(isReview
      ? []
      : [{ path: `/practice/${rowId}/tracing`, label: 'Tracing', emoji: '✍️', description: 'Watch the stroke order, then trace' }]),
  ]
  const practiceActivities: Activity[] = PRACTICE_GAMES.map((game) => ({
    path: `/practice/${rowId}/${game.path}`,
    label: game.label,
    emoji: game.emoji,
    description: game.description,
  }))

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">{isReview ? 'Review — all learned rows' : row!.label}</h1>
      {isReview && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {dueReviewCount > 0
            ? `${dueReviewCount} character${dueReviewCount === 1 ? '' : 's'} due for review`
            : 'Nothing due right now — mixing in everything you know'}
        </p>
      )}

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          Learn
        </h2>
        <ActivityGrid activities={learnActivities} />
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          Practice
        </h2>
        <ActivityGrid activities={practiceActivities} />
      </div>
    </div>
  )
}
