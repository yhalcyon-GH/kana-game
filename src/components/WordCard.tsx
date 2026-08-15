import { ACCENT_PATTERNS } from '../data/accents'
import type { AnchorWord } from '../data/types'
import { useTTS } from '../hooks/useTTS'
import { WordImage } from './WordImage'

type Props = {
  word: AnchorWord
}

// Pitch-accent line in the standard textbook style: a high rail and a low
// rail above the kana, connected by a vertical step everywhere the pitch
// rises or falls between morae. From ACCENT_PATTERNS (never guessed — see
// that file's header). Falls back to plain kana whenever there's no
// verified pattern, or its length doesn't line up with the kana (shouldn't
// happen, but a silently mismatched line would be worse than none).
function AccentedKana({ kana, accent }: { kana: string; accent?: string }) {
  const chars = [...kana]
  const n = chars.length
  if (!accent || accent.length !== n) {
    return <span className="font-kana text-2xl font-bold">{kana}</span>
  }
  const HIGH_Y = 2
  const LOW_Y = 9
  const points: string[] = []
  for (let i = 0; i < n; i++) {
    const y = accent[i] === 'H' ? HIGH_Y : LOW_Y
    points.push(`${i},${y}`, `${i + 1},${y}`)
  }
  return (
    <span className="font-kana relative inline-block text-2xl font-bold">
      <svg
        viewBox={`0 0 ${n} 11`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute -top-3 left-0 h-3 w-full overflow-visible"
        aria-hidden="true"
      >
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#dc2626"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {kana}
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
      <WordImage word={word} className="h-16 w-16" />
      <span className="mt-2 mb-0.5">
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
