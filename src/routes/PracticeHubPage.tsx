import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HubBreadcrumb } from '../components/HubBreadcrumb'
import { Mascot } from '../components/Mascot'
import { ReviewEmptyState } from '../components/ReviewEmptyState'
import { CATEGORIES_BY_ID, getNextRowId, ROWS_BY_ID } from '../data/curriculum'
import { REVIEW_SCOPE_ID, useCurriculum } from '../hooks/useCurriculum'
import { getRecommendedActivity } from '../lib/recommendedPath'
import { useProgressStore } from '../store/progressStore'

// Tracing sits with Learn rather than the games below: it's how you find
// out how to write a character (stroke order demo + guided trace), not a
// mastery check like the games are, so it belongs to the "learning" step of
// the flow, positioned right after Learn.
const PRACTICE_GAMES = [
  { path: 'listening', label: 'Listening', emoji: '🎧', description: 'Pick the word you hear' },
  { path: 'word-builder', label: 'Word Builder', emoji: '🧩', description: 'Spell the word from tiles' },
  { path: 'kana-quiz', label: 'Kana Quiz', emoji: '❓', description: 'Read a kana, pick its sound' },
  { path: 'kana-typing', label: 'Kana Typing', emoji: '⌨️', description: 'Type the word — kana or romaji' },
]

type Activity = {
  path: string
  label: string
  emoji: string
  description: string
  // A small "✓" only — see progressStore.ts's RowActivityCompletion: this
  // activity's normal session has been completed once for this row. NOT
  // mastery (see RowMap's separate, unrelated "🌟 mastered" badge) and
  // deliberately not styled to look like it.
  completed?: boolean
  // Kana Typing only — labeled so it's clear it never gates or advances
  // the Recommended Path below, without a bigger explanatory panel.
  optional?: boolean
}

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
          <span className="font-semibold">
            {activity.label}
            {activity.completed && <span className="ml-1 text-green-600 dark:text-green-400">✓</span>}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {activity.optional ? 'Optional' : activity.description}
          </span>
        </Link>
      ))}
    </div>
  )
}

type Props = {
  // Set only by the review routes (/practice/review, .../review/kana-quiz,
  // ...), which aren't nested under :categoryId since Review spans every
  // taught category — see REVIEW_SCOPE_ID.
  rowIdOverride?: string
}

// Single hub page for a row: Learn plus every mini-game live here as equal
// activity cards, rather than Learn being a separate flow the learner has
// to navigate away from Practice to reach.
export function PracticeHubPage({ rowIdOverride }: Props = {}) {
  const params = useParams<{ categoryId?: string; rowId?: string }>()
  const rowId = rowIdOverride ?? params.rowId
  const navigate = useNavigate()
  const { isScopeReady, reviewCount } = useCurriculum()
  const isReview = rowId === REVIEW_SCOPE_ID
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined
  const categoryId = isReview ? undefined : (params.categoryId ?? row?.categoryId)

  const isRowTaught = useProgressStore((s) => s.isRowTaught)
  const rowActivityCompletion = useProgressStore((s) => s.rowActivityCompletion)

  useEffect(() => {
    // Review with nothing taught yet gets an explanatory message below
    // instead of a silent bounce to Home — from the learner's side, a tap
    // that visibly does nothing (or flashes and reverts) looks like a bug,
    // not "you haven't unlocked this yet." Every other invalid-state case
    // still redirects exactly as before.
    if (rowId && isReview && !isScopeReady(rowId)) return
    if (!rowId || !isScopeReady(rowId) || (!isReview && row?.categoryId !== categoryId)) {
      navigate('/', { replace: true })
    }
  }, [rowId, isReview, row, categoryId, isScopeReady, navigate])

  if (!rowId || (!isReview && !row)) return null

  if (isReview && !isScopeReady(rowId)) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Mascot mood="normal" />
        <h1 className="text-xl font-bold">Nothing to review yet</h1>
        <p className="text-neutral-500 dark:text-neutral-400">Finish Learn for at least one row first, then come back here.</p>
        <Link to="/" className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700">
          Go learn something
        </Link>
      </div>
    )
  }

  // Review with something taught/practiced but nothing currently active in
  // either pool (see useCurriculum's weakCharacterIds/weakWords) is a
  // genuine success state, not "nothing to show" — there's no fallback to
  // mixing in already-mastered material any more, so the game cards below
  // would otherwise link to empty sessions.
  if (isReview && reviewCount === 0) {
    return <ReviewEmptyState />
  }

  const hubBase = isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`

  // Tracing walks through "every word in this row" as its second phase (see
  // TracingPage) — that only makes sense for a single row's small word
  // list, not Review's every-taught-row mix, so it's excluded there.
  const isSummary = !isReview && !!row?.isSummary
  // Kana Quiz doesn't fit 'contrast-pairs' categories (促音/長音) — there's
  // no single isolated character to quiz a reading on the way there is for
  // a normal gojūon row (see docs/curriculum-extensibility.md and
  // characters.ts's sokuon comment). Review always shows all four games:
  // it mixes every taught category, most of which ARE quizzable, and
  // useCurriculum's getScopeQuizCharacterIds already filters contrast-pairs
  // characters out of Review's own Kana Quiz pool specifically.
  const isContrastPairs = !isReview && CATEGORIES_BY_ID[categoryId ?? '']?.learnStyle === 'contrast-pairs'

  // Recommended Path — see lib/recommendedPath.ts. Deliberately scoped to
  // real, non-summary rows only: Review has its own separate "what needs
  // repair" framing (reviewCount above), and a summary row's Learn/Practice
  // shape (every character/word in the category at once, no per-character
  // markRowTaught) doesn't fit this per-row completion model.
  const showRecommendedPath = !isReview && !isSummary
  const tracingCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.tracing === true
  const kanaQuizCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.kanaQuiz === true
  const listeningCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.listening === true
  const wordBuilderCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.wordBuilder === true
  // "Character introduction" is done once EITHER Learn or Tracing has been
  // finished once — neither is required over the other, and finishing one
  // never locks out the other (both stay freely accessible below either way).
  const introCompleted = showRecommendedPath && (isRowTaught(rowId) || tracingCompleted)
  const recommended = showRecommendedPath
    ? getRecommendedActivity({
        learnStyle: isContrastPairs ? 'contrast-pairs' : 'character-set',
        introCompleted,
        kanaQuizCompleted,
        listeningCompleted,
        wordBuilderCompleted,
      })
    : 'learn'

  const nextRowId = showRecommendedPath ? getNextRowId(rowId) : null
  const nextRowCategoryId = nextRowId ? ROWS_BY_ID[nextRowId]?.categoryId : undefined

  // Review has no "meet new characters" step (that's what Learn is for on a
  // real row) — instead its Learn section offers a browse-only look back at
  // whatever's actually being gotten wrong lately, split 単音/語彙 per the
  // user's request (see ReviewMistakesPage).
  const learnActivities: Activity[] = isReview
    ? [
        { path: `${hubBase}/learn-chars`, label: 'Weak Kana', emoji: '🔤', description: 'Review characters you keep missing' },
        { path: `${hubBase}/learn-words`, label: 'Weak Words', emoji: '📚', description: 'Review words you keep missing' },
      ]
    : [
        { path: `/learn/${categoryId}/${rowId}`, label: 'Learn', emoji: '📖', description: 'Meet the new characters', completed: isRowTaught(rowId) },
        ...(isSummary
          ? []
          : [{ path: `${hubBase}/tracing`, label: 'Tracing', emoji: '✍️', description: 'Watch the stroke order, then trace', completed: tracingCompleted }]),
      ]
  const gameCompletion: Record<string, boolean | undefined> = {
    'kana-quiz': kanaQuizCompleted,
    listening: listeningCompleted,
    'word-builder': wordBuilderCompleted,
  }
  const practiceActivities: Activity[] = PRACTICE_GAMES.filter((game) => !(isContrastPairs && game.path === 'kana-quiz')).map(
    (game) => ({
      path: `${hubBase}/${game.path}`,
      label: game.label,
      emoji: game.emoji,
      description: game.description,
      completed: gameCompletion[game.path],
      optional: game.path === 'kana-typing',
    }),
  )

  const recommendedActivity: Activity | undefined =
    recommended === 'kana-quiz' || recommended === 'listening' || recommended === 'word-builder'
      ? practiceActivities.find((a) => a.path === `${hubBase}/${recommended}`)
      : undefined

  return (
    <div className="flex flex-col items-center gap-6">
      {!isReview && <HubBreadcrumb rowId={rowId} categoryId={categoryId!} />}
      <h1 className="text-2xl font-bold">{isReview ? 'Review — all learned rows' : `${isSummary ? '⭐ ' : ''}${row!.label}`}</h1>
      {isReview && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {reviewCount} item{reviewCount === 1 ? '' : 's'} need review
        </p>
      )}

      {showRecommendedPath && recommended === 'done' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">Lesson complete</p>
          {nextRowId && nextRowCategoryId && (
            <Link
              to={`/practice/${nextRowCategoryId}/${nextRowId}`}
              className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Next Row
            </Link>
          )}
        </div>
      )}

      {showRecommendedPath && recommendedActivity && (
        <div className="flex w-full max-w-md flex-col items-center gap-2">
          <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
            ⭐ Recommended
          </h2>
          <ActivityGrid activities={[recommendedActivity]} />
        </div>
      )}

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          {showRecommendedPath && !introCompleted ? 'Choose how to learn' : 'Learn'}
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
