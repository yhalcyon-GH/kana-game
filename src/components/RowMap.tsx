import { Link } from 'react-router-dom'
import type { GojuonRow } from '../data/types'

type Props = {
  rows: GojuonRow[]
  isUnlocked: (rowId?: string) => boolean
  isTaught: (rowId: string) => boolean
  isMastered: (rowId: string) => boolean
}

export function RowMap({ rows, isUnlocked, isTaught, isMastered }: Props) {
  return (
    <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
      {rows.map((row) => {
        const unlocked = isUnlocked(row.id)
        const taught = isTaught(row.id)
        const mastered = isMastered(row.id)
        const href = !unlocked ? null : taught ? `/practice/${row.id}` : `/learn/${row.id}`

        const card = (
          <div
            className={`flex flex-col items-center gap-1 rounded-xl border p-4 text-center transition ${
              unlocked
                ? 'border-neutral-300 bg-white hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800'
                : 'border-neutral-200 bg-neutral-50 opacity-50 dark:border-neutral-800 dark:bg-neutral-900'
            }`}
          >
            <span className="text-lg font-semibold">{row.label}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {!unlocked ? '🔒 locked' : mastered ? '🌟 mastered' : taught ? '📗 practice' : '📘 learn'}
            </span>
          </div>
        )

        return href ? (
          <Link key={row.id} to={href}>
            {card}
          </Link>
        ) : (
          <div key={row.id}>{card}</div>
        )
      })}
    </div>
  )
}
