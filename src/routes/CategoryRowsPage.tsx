import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KanaIntroExcerptGuide } from '../components/KanaIntroExcerptGuide'
import { ConceptGuide } from '../components/ConceptGuide'
import { ChouonGuide } from '../components/ChouonGuide'
import { YouonGuide } from '../components/YouonGuide'
import { ParticleGuide } from '../components/ParticleGuide'
import { AskTamamizuButton } from '../components/AskTamamizuButton'
import {
  CATEGORIES_BY_ID,
  CHOUON_CATEGORY_ID,
  ROWS_BY_ID,
  SOKUON_CATEGORY_ID,
  SPECIAL_KATAKANA_CATEGORY_ID,
  YOUON_CATEGORY_ID,
} from '../data/curriculum'
import { CHOUON_GUIDE } from '../data/chouonGuide'
import { SOKUON_GUIDE } from '../data/sokuonGuide'
import { DEFAULT_SOKUON_GUIDE_LOCALE, SOKUON_GUIDE_CONTENT } from '../data/sokuonGuideContent'
import { SPECIAL_KATAKANA_GUIDE } from '../data/specialKatakanaGuide'
import { YOUON_GUIDE } from '../data/youonGuide'
import {
  ASK_TAMAMIZU_CHOUON,
  ASK_TAMAMIZU_HIRAGANA,
  ASK_TAMAMIZU_KATAKANA,
  ASK_TAMAMIZU_PARTICLE,
  ASK_TAMAMIZU_SOKUON,
  ASK_TAMAMIZU_SPECIAL_KATAKANA,
  ASK_TAMAMIZU_YOUON,
} from '../data/askTamamizu'
import { RowMap } from '../components/RowMap'
import { useCurriculum } from '../hooks/useCurriculum'
import { buildGuideReplayHref, useGuideReplay } from '../hooks/useGuideReplay'
import { isRowRecommendedPathDone } from '../lib/recommendedPath'
import { useProgressStore } from '../store/progressStore'

const SOKUON_TARGET_PATH = `/practice/${SOKUON_GUIDE.target.categoryId}/${SOKUON_GUIDE.target.rowId}`
const CHOUON_TARGET_PATH = `/practice/${CHOUON_GUIDE.target.categoryId}/${CHOUON_GUIDE.target.rowId}`
const YOUON_TARGET_PATH = `/practice/${YOUON_GUIDE.target.categoryId}/${YOUON_GUIDE.target.rowId}`
const SPECIAL_KATAKANA_TARGET_PATH = `/practice/${SPECIAL_KATAKANA_GUIDE.target.categoryId}/${SPECIAL_KATAKANA_GUIDE.target.rowId}`

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
  const particleGuide = useGuideReplay('particle')
  const isRowMastered = useProgressStore((s) => s.isRowMastered)
  const isRowRecommended = (rowId: string) => globalRecommendedTarget?.rowId === rowId
  // Subscribed so mastery badges refresh even when only `characters`
  // changes (e.g. practicing an already-taught row) without touching
  // unlockedRowIds/taughtRowIds, which isRowMastered doesn't itself track.
  useProgressStore((s) => s.characters)

  // Section auto-Guide display (mobile QA polish round) — gated behind the
  // global Introduction (Issue #10's priority rule: never auto-show a
  // section Guide while IntroGuide is still outstanding) exactly like every
  // existing PracticeHub auto-Guide condition. Each of these shares its
  // flag with any other trigger for the same Guide (e.g. PracticeHubPage's
  // own Sokuon/Chōon/Yōon auto-display), so setting the flag true from
  // either place naturally prevents the other from also firing — no
  // separate coordination needed.
  const hasCompletedIntroGuide = useProgressStore((s) => s.hasCompletedIntroGuide)
  const hasCompletedSokuonGuide = useProgressStore((s) => s.hasCompletedSokuonGuide)
  const setHasCompletedSokuonGuide = useProgressStore((s) => s.setHasCompletedSokuonGuide)
  const hasCompletedChouonGuide = useProgressStore((s) => s.hasCompletedChouonGuide)
  const setHasCompletedChouonGuide = useProgressStore((s) => s.setHasCompletedChouonGuide)
  const hasCompletedYouonGuide = useProgressStore((s) => s.hasCompletedYouonGuide)
  const setHasCompletedYouonGuide = useProgressStore((s) => s.setHasCompletedYouonGuide)
  const hasCompletedHiraganaSectionGuide = useProgressStore((s) => s.hasCompletedHiraganaSectionGuide)
  const setHasCompletedHiraganaSectionGuide = useProgressStore((s) => s.setHasCompletedHiraganaSectionGuide)
  const hasCompletedKatakanaSectionGuide = useProgressStore((s) => s.hasCompletedKatakanaSectionGuide)
  const setHasCompletedKatakanaSectionGuide = useProgressStore((s) => s.setHasCompletedKatakanaSectionGuide)
  const hasCompletedParticleGuide = useProgressStore((s) => s.hasCompletedParticleGuide)
  const setHasCompletedParticleGuide = useProgressStore((s) => s.setHasCompletedParticleGuide)
  const taughtRowIds = useProgressStore((s) => s.taughtRowIds)
  const rowActivityCompletion = useProgressStore((s) => s.rowActivityCompletion)

  const kanaIntroSectionCompletedFlag =
    askTamamizuKanaIntroVariant === 'hiragana'
      ? hasCompletedHiraganaSectionGuide
      : askTamamizuKanaIntroVariant === 'katakana'
        ? hasCompletedKatakanaSectionGuide
        : true
  const setKanaIntroSectionCompletedFlag =
    askTamamizuKanaIntroVariant === 'hiragana' ? setHasCompletedHiraganaSectionGuide : setHasCompletedKatakanaSectionGuide
  // Once dismissed (auto OR by starting a manual replay mid-page-visit),
  // don't pop the automatic Guide right back up for the rest of this page
  // instance even though the persisted flag stays false for a manual
  // replay — manual replay must never mutate that flag (Ask Tamamizu stays
  // replayable indefinitely), but re-showing automatically the instant a
  // manual replay ends would defeat the point of "manual replay." This is
  // purely local/ephemeral UI state, not persisted.
  const [autoKanaIntroDismissedThisVisit, setAutoKanaIntroDismissedThisVisit] = useState(false)
  // First-time auto-display, independent per section (Hiragana vs Katakana
  // each have their OWN flag) — never fires while a manual replay of the
  // same excerpt is already active, and never mutates the flag itself (only
  // this automatic path does that; manual replay uses dismissReplay).
  const showAutoKanaIntroExcerptGuide =
    !!askTamamizuKanaIntroVariant &&
    hasCompletedIntroGuide &&
    !kanaIntroSectionCompletedFlag &&
    !kanaIntroExcerptGuide.isReplaying &&
    !particleGuide.isReplaying &&
    !autoKanaIntroDismissedThisVisit

  const hasSokuonCategory = categoryIds.includes(SOKUON_CATEGORY_ID)
  const hasChouonCategory = categoryIds.includes(CHOUON_CATEGORY_ID)
  const hasYouonCategory = categoryIds.includes(YOUON_CATEGORY_ID)
  const sokuonRow = ROWS_BY_ID[SOKUON_GUIDE.target.rowId]
  const sokuonCategory = CATEGORIES_BY_ID[SOKUON_CATEGORY_ID]
  const sokuonRowDone =
    !!sokuonRow && !!sokuonCategory && isRowRecommendedPathDone(sokuonRow, sokuonCategory, taughtRowIds, rowActivityCompletion)
  const showAutoSokuonGuide = hasSokuonCategory && hasCompletedIntroGuide && !hasCompletedSokuonGuide
  // Chōon's auto-display timing (per the spec) is gated on Sokuon practice
  // being done, using the SAME Recommended Path completion rule
  // (isRowRecommendedPathDone / getRecommendedActivity) rather than a
  // parallel check — and only fires once the Sokuon Guide isn't also about
  // to show, so the two never appear together on the same /other visit.
  const showAutoChouonGuide =
    hasChouonCategory && hasCompletedIntroGuide && !hasCompletedChouonGuide && sokuonRowDone && !showAutoSokuonGuide
  const showAutoYouonGuide = hasYouonCategory && hasCompletedIntroGuide && !hasCompletedYouonGuide

  const categoryRows = rows.filter((r) => categoryIds.includes(r.categoryId) && !r.isSummary && !r.isSimilarLetters)
  // Similar Letters (🔍, see GojuonRow.isSimilarLetters) renders immediately
  // to the LEFT of Summary, in that same trailing un-headed section — only
  // hiragana/katakana ever have one, so simple concatenation (rather than
  // per-category interleaving) already produces the right grid order even
  // on a multi-category page like っ・ー (which has neither).
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
          onClick={() => {
            setAutoKanaIntroDismissedThisVisit(true)
            kanaIntroExcerptGuide.startReplay()
          }}
          testId={`ask-tamamizu-${askTamamizuKanaIntroVariant}`}
        />
      )}
      {groups.length > 0 ? (
        groups.map(({ category, rows: groupRows }) => {
          // Sokuon's, Chōon's, Yōon's, and Special Katakana's category
          // `explanation` used to render unconditionally here; each is
          // replaced by an always-available "Ask Tamamizu" image button that
          // opens the matching concept Guide on its real screen instead of
          // duplicating its copy on this page. The underlying `explanation`
          // data itself is left untouched in curriculum.ts — only what's
          // rendered here changed.
          const isSokuonGroup = category?.id === SOKUON_CATEGORY_ID
          const isChouonGroup = category?.id === CHOUON_CATEGORY_ID
          const isYouonGroup = category?.id === YOUON_CATEGORY_ID
          const isSpecialKatakanaGroup = category?.id === SPECIAL_KATAKANA_CATEGORY_ID
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
              ) : isSpecialKatakanaGroup ? (
                <AskTamamizuButton
                  imageSrc={`${import.meta.env.BASE_URL}${ASK_TAMAMIZU_SPECIAL_KATAKANA.imageAsset}`}
                  ariaLabel={ASK_TAMAMIZU_SPECIAL_KATAKANA.ariaLabel}
                  onClick={() => navigate(buildGuideReplayHref(SPECIAL_KATAKANA_TARGET_PATH, 'specialKatakana'))}
                  testId="ask-tamamizu-special-katakana"
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
      {/* Optional supplementary "Ask Tamamizu about particles" entry point
          (は/へ/を pronunciation quirks) — Hiragana page only, deliberately
          not a new Home category card, Recommended Path step, or curriculum
          category/row (see particleGuide.ts). */}
      {askTamamizuKanaIntroVariant === 'hiragana' && (
        <AskTamamizuButton
          imageSrc={`${import.meta.env.BASE_URL}${ASK_TAMAMIZU_PARTICLE.imageAsset}`}
          ariaLabel={ASK_TAMAMIZU_PARTICLE.ariaLabel}
          onClick={() => particleGuide.startReplay()}
          testId="ask-tamamizu-particle"
        />
      )}
      {(kanaIntroExcerptGuide.isReplaying || showAutoKanaIntroExcerptGuide) && (
        <KanaIntroExcerptGuide
          onDismiss={
            kanaIntroExcerptGuide.isReplaying
              ? kanaIntroExcerptGuide.dismissReplay
              : () => {
                  setAutoKanaIntroDismissedThisVisit(true)
                  setKanaIntroSectionCompletedFlag(true)
                }
          }
        />
      )}

      {showAutoSokuonGuide && (
        <ConceptGuide
          testId="sokuon-guide"
          imageAsset={SOKUON_GUIDE.slideAsset}
          imageAlt="Tamamizu explains the small tsu"
          {...SOKUON_GUIDE_CONTENT[DEFAULT_SOKUON_GUIDE_LOCALE]}
          onDismiss={() => setHasCompletedSokuonGuide(true)}
        />
      )}

      {showAutoChouonGuide && <ChouonGuide onDismiss={() => setHasCompletedChouonGuide(true)} />}

      {showAutoYouonGuide && <YouonGuide onDismiss={() => setHasCompletedYouonGuide(true)} />}

      {particleGuide.isReplaying && (
        <ParticleGuide
          onDismiss={() => {
            particleGuide.dismissReplay()
            // Only the FIRST completion (ever) sets the flag — every later
            // manual replay via the same button must never mutate progress
            // state, so skip the setter entirely once it's already true.
            if (!hasCompletedParticleGuide) setHasCompletedParticleGuide(true)
          }}
        />
      )}
    </div>
  )
}
