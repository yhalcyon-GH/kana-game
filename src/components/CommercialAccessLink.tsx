import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isCommerciallyAccessible, type CommercialAccessTarget } from '../lib/commercialAccess'
import { CommercialAccessGate } from './CommercialAccessGate'
import { useEntitlement } from './EntitlementContext'

type Props = {
  target: CommercialAccessTarget
  to: string
  children: ReactNode
  className?: string
  'data-testid'?: string
}

/** Keeps a destination visible while resolving denied actions through the shared gate. */
export function CommercialAccessLink({ target, to, children, className, ...attributes }: Props) {
  const { state } = useEntitlement()
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()

  if (isCommerciallyAccessible(target, state.status)) {
    return <Link to={to} className={className} {...attributes}>{children}</Link>
  }

  return (
    <div className="flex h-full w-full min-w-0 max-w-md flex-col">
      <button
        type="button"
        className={`w-full min-w-0 ${className ?? ''}`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(!expanded)}
        {...attributes}
      >
        {children}
        <span className="block w-full break-words text-xs font-semibold text-neutral-600 dark:text-neutral-300">🔒 Full Tamamizu</span>
      </button>
      {expanded && (
        <div id={panelId} role="region" aria-label="Full Tamamizu access" className="mt-2 flex w-full min-w-0 justify-center rounded-xl border border-neutral-300 bg-white p-3 text-sm dark:border-neutral-600 dark:bg-neutral-800">
          <CommercialAccessGate target={target}>{null}</CommercialAccessGate>
        </div>
      )}
    </div>
  )
}
