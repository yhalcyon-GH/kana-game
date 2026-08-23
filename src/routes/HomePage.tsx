import { Link } from 'react-router-dom'
import { CategoryIcon } from '../components/CategoryIcon'
import { RecommendedFrame, RecommendedLabel } from '../components/Recommended'
import { ROWS_BY_ID } from '../data/curriculum'
import { SCRIPT_ENTRY_POINTS } from '../data/scriptEntryPoints'
import { useCurriculum } from '../hooks/useCurriculum'
import { RESUMABLE_ACTIVITY_LABELS, resumeHref } from '../lib/lastStudied'
import { RECOMMENDED_ACTIVITY_LABELS } from '../lib/recommendedPath'
import { useProgressStore } from '../store/progressStore'

// "Continue" (Issue #23) is deliberately separate from "⭐ Recommended":
// Continue = resume exactly where you left off (last real learning/
// practice screen visited — see hooks/useTrackLastStudied.ts), Recommended
// = what to try next. Styled quietly on purpose — no sparkles/red — so it
// doesn't compete visually with Recommended's stronger emphasis.
function ContinueCard() {
  const lastStudied = useProgressStore((s) => s.lastStudied)
  if (!lastStudied) return null

  const row = ROWS_BY_ID[lastStudied.rowId]
  if (!row) return null
  const section = SCRIPT_ENTRY_POINTS.find((card) => card.categoryIds.includes(lastStudied.categoryId))

  return (
    <Link
      to={resumeHref(lastStudied)}
      className="flex w-full max-w-md flex-col items-center gap-1 rounded-xl border border-neutral-300 bg-white p-4 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
    >
      <span className="text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">Continue</span>
      <span className="font-semibold">
        {section?.english ?? row.categoryId} · {row.label}
      </span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{RESUMABLE_ACTIVITY_LABELS[lastStudied.activity]}</span>
    </Link>
  )
}

// Top-level chooser — four script groups, each its own page
// (CategoryRowsPage), rather than one long page stacking every category's
// rows together. "その他" bundles every category that isn't hiragana/
// katakana/拗音 (see App.tsx's OTHER_CATEGORY_IDS) so it doesn't need a new
// card here each time a small category is added later; 拗音 gets its own
// card since it has enough rows to deserve one.
export function HomePage() {
  const { recommendedCategoryId, globalRecommendedTarget } = useCurriculum()
  const recommendedRow = globalRecommendedTarget ? ROWS_BY_ID[globalRecommendedTarget.rowId] : undefined

  return (
    <div className="flex flex-col items-center gap-6">
      <ContinueCard />
      <h1 className="text-3xl font-bold">Kana Game</h1>
      <p className="max-w-md text-center text-neutral-500 dark:text-neutral-400">
        Learn one row at a time, paired with real everyday words.
      </p>
      <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {SCRIPT_ENTRY_POINTS.map((card) => {
          const isRecommended = !!recommendedCategoryId && card.categoryIds.includes(recommendedCategoryId)
          const link = (
            <Link
              key={card.to}
              to={card.to}
              className="flex h-full flex-col items-center gap-2 rounded-xl border border-neutral-300 bg-white p-6 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
            >
              <CategoryIcon icon={card.icon} className="h-10 w-10 text-2xl" />
              <span className="font-kana text-2xl font-bold">{card.label}</span>
              <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">{card.english}</span>
              {isRecommended && (
                <>
                  <RecommendedLabel />
                  {recommendedRow && globalRecommendedTarget && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {recommendedRow.label} · {RECOMMENDED_ACTIVITY_LABELS[globalRecommendedTarget.activity]}
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
