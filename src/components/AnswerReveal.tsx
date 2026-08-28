import { CHARACTERS_BY_ID } from '../data/characters'

type Props = {
  characterIds: string[]
}

// The correct answer, shown per-character (kana in red on top, its own
// romaji below) rather than one kana word over one combined romaji string —
// e.g. しごと shows し/shi, ご/go, と/to as three aligned columns, so a
// multi-character word's reading maps clearly onto its spelling.
export function AnswerReveal({ characterIds }: Props) {
  return (
    <div className="flex gap-1">
      {characterIds.map((id, i) => {
        const char = CHARACTERS_BY_ID[id]
        if (!char) return null
        return (
          <div key={i} className="flex flex-col items-center">
            <span className="font-kana text-3xl font-bold whitespace-nowrap text-red-500">{char.kana}</span>
            <span className="text-sm font-normal text-red-500">{char.romaji}</span>
          </div>
        )
      })}
    </div>
  )
}
