import { Link } from 'react-router-dom'
import { CategoryIcon } from '../components/CategoryIcon'
import { RecommendedFrame, RecommendedLabel } from '../components/Recommended'
import { SCRIPT_ENTRY_POINTS } from '../data/scriptEntryPoints'
import { useCurriculum } from '../hooks/useCurriculum'

// Top-level chooser — four script groups, each its own page
// (CategoryRowsPage), rather than one long page stacking every category's
// rows together. "その他" bundles every category that isn't hiragana/
// katakana/拗音 (see App.tsx's OTHER_CATEGORY_IDS) so it doesn't need a new
// card here each time a small category is added later; 拗音 gets its own
// card since it has enough rows to deserve one.
export function HomePage() {
  const { recommendedCategoryId } = useCurriculum()

  return (
    <div className="flex flex-col items-center gap-6">
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
              {isRecommended && <RecommendedLabel />}
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
