import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/review', label: 'Review' },
  { to: '/settings', label: 'Settings' },
]

export function NavBar() {
  return (
    <nav className="flex items-center justify-center gap-6 border-b border-neutral-200 py-3 dark:border-neutral-700">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          className={({ isActive }) =>
            `text-sm font-medium ${
              isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
