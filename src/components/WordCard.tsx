import type { AnchorWord } from '../data/types'
import { SpeakButton } from './SpeakButton'

type Props = {
  word: AnchorWord
}

export function WordCard({ word }: Props) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <span className="text-4xl">{word.emoji}</span>
      <span className="text-2xl font-bold">{word.kana}</span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{word.romaji}</span>
      <span className="text-center text-sm text-neutral-600 dark:text-neutral-300">{word.meaning}</span>
      <SpeakButton
        audioKey={`words/${word.id}`}
        text={word.audioText ?? word.kana}
        label={`Play pronunciation of ${word.kana}`}
      />
    </div>
  )
}
