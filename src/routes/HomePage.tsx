import { Link } from 'react-router-dom'
import { CategoryIcon } from '../components/CategoryIcon'
import { RecommendedFrame, RecommendedLabel } from '../components/Recommended'
import { ROWS_BY_ID } from '../data/curriculum'
import { SCRIPT_ENTRY_POINTS } from '../data/scriptEntryPoints'
import { useCurriculum } from '../hooks/useCurriculum'
import { resumeRowHref } from '../lib/lastStudied'
import { RECOMMENDED_ACTIVITY_LABELS } from '../lib/recommendedPath'
import { useProgressStore } from '../store/progressStore'

// Compact single-line resume affordance — kept ahead of the category cards
// (learning categories are the primary content on Home; Continue is a
// secondary shortcut back into progress already in motion, not a
// destination in its own right, so it stays visually smaller than a card).
// The large standalone Saved card that used to sit below the categories was
// removed (Saved is now reachable from the top nav on every screen — see
// NavBar) rather than duplicated here.
function ContinueCard() {
  const lastStudied = useProgressStore((s) => s.lastStudied)
  if (!lastStudied) return null

  const row = ROWS_BY_ID[lastStudied.rowId]
  if (!row) return null
  const section = SCRIPT_ENTRY_POINTS.find((card) => card.categoryIds.includes(lastStudied.categoryId))

  return (
    <Link
      to={resumeRowHref(lastStudied)}
      className="flex w-full max-w-md items-center justify-between gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
    >
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate text-sm font-semibold">{section?.english ?? section?.label ?? row.categoryId}</span>
        <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{row.label}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-blue-600 dark:text-blue-400">Continue</span>
    </Link>
  )
}

export function HomePage() {
  const { recommendedCategoryId, globalRecommendedTarget } = useCurriculum()
  const graduated = useProgressStore((s) => s.graduation.graduated)
  const recommendedRow = globalRecommendedTarget ? ROWS_BY_ID[globalRecommendedTarget.rowId] : undefined
  const recommendedDetail =
    globalRecommendedTarget?.assessmentScript === 'final-graduation'
      ? 'FINAL KANA TEST'
      : recommendedRow && globalRecommendedTarget
        ? `${recommendedRow.label} · ${RECOMMENDED_ACTIVITY_LABELS[globalRecommendedTarget.activity]}`
        : null

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold">Tamamizu</h1>
      {graduated && <p className="rounded-full border border-green-300 bg-green-50 px-4 py-2 font-semibold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">✓ Kana Complete — Graduated</p>}
      <ContinueCard />
      <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {SCRIPT_ENTRY_POINTS.map((card) => {
          const isRecommended = !!recommendedCategoryId && card.categoryIds.includes(recommendedCategoryId)
          const destination =
            isRecommended && globalRecommendedTarget?.assessmentScript
              ? `/assessment/${globalRecommendedTarget.assessmentScript}`
              : card.to
          const link = (
            <Link
              key={card.to}
              to={destination}
              className="flex h-full flex-col items-center gap-2 rounded-xl border border-neutral-300 bg-white p-6 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
            >
              <CategoryIcon icon={card.icon} className="h-10 w-10 text-2xl" />
              <span className="font-kana text-2xl font-bold">{card.label}</span>
              {card.english && <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">{card.english}</span>}
              {isRecommended && (
                <>
                  <RecommendedLabel />
                  {recommendedDetail && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {recommendedDetail}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
          return isRecommended ? (
            <RecommendedFrame key={card.to} className="h-full">
              {link}
            </RecommendedFrame>
          ) : (
            link
          )
        })}
      </div>
    </div>
  )
}
