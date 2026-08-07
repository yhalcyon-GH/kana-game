import type { KanaChar } from '../data/types'
import { SpeakButton } from './SpeakButton'

type Props = {
  char: KanaChar
}

export function CharacterCard({ char }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <span className="text-6xl font-bold">{char.kana}</span>
      <span className="text-lg text-neutral-500 dark:text-neutral-400">{char.romaji}</span>
      <SpeakButton text={char.kana} label={`Play pronunciation of ${char.kana}`} />
    </div>
  )
}
