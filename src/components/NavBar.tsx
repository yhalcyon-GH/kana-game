import { NavLink } from 'react-router-dom'
import { CategoryIcon } from './CategoryIcon'
import { NavBadge } from './NavBadge'
import { SCRIPT_ENTRY_POINTS } from '../data/scriptEntryPoints'
import { useCurriculum } from '../hooks/useCurriculum'
import { useSavedItemsStore } from '../store/savedItemsStore'
import { useGuideHighlight } from './GuideHighlightContext'

// Top nav: Home / Review / Saved (icon + label, one row, no wrap even at
// 320px) plus a gear-only Settings entry with no visible "Settings" text —
// About is reached from within Settings (see SettingsPage) rather than a
// separate top-level nav entry, so it's intentionally absent here even
// though the /about route itself still exists for old links/bookmarks.
export function NavBar() {
  const { reviewCount } = useCurriculum()
  const savedCount = useSavedItemsStore((s) => s.savedCharacterIds.length + s.savedWordIds.length)
  const { reviewGuideVisible } = useGuideHighlight()

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-xs font-medium ${
      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
    }`

  const reviewItemClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-xs font-medium ${
      reviewGuideVisible
        ? 'text-orange-600 ring-2 ring-orange-400 ring-offset-2 dark:text-orange-400 dark:ring-orange-400'
        : isActive
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
    }`

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-700">
      <nav className="flex items-center justify-center gap-1 py-2">
        <NavLink to="/" end className={itemClass}>
          <span className="text-lg leading-none" aria-hidden="true">🏠</span>
          Home
        </NavLink>

        <NavLink to="/review" className={reviewItemClass}>
          <span className="text-lg leading-none" aria-hidden="true">🔁</span>
          Review
          <NavBadge count={reviewCount} className={reviewGuideVisible ? 'bg-orange-500 ring-2 ring-orange-300' : undefined} />
        </NavLink>

        <NavLink to="/saved" className={itemClass}>
          <span className="text-lg leading-none" aria-hidden="true">🔖</span>
          Saved
          <NavBadge count={savedCount} />
        </NavLink>

        <NavLink to="/settings" aria-label="Settings" className={itemClass}>
          <span className="text-lg leading-none" aria-hidden="true">⚙️</span>
        </NavLink>
      </nav>
      <nav className="flex items-center justify-center gap-5 pb-3">
        {SCRIPT_ENTRY_POINTS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `font-kana flex items-center gap-1 text-sm font-semibold ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`
            }
          >
            <CategoryIcon icon={link.icon} className="h-4 w-4 text-sm" /> {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
