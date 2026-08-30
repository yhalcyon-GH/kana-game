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

// Ordered to match the Recommended Path sequence (Kana Quiz -> Listening ->
// Word Builder), so the Practice section's card order mirrors what
// Recommended will step through. Kana Typing is deliberately kept separate
// (see KANA_TYPING_GAME below) — it never gates or advances the Recommended
// Path, so it lives in its own "Optional" section instead of mixed in here.
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
  // A small "✓" only — see progressStore.ts's RowActivityCompletion: this
  // activity's normal session has been completed once for this row. NOT
  // mastery (see RowMap's separate, unrelated "👍" badge) and
  // deliberately not styled to look like it.
  completed?: boolean
  highlighted?: boolean
  disabled?: boolean
  // Marks this card as the single app-wide Global Recommended Target
  // (Issue #25) — see PracticeHubPage's isGlobalTarget/recommended below.
  // Display-only: no card duplication/separate section, just a ⭐ badge on
  // whichever normal grid card it is.
  recommended?: boolean
}

function ActivityGrid({
  activities,
  disabled = false,
  onActivate,
}: {
  activities: Activity[]
  disabled?: boolean
  // When provided, a card that's disabled purely because an in-context
  // Guide (Learn/Tracing Guide, Practice Guide) is currently showing stays
  // clickable — invoking this instead of normal <Link> navigation, so the
  // caller can stop the guide's narration/dismiss it first. Full-screen
  // Guides (Sokuon/Chōon/Yōon) never pass this — their click-blocking is
  // unchanged.
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
              <span className="ml-1" aria-label="Recommended">
                ⭐
              </span>
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

  // Manual Guide replay (Issue #46) — a `?guide=<id>` ephemeral target that
  // forces exactly one Guide to display on its real screen, regardless of
  // any completed flag or other precondition, without ever writing that
  // flag. Each hook instance only matches its own id, so at most one of
  // these is ever true at once.
  const { isReplaying: isLearnTracingReplay, dismissReplay: dismissLearnTracingReplay } = useGuideReplay('learnTracing')
  const { isReplaying: isPracticeReplay, dismissReplay: dismissPracticeReplay } = useGuideReplay('practice')
  const { isReplaying: isSokuonReplay, dismissReplay: dismissSokuonReplay } = useGuideReplay('sokuon')
  const { isReplaying: isChouonReplay, dismissReplay: dismissChouonReplay } = useGuideReplay('chouon')
  const { isReplaying: isYouonReplay, dismissReplay: dismissYouonReplay } = useGuideReplay('youon')
  const { isReplaying: isSpecialKatakanaReplay, dismissReplay: dismissSpecialKatakanaReplay } =
    useGuideReplay('specialKatakana')
  const { isReplaying: isParticleReplay, dismissReplay: dismissParticleReplay } = useGuideReplay('particle')
  const { isReplaying: isReviewReplay, dismissReplay: dismissReviewReplay } = useGuideReplay('review')
  const activeGuideReplayId = useActiveGuideReplayId()

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
        <p className="text-neutral-500 dark:text-neutral-400">Finish one Learn lesson first.</p>
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
  // would otherwise link to empty sessions. A manual Review Guide replay
  // (Issue #46) still needs the real Review screen even with zero items
  // due, so it deliberately skips this empty-state short-circuit.
  if (isReview && reviewCount === 0 && !isReviewReplay) {
    return <ReviewEmptyState />
  }

  const hubBase = isReview ? '/practice/review' : `/practice/${categoryId}/${rowId}`

  // Tracing walks through "every word in this row" as its second phase (see
  // TracingPage) — that only makes sense for a single row's small word
  // list, not Review's every-taught-row mix, so it's excluded there.
  const isSummary = !isReview && !!row?.isSummary
  // Similar Letters (see GojuonRow.isSimilarLetters) — an optional
  // supplementary lesson, not part of the main curriculum progression.
  const isSimilarLetters = !isReview && !!row?.isSimilarLetters
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
  const showRecommendedPath = !isReview && !isSummary && !isSimilarLetters
  const isLearnTracingTargetRoute =
    !isReview && categoryId === LEARN_TRACING_GUIDE.target.categoryId && rowId === LEARN_TRACING_GUIDE.target.rowId
  const isPracticeTargetRoute =
    !isReview && categoryId === PRACTICE_GUIDE.target.categoryId && rowId === PRACTICE_GUIDE.target.rowId
  const isSokuonTargetRoute =
    !isReview && categoryId === SOKUON_GUIDE.target.categoryId && rowId === SOKUON_GUIDE.target.rowId
  const isChouonTargetRoute =
    !isReview && categoryId === CHOUON_GUIDE.target.categoryId && rowId === CHOUON_GUIDE.target.rowId
  const isYouonTargetRoute =
    !isReview && categoryId === YOUON_GUIDE.target.categoryId && rowId === YOUON_GUIDE.target.rowId
  // Special Katakana's Guide auto-triggers only on its own first session's
  // row (special-katakana-fa-row) — NOT from merely visiting the shared
  // /youon page, unlike Sokuon/Chōon/Yōon's page-level auto-Guides (see
  // CategoryRowsPage). This is the ONLY place it can show automatically.
  const isSpecialKatakanaTargetRoute =
    !isReview &&
    categoryId === SPECIAL_KATAKANA_GUIDE.target.categoryId &&
    rowId === SPECIAL_KATAKANA_GUIDE.target.rowId
  // A `?guide=` value only counts as "active here" when it names one of
  // THIS route's own Guides (e.g. hiragana/a-row hosts both Learn/Tracing
  // and Practice) — that's what lets a manual replay suppress this route's
  // other automatic Guide instead of showing both at once, while an
  // unrelated or invalid id leaves every automatic condition exactly as it
  // would be with no `?guide=` at all (Issue #46's "invalid replay ids fail
  // safely and show the normal page" / "never shows two Guides
  // simultaneously").
  // Particles' one auto-trigger row — hiragana wa-row, where わ/を and the
  // topic-marker は (plus the こんにちは/こんばんは greetings that are this
  // Guide's Step 3) are introduced. Same shape as the concept Guides above.
  // The /hiragana page's supplementary "Ask Tamamizu about particles" button
  // is unaffected: it still starts a manual `?guide=particle` replay there at
  // any time, before or after this automatic first showing, without writing
  // progress on replay.
  const isParticleTargetRoute =
    !isReview &&
    PARTICLE_GUIDE.autoTargets.some((target) => target.categoryId === categoryId && target.rowId === rowId)
  const isKnownReplayHere =
    activeGuideReplayId !== null &&
    ((isLearnTracingTargetRoute && activeGuideReplayId === 'learnTracing') ||
      (isPracticeTargetRoute && activeGuideReplayId === 'practice') ||
      (isSokuonTargetRoute && activeGuideReplayId === 'sokuon') ||
      (isChouonTargetRoute && activeGuideReplayId === 'chouon') ||
      (isYouonTargetRoute && activeGuideReplayId === 'youon') ||
      (isSpecialKatakanaTargetRoute && activeGuideReplayId === 'specialKatakana') ||
      (isParticleTargetRoute && activeGuideReplayId === 'particle'))
  const showLearnTracingGuide =
    isLearnTracingTargetRoute && (isLearnTracingReplay || (!isKnownReplayHere && !hasCompletedLearnTracingGuide))
  const tracingCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.tracing === true
  const kanaQuizCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.kanaQuiz === true
  const listeningCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.listening === true
  const wordBuilderCompleted = showRecommendedPath && rowActivityCompletion[rowId]?.wordBuilder === true
  // "Character introduction" is done once EITHER Learn or Tracing has been
  // finished once — neither is required over the other, and finishing one
  // never locks out the other (both stay freely accessible below either way).
  const introCompleted = showRecommendedPath && (isRowTaught(rowId) || tracingCompleted)
  const showPracticeGuide =
    isPracticeTargetRoute &&
    (isPracticeReplay ||
      (!isKnownReplayHere && !hasCompletedPracticeGuide && hasCompletedLearnTracingGuide && introCompleted))
  const showSokuonGuide =
    isSokuonTargetRoute && (isSokuonReplay || (!isKnownReplayHere && !hasCompletedSokuonGuide && hasCompletedIntroGuide))
  const showChouonGuide =
    isChouonTargetRoute && (isChouonReplay || (!isKnownReplayHere && !hasCompletedChouonGuide && hasCompletedIntroGuide))
  const showYouonGuide =
    isYouonTargetRoute && (isYouonReplay || (!isKnownReplayHere && !hasCompletedYouonGuide && hasCompletedIntroGuide))
  const showSpecialKatakanaGuide =
    isSpecialKatakanaTargetRoute &&
    (isSpecialKatakanaReplay || (!isKnownReplayHere && !hasCompletedSpecialKatakanaGuide && hasCompletedIntroGuide))
  const showParticleGuide =
    isParticleTargetRoute &&
    (isParticleReplay || (!isKnownReplayHere && !hasCompletedParticleGuide && hasCompletedIntroGuide))
  const showReviewGuide = isReview && isReviewReplay
  const disableHubActivities =
    showPracticeGuide ||
    showSokuonGuide ||
    showChouonGuide ||
    showYouonGuide ||
    showSpecialKatakanaGuide ||
    showParticleGuide
  const recommended = showRecommendedPath
    ? getRecommendedActivity({
        learnStyle: isContrastPairs ? 'contrast-pairs' : 'character-set',
        introCompleted,
        kanaQuizCompleted,
        listeningCompleted,
        wordBuilderCompleted,
      })
    : 'learn'

  // Item 6: clicking Learn/Tracing while the automatic (or manually
  // replayed) Learn/Tracing Guide is showing stops its narration, ends the
  // guide — marking it completed for the automatic case, or just clearing
  // the ephemeral replay target without touching the persisted flag for a
  // manual Settings replay — then navigates to the activity that was
  // clicked, rather than silently doing nothing.
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

  // Review has no "meet new characters" step (that's what Learn is for on a
  // real row) — instead its Learn section offers a browse-only look back at
  // whatever's actually being gotten wrong lately, split 単音/語彙 per the
  // user's request (see ReviewMistakesPage).
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
          : [
              {
                path: `${hubBase}/tracing`,
                label: 'Tracing',
                emoji: '✍️',
                description: 'Watch the stroke order, then trace',
                completed: tracingCompleted,
                highlighted: showLearnTracingGuide,
                disabled: showLearnTracingGuide,
              },
            ]),
      ]
  const gameCompletion: Record<string, boolean | undefined> = {
    'kana-quiz': kanaQuizCompleted,
    listening: listeningCompleted,
    'word-builder': wordBuilderCompleted,
  }

  // "⭐ Recommended" reflects the ONE app-wide Global Recommended Target
  // (Issue #25, see useCurriculum's globalRecommendedTarget) — only when
  // THIS row is currently that target, and then only its specific
  // activity gets the ⭐ badge (display-only, on the normal grid card —
  // see Item 5: no separate section/card duplication any more).
  // `recommended` above (this row's own next step) still separately drives
  // this row's OWN unrelated UI ("Choose how to learn"/✓ marks/"Lesson
  // complete"), regardless of whether this row happens to be the global
  // target right now.
  const isGlobalTarget =
    showRecommendedPath && globalRecommendedTarget?.categoryId === categoryId && globalRecommendedTarget?.rowId === rowId
  const globalRecommendedActivityPath =
    isGlobalTarget && globalRecommendedTarget && globalRecommendedTarget.activity !== 'learn'
      ? `${hubBase}/${globalRecommendedTarget.activity}`
      : undefined

  const practiceActivities: Activity[] = PRACTICE_GAMES.filter((game) => !(isContrastPairs && game.path === 'kana-quiz')).map(
    (game) => {
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
    },
  )
  const optionalActivities: Activity[] = [
    { path: `${hubBase}/${KANA_TYPING_GAME.path}`, label: KANA_TYPING_GAME.label, emoji: KANA_TYPING_GAME.emoji, description: KANA_TYPING_GAME.description },
  ]

  return (
    <div className="flex flex-col items-center gap-6">
      {!isReview && <HubBreadcrumb rowId={rowId} categoryId={categoryId!} />}
      <h1 className="text-2xl font-bold">
        {isReview ? 'Review' : `${isSummary ? '📋 ' : isSimilarLetters ? '🔍 ' : ''}${row!.label}`}
      </h1>
      {isReview && (
        <p className="text-base text-neutral-500 dark:text-neutral-400">
          Practice saved kana and words ({reviewCount} item{reviewCount === 1 ? '' : 's'})
        </p>
      )}

      {showReviewGuide && <ReviewGuide onDismiss={dismissReviewReplay} />}

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

      {showChouonGuide && (
        <ChouonGuide onDismiss={isChouonReplay ? dismissChouonReplay : () => setHasCompletedChouonGuide(true)} />
      )}

      {showYouonGuide && (
        <YouonGuide onDismiss={isYouonReplay ? dismissYouonReplay : () => setHasCompletedYouonGuide(true)} />
      )}

      {showSpecialKatakanaGuide && (
        <SpecialKatakanaGuide
          onDismiss={isSpecialKatakanaReplay ? dismissSpecialKatakanaReplay : () => setHasCompletedSpecialKatakanaGuide(true)}
        />
      )}

      {showParticleGuide && (
        <ParticleGuide onDismiss={isParticleReplay ? dismissParticleReplay : () => setHasCompletedParticleGuide(true)} />
      )}

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          {showRecommendedPath && !introCompleted ? 'Choose how to learn' : 'Learn'}
        </h2>
        <ActivityGrid
          activities={learnActivities}
          disabled={disableHubActivities}
          onActivate={showLearnTracingGuide ? handleLearnTracingActivate : undefined}
        />
      </div>

      {showLearnTracingGuide && (
        <LearnTracingGuide onDismiss={isLearnTracingReplay ? dismissLearnTracingReplay : undefined} />
      )}

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          Practice
        </h2>
        <ActivityGrid
          activities={practiceActivities}
          disabled={disableHubActivities}
          onActivate={showPracticeGuide ? handlePracticeGuideActivate : undefined}
        />
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          Optional
        </h2>
        <ActivityGrid activities={optionalActivities} disabled={disableHubActivities} />
      </div>
    </div>
  )
}
