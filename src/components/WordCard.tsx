import { ACCENT_PATTERNS } from '../data/accents'
import type { AnchorWord } from '../data/types'
import { useTTS } from '../hooks/useTTS'

type Props = {
  word: AnchorWord
}

// Tiny high/low dot per character, from ACCENT_PATTERNS (never guessed —
// see that file's header). Falls back to plain kana whenever there's no
// verified pattern, or its length doesn't line up with the kana (shouldn't
// happen, but silently mismatched dots would be worse than none).
function AccentedKana({ kana, accent }: { kana: string; accent?: string }) {
  const chars = [...kana]
  if (!accent || accent.length !== chars.length) {
    return <span className="font-kana text-2xl font-bold">{kana}</span>
  }
  return (
    <span className="font-kana inline-flex text-2xl font-bold">
      {chars.map((ch, i) => (
        <span key={i} className="relative inline-block">
          <span
            aria-hidden="true"
            className={`absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-400 dark:bg-blue-500 ${
              accent[i] === 'H' ? '-top-1' : '-bottom-1'
            }`}
          />
          {ch}
        </span>
      ))}
    </span>
  )
}

// The whole card is the tap target for audio (not just the speaker icon,
// which is too small to hit reliably) — the icon stays as a visual hint.
export function WordCard({ word }: Props) {
  const { speak } = useTTS()

  return (
    <button
      type="button"
      onClick={() => speak(`words/${word.id}`, word.audioText ?? word.kana)}
      aria-label={`Play pronunciation of ${word.kana}`}
      className="flex flex-col items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-4 text-center shadow-sm transition hover:border-blue-400 active:scale-95 dark:border-neutral-700 dark:bg-neutral-800"
    >
      <img src={`${import.meta.env.BASE_URL}${word.image}`} alt="" className="h-16 w-16" />
      <span className="my-0.5">
        <AccentedKana kana={word.kana} accent={ACCENT_PATTERNS[word.id]} />
      </span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{word.romaji}</span>
      <span className="text-center text-sm text-neutral-600 dark:text-neutral-300">{word.meaning}</span>
      <span className="mt-1 rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-700" aria-hidden="true">
        🔊
      </span>
    </button>
  )
}
