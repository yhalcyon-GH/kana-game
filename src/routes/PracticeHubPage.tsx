import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ROWS_BY_ID } from '../data/curriculum'
import { REVIEW_SCOPE_ID, useCurriculum } from '../hooks/useCurriculum'

const GAMES = [
  { path: 'word-builder', label: 'Word Builder', emoji: '🧩', description: 'Spell the word from tiles' },
  { path: 'listening', label: 'Listening', emoji: '🎧', description: 'Pick the kana you hear' },
  { path: 'kana-quiz', label: 'Kana Quiz', emoji: '❓', description: 'Read a kana, pick its sound' },
  { path: 'kana-typing', label: 'Kana Typing', emoji: '⌨️', description: 'Type the word — kana or romaji' },
  { path: 'tracing', label: 'Tracing', emoji: '✍️', description: 'Trace the kana (ungraded practice)' },
]

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

  const activities = [
    ...(isReview ? [] : [{ path: `/learn/${rowId}`, label: 'Learn', emoji: '📖', description: 'Meet the new characters' }]),
    ...GAMES.map((game) => ({
      path: `/practice/${rowId}/${game.path}`,
      label: game.label,
      emoji: game.emoji,
      description: game.description,
    })),
  ]

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
    </div>
  )
}
