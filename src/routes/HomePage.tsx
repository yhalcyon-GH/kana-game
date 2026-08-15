import { Link } from 'react-router-dom'

type ScriptCard = { to: string; label: string; description: string; icon: string }

// Icons match each destination's ScriptCategory.icon (curriculum.ts) where
// there's a 1:1 category, so the same visual anchor carries through into
// the breadcrumb on PracticeHubPage (see HubBreadcrumb.tsx) — a learner who
// can't yet read a card's kana label still has a consistent icon to
// recognize it by. そのほか bundles multiple categories, so it gets its own
// generic "miscellaneous" icon rather than borrowing one category's.
const SCRIPT_CARDS: ScriptCard[] = [
  { to: '/hiragana', label: 'ひらがな', description: 'あ行から、単語と一緒に学ぶ', icon: '🎴' },
  { to: '/katakana', label: 'カタカナ', description: 'ア行から、単語と一緒に学ぶ', icon: '🔤' },
  // 'ようおん' (not '拗音') — same font-kana glyph-coverage reason as
  // そのほか below: 拗/音 are kanji, not in the subset.
  { to: '/youon', label: 'ようおん', description: 'きゃ・きゅ・きょ… セッションがたくさんあるので独立ページ', icon: '🔗' },
  // 'そのほか' (not 'その他') — the card label renders through the
  // hand-subsetted kana-only .font-kana font (see index.css's header
  // comment), which has no 他 glyph.
  { to: '/other', label: 'そのほか', description: '促音・長音など', icon: '📦' },
]

// Top-level chooser — four script groups, each its own page
// (CategoryRowsPage), rather than one long page stacking every category's
// rows together. "その他" bundles every category that isn't hiragana/
// katakana/拗音 (see App.tsx's OTHER_CATEGORY_IDS) so it doesn't need a new
// card here each time a small category is added later; 拗音 gets its own
// card since it has enough rows to deserve one.
export function HomePage() {
  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold">Kana Game</h1>
      <p className="max-w-md text-center text-neutral-500 dark:text-neutral-400">
        Learn hiragana and katakana one row at a time, paired with real everyday words.
      </p>
      <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {SCRIPT_CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="flex flex-col items-center gap-2 rounded-xl border border-neutral-300 bg-white p-6 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
          >
            <span className="text-2xl" aria-hidden="true">{card.icon}</span>
            <span className="font-kana text-2xl font-bold">{card.label}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{card.description}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
