import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ROWS_BY_ID } from '../data/curriculum'
import { REVIEW_SCOPE_ID, useCurriculum } from '../hooks/useCurriculum'

const GAMES = [
  { path: 'word-builder', label: 'Word Builder', emoji: '🧩', description: 'Spell the word from tiles' },
  { path: 'listening', label: 'Listening', emoji: '🎧', description: 'Pick the kana you hear' },
]

export function PracticeHubPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const { isScopeReady } = useCurriculum()
  const isReview = rowId === REVIEW_SCOPE_ID
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined

  useEffect(() => {
    if (!rowId || !isScopeReady(rowId)) {
      navigate('/', { replace: true })
    }
  }, [rowId, isScopeReady, navigate])

  if (!rowId || (!isReview && !row)) return null

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">{isReview ? 'Review — all learned rows' : `${row!.label} — practice`}</h1>
      <div className="grid w-full max-w-md grid-cols-2 gap-4">
        {GAMES.map((game) => (
          <Link
            key={game.path}
            to={`/practice/${rowId}/${game.path}`}
            className="flex flex-col items-center gap-1 rounded-xl border border-neutral-300 bg-white p-4 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
          >
            <span className="text-3xl">{game.emoji}</span>
            <span className="font-semibold">{game.label}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{game.description}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
