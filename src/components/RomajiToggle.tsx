import { useProgressStore } from '../store/progressStore'

// Small labeled switch for the romaji hint shown alongside a word prompt.
// Lives right next to the romaji text itself (see WordBuilderPage) so its
// target is unambiguous — no separate "what does this control?" guesswork.
export function RomajiToggle() {
  const showRomaji = useProgressStore((s) => s.showRomaji)
  const setShowRomaji = useProgressStore((s) => s.setShowRomaji)

  return (
    <button
      type="button"
      onClick={() => setShowRomaji(!showRomaji)}
      aria-pressed={showRomaji}
      className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-2.5 py-1 text-xs text-neutral-500 hover:border-blue-400 dark:border-neutral-600 dark:text-neutral-400"
    >
      <span>romaji</span>
      <span
        className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${
          showRomaji ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform ${
            showRomaji ? 'translate-x-2.5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
