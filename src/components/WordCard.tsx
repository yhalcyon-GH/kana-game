import { ACCENT_PATTERNS } from '../data/accents'
import type { AnchorWord } from '../data/types'
import { useTTS } from '../hooks/useTTS'
import { toMorae } from '../lib/mora'
import { UnbreakableKana } from './UnbreakableKana'
import { WordImage } from './WordImage'

type Props = {
  word: AnchorWord
}

// Pitch-accent line in the standard textbook style: a high rail and a low
// rail above the kana, connected by a vertical step everywhere the pitch
// rises or falls between morae. From ACCENT_PATTERNS (never guessed — see
// that file's header), aligned by MORA (via toMorae — きゃ is 1 mora, 2
// characters) rather than raw character count, so yōon words render
// correctly too: each mora's line segment spans as many character-columns
// as it has glyphs. Falls back to plain kana whenever there's no verified
// pattern, or its mora count doesn't line up with the accent string
// (shouldn't happen, but a silently mismatched line would be worse than
// none).
function KanaText({ kana, highlightLastKana }: { kana: string; highlightLastKana?: boolean }) {
  if (!highlightLastKana) return <UnbreakableKana kana={kana} />
  return (
    <>
      <UnbreakableKana kana={kana.slice(0, -1)} />
      <span className="text-red-600 dark:text-red-400" data-testid="particle-greeting-ha">
        {kana[kana.length - 1]}
      </span>
    </>
  )
}

function AccentedKana({ kana, accent, highlightLastKana }: { kana: string; accent?: string; highlightLastKana?: boolean }) {
  const chars = [...kana]
  const n = chars.length
  const morae = toMorae(kana)
  if (!accent || accent.length !== morae.length) {
    return (
      <span className="font-kana text-2xl font-bold">
        <KanaText kana={kana} highlightLastKana={highlightLastKana} />
      </span>
    )
  }
  const HIGH_Y = 2
  const LOW_Y = 9
  const points: string[] = []
  let charOffset = 0
  for (let i = 0; i < morae.length; i++) {
    const y = accent[i] === 'H' ? HIGH_Y : LOW_Y
    const start = charOffset
    charOffset += morae[i].length
    points.push(`${start},${y}`, `${charOffset},${y}`)
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
          strokeWidth={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <KanaText kana={kana} highlightLastKana={highlightLastKana} />
    </span>
  )
}

// The whole card is the tap target for audio (not just the speaker icon,
// which is too small to hit reliably) — the icon stays as a visual hint.
export function WordCard({ word }: Props) {
  const { speak } = useTTS()
  const isParticleGreeting = word.id === 'ra-konnichiwa' || word.id === 'ra-konbanwa'

  return (
    <button
      type="button"
      onClick={() => speak(`words/${word.id}`, word.audioText ?? word.kana)}
      aria-label={`Play pronunciation of ${word.kana}`}
      className="flex flex-col items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-4 text-center shadow-sm transition hover:border-blue-400 active:scale-95 dark:border-neutral-700 dark:bg-neutral-800"
    >
      <WordImage word={word} className="h-16 w-16" />
      <span className="mt-2 mb-0.5">
        <AccentedKana kana={word.kana} accent={ACCENT_PATTERNS[word.id]} highlightLastKana={isParticleGreeting} />
      </span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{word.romaji}</span>
      <span className="text-center text-sm text-neutral-600 dark:text-neutral-300">{word.meaning}</span>
      {isParticleGreeting && <span className="text-sm font-semibold text-red-600 dark:text-red-400">は ※Particle</span>}
      <span className="mt-1 rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-700" aria-hidden="true">
        🔊
      </span>
    </button>
  )
}
