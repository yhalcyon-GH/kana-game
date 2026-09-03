import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HubBreadcrumb } from '../components/HubBreadcrumb'
import { LearnTracingGuide } from '../components/LearnTracingGuide'
import { Mascot } from '../components/Mascot'
import { ConceptGuide } from '../components/ConceptGuide'
import { PracticeGuide } from '../components/PracticeGuide'
import { ReviewEmptyState } from '../components/ReviewEmptyState'
import { ReviewGuide } from '../components/ReviewGuide'
import { CATEGORIES_BY_ID, getNextRowId, ROWS_BY_ID } from '../data/curriculum'
import { LEARN_TRACING_GUIDE } from '../data/learnTracingGuide'
import { PRACTICE_GUIDE } from '../data/practiceGuide'
import { PRACTICE_CHECKPOINTS } from '../data/practiceCheckpoints'
import { SOKUON_GUIDE } from '../data/sokuonGuide'
import { DEFAULT_SOKUON_GUIDE_LOCALE, SOKUON_GUIDE_CONTENT } from '../data/sokuonGuideContent'
import { CHOUON_GUIDE } from '../data/chouonGuide'
import { ChouonGuide } from '../components/ChouonGuide'
import { YOUON_GUIDE } from '../data/youonGuide'
import { YouonGuide } from '../components/YouonGuide'
import { SPECIAL_KATAKANA_GUIDE } from '../data/specialKatakanaGuide'
import { SpecialKatakanaGuide } from '../components/SpecialKatakanaGuide'
import { PARTICLE_GUIDE } from '../data/particleGuide'
import { ParticleGuide } from '../components/ParticleGuide'
import { REVIEW_SCOPE_ID, useCurriculum } from '../hooks/useCurriculum'
import { useActiveGuideReplayId, useGuideReplay } from '../hooks/useGuideReplay'
import { getRecommendedActivity } from '../lib/recommendedPath'
import { useProgressStore } from '../store/progressStore'

const PRACTICE_GAMES = [
  { path: 'kana-quiz', label: 'Kana Quiz', emoji: '❓', description: 'Pick the sound' },
  { path: 'listening', label: 'Listening', emoji: '🎧', description: 'Pick what you hear' },
  { path: 'word-builder', label: 'Word Builder', emoji: '🧩', description: 'Build the word' },
]
const KANA_TYPING_GAME = { path: 'kana-typing', label: 'Kana Typing', emoji: '⌨️', description: 'Type the kana' }

type Activity = {
  path: string
  label: string
  emoji: string
  description: string
  completed?: boolean
  highlighted?: boolean
  disabled?: boolean
  recommended?: boolean
}

function ActivityGrid({
  activities,
  disabled = false,
  onActivate,
}: {
  activities: Activity[]
  disabled?: boolean
  onActivate?: (path: string) => void
}) {
  return (
    <div className="grid w-full max-w-md grid-cols-3 gap-3">
      {activities.map((activity) => {
        const isDisabled = disabled || activity.disabled
        const className = `flex flex-col items-center gap-1 rounded-xl border bg-white p-4 text-center dark:bg-neutral-800 ${isDisabled && !onActivate ? 'cursor-not-allowed' : 'hover:border-blue-400'} ${activity.highlighted ? 'border-yellow-400 ring-2 ring-yellow-400 ring-offset-2 dark:border-yellow-300 dark:ring-yellow-300' : 'border-neutral-300 dark:border-neutral-600'}`
        const content = (
          <>
            <span className="text-3xl">{activity.emoji}</span>
            <span className="font-semibold">
              {activity.label}
              {activity.completed && <span className="ml-1 text-green-600 dark:text-green-400">✓</span>}
              {activity.recommended && (
                <span className="ml-1" aria-label="Recommended">⭐</span>
              )}
            </span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{activity.description}</span>
          </>
        )

        if (isDisabled && onActivate) {
          return (
            <button key={activity.path} type="button" onClick={() => onActivate(activity.path)} className={className}>
              {content}
            </button>
          )
        }

        return isDisabled ? (
          <div key={activity.path} role="link" aria-disabled="true" tabIndex={-1} className={className}>
            {content}
          </div>
        ) : (
          <Link key={activity.path} to={activity.path} className={className}>
            {content}
          </Link>
        )
      })}
    </div>
  )
}

type Props = { rowIdOverride?: string }

export function PracticeHubPage({ rowIdOverride }: Props = {}) {
  const params = useParams<{ categoryId?: string; rowId?: string }>()
  const rowId = rowIdOverride ?? params.rowId
  const navigate = useNavigate()
  const { isScopeReady, reviewCount, globalRecommendedTarget } = useCurriculum()
  const isReview = rowId === REVIEW_SCOPE_ID
  const row = rowId && !isReview ? ROWS_BY_ID[rowId] : undefined
  const categoryId = isReview ? undefined : (params.categoryId ?? row?.categoryId)

  const isRowTaught = useProgressStore((s) => s.isRowTaught)
  const rowActivityCompletion = useProgressStore((s) => s.rowActivityCompletion)
  const hasCompletedIntroGuide = useProgressStore((s) => s.hasCompletedIntroGuide)
  const hasCompletedLearnTracingGuide = useProgressStore((s) => s.hasCompletedLearnTracingGuide)
  const setHasCompletedLearnTracingGuide = useProgressStore((s) => s.setHasCompletedLearnTracingGuide)
  const hasCompletedPracticeGuide = useProgressStore((s) => s.hasCompletedPracticeGuide)
  const setHasCompletedPracticeGuide = useProgressStore((s) => s.setHasCompletedPracticeGuide)
  const hasCompletedSokuonGuide = useProgressStore((s) => s.hasCompletedSokuonGuide)
  const setHasCompletedSokuonGuide = useProgressStore((s) => s.setHasCompletedSokuonGuide)
  const hasCompletedChouonGuide = useProgressStore((s) => s.hasCompletedChouonGuide)
  const setHasCompletedChouonGuide = useProgressStore((s) => s.setHasCompletedChouonGuide)
  const hasCompletedYouonGuide = useProgressStore((s) => s.hasCompletedYouonGuide)
  const setHasCompletedYouonGuide = useProgressStore((s) => s.setHasCompletedYouonGuide)
  const hasCompletedSpecialKatakanaGuide = useProgressStore((s) => s.hasCompletedSpecialKatakanaGuide)
  const setHasCompletedSpecialKatakanaGuide = useProgressStore((s) => s.setHasCompletedSpecialKatakanaGuide)
  const hasCompletedParticleGuide = useProgressStore((s) => s.hasCompletedParticleGuide)
  const setHasCompletedParticleGuide = useProgressStore((s) => s.setHasCompletedParticleGuide)

  const { isReplaying: isLearnTracingReplay, dismissReplay: dismissLearnTracingReplay } = useGuideReplay('learnTracing')
  const { isReplaying: isPracticeReplay, dismissReplay: dismissPracticeReplay } = useGuideReplay('practice')
  const { isReplaying: isSokuonReplay, dismissReplay: dismissSokuonReplay } = useGuideReplay('sokuon')
  const { isReplaying: isChouonReplay, dismissReplay: dismissChouonReplay } = useGuideReplay('chouon')
  const { isReplaying: isYouonReplay, dismissReplay: dismissYouonReplay } = useGuideReplay('youon')
  const { isReplaying: isSpecialKatakanaReplay, dismissReplay: dismissSpecialKatakanaReplay } = useGuideReplay('specialKatakana')
  const { isReplaying: isParticleReplay, dismissReplay: dismissParticleReplay } = useGuideReplay('particle')
  const { isReplaying: isReviewReplay, dismissReplay: dismissReviewReplay } = useGuideReplay('review')
  const activeGuideReplayId = useActiveGuideReplayId()

  useEffect(() => {
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
        <p className="text-neutral-500 dark:text-neutral-400">Finish one Learn lesson first.</p>
        <Link to="/" className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700">Go learn something</Link>
      </div>
    )
  }

  if (isReview && reviewCount === 0 && !isReviewReplay) return <ReviewEmptyState />

  const hubBase = isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`
  const isSummary = !isReview && !!row?.isSummary
  const isSimilarLetters = !isReview && !!row?.isSimilarLetters
  const isContrastPairs = !isReview && CATEGORIES_BY_ID[categoryId ?? '']?.learnStyle === 'contrast-pairs'
  const showRecommendedPath = !isReview && !isSummary && !isSimilarLetters
  const checkpoint = showRecommendedPath ? PRACTICE_CHECKPOINTS.find((item) => item.afterRowId === rowId) : undefined

  const isLearnTracingTargetRoute = !isReview && categoryId === LEARN_TRACING_GUIDE.target.categoryId && rowId === LEARN_TRACING_GUIDE.target.rowId
  const isPracticeTargetRoute = !isReview && categoryId === PRACTICE_GUIDE.target.categoryId && rowId === PRACTICE_GUIDE.target.rowId
  const isSokuonTargetRoute = !isReview && categoryId === SOKUON_GUIDE.target.categoryId && rowId === SOKUON_GUIDE.target.rowId
  const isChouonTargetRoute = !isReview && categoryId === CHOUON_GUIDE.target.categoryId && rowId === CHOUON_GUIDE.target.rowId
  const isYouonTargetRoute = !isReview && categoryId === YOUON_GUIDE.target.categoryId && rowId === YOUON_GUIDE.target.rowId
  const isSpecialKatakanaTargetRoute = !isReview && categoryId === SPECIAL_KATAKANA_GUIDE.target.categoryId && rowId === SPECIAL_KATAKANA_GUIDE.target.rowId
  const isParticleTargetRoute = !isReview && PARTICLE_GUIDE.autoTargets.some((target) => target.categoryId === categoryId && target.rowId === rowId)
  const isKnownReplayHere =
    activeGuideReplayId !== null &&
    ((isLearnTracingTargetRoute && activeGuideReplayId === 'learnTracing') ||
      (isPracticeTargetRoute && activeGuideReplayId === 'practice') ||
      (isSokuonTargetRoute && activeGuideReplayId === 'sokuon') ||
      (isChouonTargetRoute && activeGuideReplayId === 'chouon') ||
      (isYouonTargetRoute && activeGuideReplayId === 'youon') ||
      (isSpecialKatakanaTargetRoute && activeGuideReplayId === 'specialKatakana') ||
      (isParticleTargetRoute && activeGuideReplayId === 'particle'))

  const showLearnTracingGuide = isLearnTracingTargetRoute && (isLearnTracingReplay || (!isKnownReplayHere && !hasCompletedLearnTracingGuide))
  const tracingCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.tracing === true
  const kanaQuizCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.kanaQuiz === true
  const listeningCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.listening === true
  const wordBuilderCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.wordBuilder === true
  const checkpointCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.checkpoint === true
  const introCompleted = showRecommendedPath && (isRowTaught(rowId) || tracingCompleted)
  const showPracticeGuide = isPracticeTargetRoute && (isPracticeReplay || (!isKnownReplayHere && !hasCompletedPracticeGuide && hasCompletedLearnTracingGuide && introCompleted))
  const showSokuonGuide = isSokuonTargetRoute && (isSokuonReplay || (!isKnownReplayHere && !hasCompletedSokuonGuide && hasCompletedIntroGuide))
  const showChouonGuide = isChouonTargetRoute && (isChouonReplay || (!isKnownReplayHere && !hasCompletedChouonGuide && hasCompletedIntroGuide))
  const showYouonGuide = isYouonTargetRoute && (isYouonReplay || (!isKnownReplayHere && !hasCompletedYouonGuide && hasCompletedIntroGuide))
  const showSpecialKatakanaGuide = isSpecialKatakanaTargetRoute && (isSpecialKatakanaReplay || (!isKnownReplayHere && !hasCompletedSpecialKatakanaGuide && hasCompletedIntroGuide))
  const showParticleGuide = isParticleTargetRoute && (isParticleReplay || (!isKnownReplayHere && !hasCompletedParticleGuide && hasCompletedIntroGuide))
  const showReviewGuide = isReview && isReviewReplay
  const disableHubActivities = showPracticeGuide || showSokuonGuide || showChouonGuide || showYouonGuide || showSpecialKatakanaGuide || showParticleGuide

  const recommended = showRecommendedPath
    ? getRecommendedActivity({
        learnStyle: isContrastPairs ? 'contrast-pairs' : 'character-set',
        introCompleted,
        kanaQuizCompleted,
        listeningCompleted,
        wordBuilderCompleted,
        checkpointMode: checkpoint?.mode,
        checkpointCompleted,
      })
    : 'learn'

  const handleLearnTracingActivate = (path: string) => {
    if (isLearnTracingReplay) dismissLearnTracingReplay()
    else setHasCompletedLearnTracingGuide(true)
    navigate(path)
  }
  const handlePracticeGuideActivate = (path: string) => {
    if (isPracticeReplay) dismissPracticeReplay()
    else setHasCompletedPracticeGuide(true)
    navigate(path)
  }

  const nextRowId = showRecommendedPath ? getNextRowId(rowId) : null
  const nextRowCategoryId = nextRowId ? ROWS_BY_ID[nextRowId]?.categoryId : undefined

  const learnActivities: Activity[] = isReview
    ? [
        { path: `${hubBase}/learn-chars`, label: 'Weak Kana', emoji: '🔤', description: 'Practice kana you missed' },
        { path: `${hubBase}/learn-words`, label: 'Weak Words', emoji: '📚', description: 'Practice words you missed' },
      ]
    : [
        {
          path: `/learn/${categoryId}/${rowId}`,
          label: 'Learn',
          emoji: '📖',
          description: 'Meet the new characters',
          completed: isRowTaught(rowId),
          highlighted: showLearnTracingGuide,
          disabled: showLearnTracingGuide,
        },
        ...(isSummary
          ? []
          : [{ path: `${hubBase}/tracing`, label: 'Tracing', emoji: '✍️', description: 'Watch the stroke order, then trace', completed: tracingCompleted, highlighted: showLearnTracingGuide, disabled: showLearnTracingGuide }]),
      ]

  const gameCompletion: Record<string, boolean | undefined> = {
    'kana-quiz': kanaQuizCompleted,
    listening: listeningCompleted,
    'word-builder': wordBuilderCompleted,
  }

  const isGlobalTarget = showRecommendedPath && globalRecommendedTarget?.categoryId === categoryId && globalRecommendedTarget?.rowId === rowId
  const isAssessmentTarget = isGlobalTarget && globalRecommendedTarget?.activity === 'assessment' && !!globalRecommendedTarget.assessmentScript
  const globalRecommendedActivityPath =
    isGlobalTarget &&
    globalRecommendedTarget &&
    ['kana-quiz', 'listening', 'word-builder'].includes(globalRecommendedTarget.activity)
      ? `${hubBase}/${globalRecommendedTarget.activity}`
      : undefined

  const practiceActivities: Activity[] = PRACTICE_GAMES.filter((game) => !(isContrastPairs && game.path === 'kana-quiz')).map((game) => {
    const path = `${hubBase}/${game.path}`
    const isRecommended = globalRecommendedActivityPath === path
    return {
      path,
      label: game.label,
      emoji: game.emoji,
      description: game.description,
      completed: gameCompletion[game.path],
      recommended: isRecommended,
      highlighted: isRecommended && showPracticeGuide,
    }
  })
  const optionalActivities: Activity[] = [{ path: `${hubBase}/${KANA_TYPING_GAME.path}`, label: KANA_TYPING_GAME.label, emoji: KANA_TYPING_GAME.emoji, description: KANA_TYPING_GAME.description }]

  return (
    <div className="flex flex-col items-center gap-6">
      {!isReview && <HubBreadcrumb rowId={rowId} categoryId={categoryId!} />}
      <h1 className="text-2xl font-bold">{isReview ? 'Review' : `${isSummary ? '📋 ' : isSimilarLetters ? '🔍 ' : ''}${row!.label}`}</h1>
      {isReview && (
        <p className="text-base text-neutral-500 dark:text-neutral-400">Practice saved kana and words ({reviewCount} item{reviewCount === 1 ? '' : 's'})</p>
      )}

      {showReviewGuide && <ReviewGuide onDismiss={dismissReviewReplay} />}

      {showRecommendedPath && checkpoint && recommended === checkpoint.mode && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-yellow-400 bg-amber-50 p-4 text-center ring-2 ring-yellow-400 ring-offset-2 dark:bg-amber-950/40 dark:ring-yellow-300">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">⭐ Recommended · Real-life Practice</p>
          <Link to={checkpoint.routePath} className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700">
            {checkpoint.mode === 'cafe' ? '☕ Cafe Practice' : '🍽️ Restaurant Practice'}
          </Link>
        </div>
      )}

      {showRecommendedPath && isAssessmentTarget && globalRecommendedTarget?.assessmentScript && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-yellow-400 bg-amber-50 p-4 text-center ring-2 ring-yellow-400 ring-offset-2 dark:bg-amber-950/40 dark:ring-yellow-300">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">⭐ Recommended · Section Test</p>
          <Link
            to={`/assessment/${globalRecommendedTarget.assessmentScript}`}
            className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
          >
            📝 {globalRecommendedTarget.assessmentScript === 'hiragana' ? 'Hiragana Test' : 'Katakana Test'}
          </Link>
        </div>
      )}

      {showRecommendedPath && recommended === 'done' && !isAssessmentTarget && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">Lesson complete</p>
          {nextRowId && nextRowCategoryId && (
            <Link to={`/practice/${nextRowCategoryId}/${nextRowId}`} className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700">Next Row</Link>
          )}
        </div>
      )}

      {showPracticeGuide && <PracticeGuide onDismiss={isPracticeReplay ? dismissPracticeReplay : undefined} />}

      {showSokuonGuide && (
        <ConceptGuide
          testId="sokuon-guide"
          imageAsset={SOKUON_GUIDE.slideAsset}
          imageAlt="Tamamizu explains the small tsu"
          {...SOKUON_GUIDE_CONTENT[DEFAULT_SOKUON_GUIDE_LOCALE]}
          onDismiss={isSokuonReplay ? dismissSokuonReplay : () => setHasCompletedSokuonGuide(true)}
        />
      )}
      {showChouonGuide && <ChouonGuide onDismiss={isChouonReplay ? dismissChouonReplay : () => setHasCompletedChouonGuide(true)} />}
      {showYouonGuide && <YouonGuide onDismiss={isYouonReplay ? dismissYouonReplay : () => setHasCompletedYouonGuide(true)} />}
      {showSpecialKatakanaGuide && <SpecialKatakanaGuide onDismiss={isSpecialKatakanaReplay ? dismissSpecialKatakanaReplay : () => setHasCompletedSpecialKatakanaGuide(true)} />}
      {showParticleGuide && <ParticleGuide onDismiss={isParticleReplay ? dismissParticleReplay : () => setHasCompletedParticleGuide(true)} />}

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">{showRecommendedPath && !introCompleted ? 'Choose how to learn' : 'Learn'}</h2>
        <ActivityGrid activities={learnActivities} disabled={disableHubActivities} onActivate={showLearnTracingGuide ? handleLearnTracingActivate : undefined} />
      </div>

      {showLearnTracingGuide && <LearnTracingGuide onDismiss={isLearnTracingReplay ? dismissLearnTracingReplay : undefined} />}

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">Practice</h2>
        <ActivityGrid activities={practiceActivities} disabled={disableHubActivities} onActivate={showPracticeGuide ? handlePracticeGuideActivate : undefined} />
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">Optional</h2>
        <ActivityGrid activities={optionalActivities} disabled={disableHubActivities} />
      </div>
    </div>
  )
}
