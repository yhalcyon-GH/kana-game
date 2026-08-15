import { Link } from 'react-router-dom'

type ScriptCard = { to: string; label: string; english: string; icon: string }

// This is the very first screen a total-beginner foreigner sees — someone
// who may not read hiragana OR katakana yet, so a bare Japanese label alone
// (even kana-only) isn't necessarily readable. Every card therefore pairs
// its native label with a short English word (2026-08-15, at the user's
// explicit request). 拗音 and そのほか additionally avoid spelling out a
// Japanese TERM at all (拗音/その他 are kanji; even ようおん/そのほか are
// kana a beginner may not read yet) — 拗音 uses a structural symbol instead
// (○+ゃゅょ: "a base kana plus a small ゃゅょ"), and そのほか keeps its kana
// but appends "+" to signal "and other things bundled in here". Icons match
// each destination's ScriptCategory.icon (curriculum.ts) where there's a
// 1:1 category, so the same visual anchor carries through into the
// breadcrumb on PracticeHubPage (see HubBreadcrumb.tsx) — そのほか bundles
// multiple categories, so it gets its own generic "miscellaneous" icon
// rather than borrowing one category's.
const SCRIPT_CARDS: ScriptCard[] = [
  { to: '/hiragana', label: 'ひらがな', english: 'Hiragana', icon: '🎴' },
  { to: '/katakana', label: 'カタカナ', english: 'Katakana', icon: '🔤' },
  { to: '/youon', label: '○+ゃゅょ', english: 'Yōon', icon: '🔗' },
  { to: '/other', label: 'そのほか +', english: 'Other', icon: '📦' },
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
            <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">{card.english}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
