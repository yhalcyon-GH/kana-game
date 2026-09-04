import {
  CHOUON_CATEGORY_ID,
  DEFAULT_CATEGORY_ID,
  KATAKANA_CATEGORY_ID,
  SOKUON_CATEGORY_ID,
  SPECIAL_KATAKANA_CATEGORY_ID,
  YOUON_CATEGORY_ID,
} from './curriculum'

export type ScriptEntryPoint = { to: string; label: string; english?: string; icon: string; categoryIds: string[] }

// The four top-level script pages, shared by HomePage's card grid and
// NavBar's script-jump row — a single source so an icon/label change only
// needs to happen once (see App.tsx's OTHER_CATEGORY_IDS for why "そのほか"
// bundles multiple categories into one entry here rather than getting a
// route per category).
//
// This is the very first screen a total-beginner foreigner sees — someone
// who may not read hiragana OR katakana yet, so a bare Japanese label alone
// (even kana-only) isn't necessarily readable. Every entry therefore pairs
// its native label with a short English word (2026-08-15, at the user's
// explicit request). 拗音 and the そのほか-bundle entry additionally avoid
// spelling out a Japanese TERM at all (拗音/その他 are kanji; even
// ようおん/そのほか are kana a beginner may not read yet) — both instead use
// a structural symbol naming what's actually inside: 拗音 is ゃゅょ (its
// small contracted-sound kana), and the bundle entry is っ・ー (its two
// bundled categories' own marks: 促音's っ, 長音's ー). Icons match each
// destination's ScriptCategory.icon (curriculum.ts) where there's a 1:1
// category, so the same visual anchor carries through into the breadcrumb
// on PracticeHubPage (see HubBreadcrumb.tsx) — the bundle entry covers
// multiple categories, so it gets its own generic icon rather than
// borrowing one category's.
// Order here matches curriculum.ts's CATEGORIES declaration order (Hiragana
// -> Katakana -> Sokuon -> Chōon -> Yōon), so this top-level entry order and
// the Global Recommended Target's category-by-category progression always
// agree (2026-08-26 — Stop & Long Sound moved ahead of Yōon to match).
export const SCRIPT_ENTRY_POINTS: ScriptEntryPoint[] = [
  { to: '/hiragana', label: 'ひらがな', english: 'Hiragana', icon: 'category-icons/hiragana.webp', categoryIds: [DEFAULT_CATEGORY_ID] },
  { to: '/katakana', label: 'カタカナ', english: 'Katakana', icon: 'category-icons/katakana.webp', categoryIds: [KATAKANA_CATEGORY_ID] },
  {
    to: '/other',
    label: 'っ・ー',
    english: 'Stop & Long Sound',
    icon: 'category-icons/other.webp',
    // Bundles both contrast-pairs categories (see App.tsx's OTHER_CATEGORY_IDS)
    // into this one card — either being next-recommended recommends this card.
    categoryIds: [SOKUON_CATEGORY_ID, CHOUON_CATEGORY_ID],
  },
  {
    to: '/youon',
    label: 'ゃゅょ',
    icon: 'category-icons/youon.webp',
    // Special Katakana (see curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) is
    // bundled onto this SAME /youon page as a continuation of Yōon — no
    // separate top-level entry — so it's included here too: whenever the
    // Global Recommended Target moves into Special Katakana, this is still
    // the one card that correctly lights up as Recommended and links there.
    categoryIds: [YOUON_CATEGORY_ID, SPECIAL_KATAKANA_CATEGORY_ID],
  },
]
