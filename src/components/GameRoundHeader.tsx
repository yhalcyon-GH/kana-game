import { BackToHubLink } from './BackToHubLink'

type Props = {
  rowId: string
  categoryId?: string
  roundIndex: number
  total: number
}

// Top of every graded mini-game screen: the exit link plus round progress,
// side by side at the top-left.
export function GameRoundHeader({ rowId, categoryId, roundIndex, total }: Props) {
  return (
    <div className="flex w-full items-center gap-3 self-start">
      <BackToHubLink rowId={rowId} categoryId={categoryId} />
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Round {roundIndex + 1} / {total}
      </p>
    </div>
  )
}
