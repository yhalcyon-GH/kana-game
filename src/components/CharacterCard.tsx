import type { KanaChar } from '../data/types'
import { useTTS } from '../hooks/useTTS'

type Props = {
  char: KanaChar
}

// The whole card is the tap target for audio (not just the speaker icon,
// which is too small to hit reliably) — the icon stays as a visual hint.
export function CharacterCard({ char }: Props) {
  const { speak } = useTTS()

  return (
    <button
      type="button"
      onClick={() => speak(`characters/${char.id}`, char.kana)}
      aria-label={`Play pronunciation of ${char.kana}`}
      className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-blue-400 active:scale-95 dark:border-neutral-700 dark:bg-neutral-800"
    >
      <span className="text-6xl font-bold">{char.kana}</span>
      <span className="text-lg text-neutral-500 dark:text-neutral-400">{char.romaji}</span>
      <span className="mt-1 rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-700" aria-hidden="true">
        🔊
      </span>
    </button>
  )
}
