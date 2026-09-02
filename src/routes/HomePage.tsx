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

// "Continue" (Issue #23/#27) is deliberately separate from "⭐ Recommended":
// Continue = go back to the ROW you were last studying (its Practice Hub —
// see lib/lastStudied.ts's resumeRowHref — not the exact activity page),
// Recommended = the next specific step to do. Styled quietly on purpose —
// no sparkles/red/⭐ — so it's never confused with Recommended's decoration;
// only "Continue" itself is colored, as the one clickable cue.
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
      <span className="font-semibold">{section?.english ?? row.categoryId}</span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{row.label}</span>
      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">Continue</span>
    </Link>
  )
}

// Independent entry point into the learner's manually-Saved Characters/Words
// (see savedItemsStore.ts) — deliberately styled like ContinueCard (quiet,
// neutral border, no sparkles) rather than Recommended's ⭐ styling: Saved
// isn't a curriculum category, isn't "next up," and isn't a resume target,
// so it must not visually read as any of those three existing concepts.
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

// Top-level chooser — four script groups, each its own page
// (CategoryRowsPage), rather than one long page stacking every category's
// rows together. "その他" bundles every category that isn't hiragana/
// katakana/拗音 (see App.tsx's OTHER_CATEGORY_IDS) so it doesn't need a new
// card here each time a small category is added later; 拗音 gets its own
// card since it has enough rows to deserve one.
export function HomePage() {
  const { recommendedCategoryId, globalRecommendedTarget } = useCurriculum()
  const recommendedRow = globalRecommendedTarget ? ROWS_BY_ID[globalRecommendedTarget.rowId] : undefined
  // The Hiragana/Katakana Test (Issue #189) is a script-wide endpoint step,
  // not a real row — ROWS_BY_ID has no entry for its sentinel rowId (see
  // recommendedPath.ts's ASSESSMENT_STEPS), so it has no row label to show
  // alongside the activity name, only the activity name itself.
  const recommendedActivityOnly =
    globalRecommendedTarget?.activity === 'hiragana-test' || globalRecommendedTarget?.activity === 'katakana-test'

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold">Kana Game</h1>
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
                  {globalRecommendedTarget && recommendedActivityOnly && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {RECOMMENDED_ACTIVITY_LABELS[globalRecommendedTarget.activity]}
                    </span>
                  )}
                  {recommendedRow && globalRecommendedTarget && !recommendedActivityOnly && (
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
      <ContinueCard />
      <SavedCard />
    </div>
  )
}
