import { useNavigate } from 'react-router-dom'
import { KanaIntroExcerptGuide } from '../components/KanaIntroExcerptGuide'
import { AskTamamizuButton } from '../components/AskTamamizuButton'
import { CATEGORIES_BY_ID, CHOUON_CATEGORY_ID, SOKUON_CATEGORY_ID, YOUON_CATEGORY_ID } from '../data/curriculum'
import { CHOUON_GUIDE } from '../data/chouonGuide'
import { SOKUON_GUIDE } from '../data/sokuonGuide'
import { YOUON_GUIDE } from '../data/youonGuide'
import {
  ASK_TAMAMIZU_CHOUON,
  ASK_TAMAMIZU_HIRAGANA,
  ASK_TAMAMIZU_KATAKANA,
  ASK_TAMAMIZU_SOKUON,
  ASK_TAMAMIZU_YOUON,
} from '../data/askTamamizu'
import { RowMap } from '../components/RowMap'
import { useCurriculum } from '../hooks/useCurriculum'
import { buildGuideReplayHref, useGuideReplay } from '../hooks/useGuideReplay'
import { useProgressStore } from '../store/progressStore'

const SOKUON_TARGET_PATH = `/practice/${SOKUON_GUIDE.target.categoryId}/${SOKUON_GUIDE.target.rowId}`
const CHOUON_TARGET_PATH = `/practice/${CHOUON_GUIDE.target.categoryId}/${CHOUON_GUIDE.target.rowId}`
const YOUON_TARGET_PATH = `/practice/${YOUON_GUIDE.target.categoryId}/${YOUON_GUIDE.target.rowId}`

type Props = {
  title: string
  description: string
  // Which categories' rows to show on this page — a plain array rather
  // than a single categoryId since "その他" bundles several categories
  // (sokuon/chōon) into one page. See App.tsx for how each page
  // (hiragana/katakana/youon/other) instantiates this with a different list.
  categoryIds: string[]
  // Only set for the dedicated /hiragana and /katakana pages (see App.tsx)
  // — shows the always-available "Ask Tamamizu" image button that replays
  // the two-step "kana represent sounds" / "Hiragana vs Katakana usage"
  // Introduction excerpt (Issue #46). Not a new standalone Guide, so it's
  // opt-in per page rather than inferred from `categoryIds`. The variant
  // only picks which Ask Tamamizu artwork to show (Hiragana vs Katakana) —
  // both replay the exact same shared KanaIntroExcerptGuide.
  askTamamizuKanaIntroVariant?: 'hiragana' | 'katakana'
}

// One row-map page per top-level script group (see App.tsx's four routes)
// — replaces the single HomePage that used to show every category's rows
// stacked in one page. HomePage itself is now just a chooser linking here.
export function CategoryRowsPage({ title, description, categoryIds, askTamamizuKanaIntroVariant }: Props) {
  const { rows, isRowUnlocked, isRowTaught, globalRecommendedTarget } = useCurriculum()
  const navigate = useNavigate()
  const kanaIntroExcerptGuide = useGuideReplay('kanaIntro')
  const isRowMastered = useProgressStore((s) => s.isRowMastered)
  const isRowRecommended = (rowId: string) => globalRecommendedTarget?.rowId === rowId
  // Subscribed so mastery badges refresh even when only `characters`
  // changes (e.g. practicing an already-taught row) without touching
  // unlockedRowIds/taughtRowIds, which isRowMastered doesn't itself track.
  useProgressStore((s) => s.characters)

  const categoryRows = rows.filter((r) => categoryIds.includes(r.categoryId) && !r.isSummary && !r.isSimilarLetters)
  // Similar Letters (🔍, see GojuonRow.isSimilarLetters) renders immediately
  // to the LEFT of Summary, in that same trailing un-headed section — only
  // hiragana/katakana ever have one, so simple concatenation (rather than
  // per-category interleaving) already produces the right grid order even
  // on a multi-category page like っ＆ー (which has neither).
  const similarLettersRows = rows.filter((r) => categoryIds.includes(r.categoryId) && r.isSimilarLetters)
  // Summary rows (⭐, one per page — see GojuonRow.isSummary) render in
  // their own un-headed section below every category's rows, rather than
  // inside one category's group, since a multi-category page's summary
  // (その他's, combining 促音+長音) doesn't belong to just one of them.
  const summaryRows = rows.filter((r) => categoryIds.includes(r.categoryId) && r.isSummary)
  const trailingRows = [...similarLettersRows, ...summaryRows]

  // Grouped by category (in categoryIds' given order) rather than one flat
  // grid, so a multi-category page like その他 (sokuon + chōon) can show
  // each category's own heading + English `explanation` above just its own
  // rows — a single-category page's own H1 already names it, so the
  // per-category heading only renders when there's more than one group to
  // tell apart.
  const groups = categoryIds
    .map((categoryId) => ({
      category: CATEGORIES_BY_ID[categoryId],
      rows: categoryRows.filter((r) => r.categoryId === categoryId),
    }))
    .filter((g) => g.rows.length > 0)

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="max-w-md text-center text-base text-neutral-500 sm:text-lg dark:text-neutral-400">{description}</p>
      {askTamamizuKanaIntroVariant && (
        <AskTamamizuButton
          imageSrc={`${import.meta.env.BASE_URL}${
            askTamamizuKanaIntroVariant === 'hiragana' ? ASK_TAMAMIZU_HIRAGANA.imageAsset : ASK_TAMAMIZU_KATAKANA.imageAsset
          }`}
          ariaLabel={askTamamizuKanaIntroVariant === 'hiragana' ? ASK_TAMAMIZU_HIRAGANA.ariaLabel : ASK_TAMAMIZU_KATAKANA.ariaLabel}
          onClick={kanaIntroExcerptGuide.startReplay}
          testId={`ask-tamamizu-${askTamamizuKanaIntroVariant}`}
        />
      )}
      {groups.length > 0 ? (
        groups.map(({ category, rows: groupRows }) => {
          // Sokuon's, Chōon's, and Yōon's category `explanation` used to
          // render unconditionally here; each is replaced by an
          // always-available "Ask Tamamizu" image button that opens the
          // matching concept Guide on its real screen instead of duplicating
          // its copy on this page. The underlying `explanation` data itself
          // is left untouched in curriculum.ts — only what's rendered here
          // changed.
          const isSokuonGroup = category?.id === SOKUON_CATEGORY_ID
          const isChouonGroup = category?.id === CHOUON_CATEGORY_ID
          const isYouonGroup = category?.id === YOUON_CATEGORY_ID
          return (
            <div key={category?.id} className="flex w-full flex-col items-center gap-4">
              {/* displayLabel (○+っ, ○+ー, ...) instead of the real kanji
                  `label` (促音, 長音, ...) — the target audience may not read
                  ANY kana yet, let alone kanji, see ScriptCategory.displayLabel's
                  comment. No .font-kana here either way, since displayLabel's
                  '+'/'○' aren't in the hand-subsetted kana-only webfont. */}
              {groups.length > 1 && <h2 className="text-xl font-semibold">{category?.displayLabel ?? category?.label}</h2>}
              {isSokuonGroup ? (
                <AskTamamizuButton
                  imageSrc={`${import.meta.env.BASE_URL}${ASK_TAMAMIZU_SOKUON.imageAsset}`}
                  ariaLabel={ASK_TAMAMIZU_SOKUON.ariaLabel}
                  onClick={() => navigate(buildGuideReplayHref(SOKUON_TARGET_PATH, 'sokuon'))}
                  testId="ask-tamamizu-sokuon"
                />
              ) : isChouonGroup ? (
                <AskTamamizuButton
                  imageSrc={`${import.meta.env.BASE_URL}${ASK_TAMAMIZU_CHOUON.imageAsset}`}
                  ariaLabel={ASK_TAMAMIZU_CHOUON.ariaLabel}
                  onClick={() => navigate(buildGuideReplayHref(CHOUON_TARGET_PATH, 'chouon'))}
                  testId="ask-tamamizu-chouon"
                />
              ) : isYouonGroup ? (
                <AskTamamizuButton
                  imageSrc={`${import.meta.env.BASE_URL}${ASK_TAMAMIZU_YOUON.imageAsset}`}
                  ariaLabel={ASK_TAMAMIZU_YOUON.ariaLabel}
                  onClick={() => navigate(buildGuideReplayHref(YOUON_TARGET_PATH, 'youon'))}
                  testId="ask-tamamizu-youon"
                />
              ) : (
                category?.explanation && (
                  <p className="max-w-xl text-center text-sm text-neutral-500 dark:text-neutral-400">{category.explanation}</p>
                )
              )}
              <RowMap
                rows={groupRows}
                isUnlocked={isRowUnlocked}
                isTaught={isRowTaught}
                isMastered={isRowMastered}
                isRecommended={isRowRecommended}
              />
            </div>
          )
        })
      ) : (
        <p className="text-neutral-400 dark:text-neutral-500">まだ利用できるレッスンがありません。</p>
      )}
      {trailingRows.length > 0 && (
        <RowMap rows={trailingRows} isUnlocked={isRowUnlocked} isTaught={isRowTaught} isMastered={isRowMastered} />
      )}
      {kanaIntroExcerptGuide.isReplaying && <KanaIntroExcerptGuide onDismiss={kanaIntroExcerptGuide.dismissReplay} />}
    </div>
  )
}
