import { NavLink } from 'react-router-dom'
import { useCurriculum } from '../hooks/useCurriculum'

const LINKS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/review', label: 'Review', icon: '🔁' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
  { to: '/about', label: 'About', icon: 'ℹ️' },
]

export function NavBar() {
  const { dueReviewCount } = useCurriculum()

  return (
    <nav className="flex items-center justify-center gap-6 border-b border-neutral-200 py-3 dark:border-neutral-700">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-1.5 text-sm font-medium ${
              isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`
          }
        >
          {link.icon} {link.label}
          {link.to === '/review' && dueReviewCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
              {dueReviewCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
