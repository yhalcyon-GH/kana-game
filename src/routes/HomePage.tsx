import { Link } from 'react-router-dom'

type ScriptCard = { to: string; label: string; description: string }

const SCRIPT_CARDS: ScriptCard[] = [
  { to: '/hiragana', label: 'ひらがな', description: 'あ行から、単語と一緒に学ぶ' },
  { to: '/katakana', label: 'カタカナ', description: 'ア行から、単語と一緒に学ぶ' },
  // 'そのほか' (not 'その他') — the card label renders through the
  // hand-subsetted kana-only .font-kana font (see index.css's header
  // comment), which has no 他 glyph.
  { to: '/other', label: 'そのほか', description: '促音・長音・拗音・特殊音など' },
]

// Top-level chooser — three script groups, each its own page
// (CategoryRowsPage), rather than one long page stacking every category's
// rows together. "その他" bundles every category that isn't hiragana/
// katakana (see App.tsx's /other route) so it doesn't need a new card here
// each time a category like 促音 is added later.
export function HomePage() {
  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold">Kana Game</h1>
      <p className="max-w-md text-center text-neutral-500 dark:text-neutral-400">
        Learn hiragana and katakana one row at a time, paired with real everyday words.
      </p>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
        {SCRIPT_CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="flex flex-col items-center gap-2 rounded-xl border border-neutral-300 bg-white p-6 text-center hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
          >
            <span className="font-kana text-2xl font-bold">{card.label}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{card.description}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
