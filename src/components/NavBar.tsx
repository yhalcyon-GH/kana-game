import { NavLink } from 'react-router-dom'
import { CategoryIcon } from './CategoryIcon'
import { SCRIPT_ENTRY_POINTS } from '../data/scriptEntryPoints'
import { useCurriculum } from '../hooks/useCurriculum'
import { useGuideHighlight } from './GuideHighlightContext'

const LINKS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/review', label: 'Review', icon: '🔁' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
  { to: '/about', label: 'About', icon: 'ℹ️' },
]

export function NavBar() {
  const { reviewCount } = useCurriculum()
  const { reviewGuideVisible } = useGuideHighlight()

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-700">
      <nav className="flex items-center justify-center gap-6 py-3">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-1.5 text-sm font-medium ${link.to === '/review' ? 'rounded-lg px-1.5 py-1' : ''} ${
                reviewGuideVisible && link.to === '/review'
                  ? 'text-orange-600 ring-2 ring-orange-400 ring-offset-2 dark:text-orange-400 dark:ring-orange-400'
                  : isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`
            }
          >
            {link.icon} {link.label}
            {link.to === '/review' && reviewCount > 0 && (
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white ${
                  reviewGuideVisible ? 'bg-orange-500 ring-2 ring-orange-300' : 'bg-red-500'
                }`}
              >
                {reviewCount}
              </span>
            )}
          </NavLink>
        ))}
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
