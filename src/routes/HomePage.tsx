import { Link } from 'react-router-dom'
import { CategoryIcon } from '../components/CategoryIcon'
import { RecommendedFrame, RecommendedLabel } from '../components/Recommended'
import { ROWS_BY_ID } from '../data/curriculum'
import { SCRIPT_ENTRY_POINTS } from '../data/scriptEntryPoints'
import { useCurriculum } from '../hooks/useCurriculum'
import { resumeRowHref } from '../lib/lastStudied'
import { RECOMMENDED_ACTIVITY_LABELS } from '../lib/recommendedPath'
import { useProgressStore } from '../store/progressStore'
import { useSavedItemsStore } from '../store/savedItemsStore'

function ContinueCard() {
  const lastStudied = useProgressStore((s) => s.lastStudied)
  if (!lastStudied) return null

  const row = ROWS_BY_ID[lastStudied.rowId]
  if (!row) return null
  const section = SCRIPT_ENTRY_POINTS.find((card) => card.categoryIds.includes(lastStudied.categoryId))

  return (
    <Link
      to={resumeRowHref(lastStudied)}
      className="flex w-full max-w-md flex-col items-center gap-1 rounded-xl border border-neutral-300 bg-white p-4 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
    >
      <span className="font-semibold">{section?.english ?? section?.label ?? row.categoryId}</span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{row.label}</span>
      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">Continue</span>
    </Link>
  )
}

function SavedCard() {
  const savedCount = useSavedItemsStore((s) => s.savedCharacterIds.length + s.savedWordIds.length)
  return (
    <Link
      to="/saved"
      className="flex w-full max-w-md flex-col items-center gap-1 rounded-xl border border-neutral-300 bg-white p-4 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
    >
      <span className="font-semibold">🔖 Saved</span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        {savedCount} item{savedCount === 1 ? '' : 's'}
      </span>
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
      <ContinueCard />
      <SavedCard />
    </div>
  )
}
