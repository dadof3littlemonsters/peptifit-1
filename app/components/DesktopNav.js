import Link from 'next/link'
import { auth } from '../lib/api'

const NAV_ITEMS = [
  { href: '/', icon: '🏠', label: 'Dashboard', match: ['/'] },
  { href: '/schedule', icon: '💉', label: 'Protocol', match: ['/schedule', '/configure-peptides', '/log-dose'] },
  { href: '/peptides', icon: '🧬', label: 'Peptide Library', match: ['/peptides'] },
  { href: '/meals', icon: '🍽️', label: 'Meals', match: ['/meals', '/food'] },
  { href: '/vitals', icon: '📊', label: 'Vitals', match: ['/vitals'] },
  { href: '/supplements', icon: '💊', label: 'Supplements', match: ['/supplements'] },
  { href: '/blood-results', icon: '🧪', label: 'Blood Results', match: ['/blood-results'] },
  { href: '/logs', icon: '📋', label: 'Protocol Logs', match: ['/logs'] },
  { href: '/chat', icon: '💬', label: 'AI Coach', match: ['/chat'] },
  { href: '/profile', icon: '👤', label: 'Profile', match: ['/profile'] },
  { href: '/settings', icon: '⚙️', label: 'Settings', match: ['/settings'] }
]

const isItemActive = (pathname, item) => {
  if (!pathname) {
    return false
  }
  if (item.href === '/') {
    return pathname === '/'
  }
  return item.match.some((prefix) => prefix !== '/' && pathname.startsWith(prefix))
}

export default function DesktopNav({ pathname, user }) {
  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-gray-800 lg:bg-gray-900/95 lg:backdrop-blur-sm">
      <div className="border-b border-gray-800 px-5 py-6">
        <div className="text-lg font-semibold text-white">PeptiFit</div>
        <div className="mt-1 text-xs text-gray-400">{user?.username || 'Account'}</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = isItemActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <button
          type="button"
          onClick={auth.logout}
          className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
        >
          Log Out
        </button>
      </div>
    </aside>
  )
}
