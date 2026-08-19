export type ScriptEntryPoint = { to: string; label: string; english: string; icon: string }

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
// explicit request). 拗音 and そのほか additionally avoid spelling out a
// Japanese TERM at all (拗音/その他 are kanji; even ようおん/そのほか are
// kana a beginner may not read yet) — 拗音 uses a structural symbol instead
// (○+ゃゅょ: "a base kana plus a small ゃゅょ"), and そのほか keeps its kana
// but appends "+" to signal "and other things bundled in here". Icons match
// each destination's ScriptCategory.icon (curriculum.ts) where there's a
// 1:1 category, so the same visual anchor carries through into the
// breadcrumb on PracticeHubPage (see HubBreadcrumb.tsx) — そのほか bundles
// multiple categories, so it gets its own generic icon rather than
// borrowing one category's.
export const SCRIPT_ENTRY_POINTS: ScriptEntryPoint[] = [
  { to: '/hiragana', label: 'ひらがな', english: 'Hiragana', icon: 'category-icons/hiragana.webp' },
  { to: '/katakana', label: 'カタカナ', english: 'Katakana', icon: 'category-icons/katakana.webp' },
  { to: '/youon', label: '○+ゃゅょ', english: 'Yōon', icon: 'category-icons/youon.webp' },
  { to: '/other', label: 'そのほか +', english: 'Other', icon: 'category-icons/other.webp' },
]
