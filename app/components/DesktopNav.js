import Link from 'next/link'
import { auth } from '../lib/api'

const NAV_ITEMS = [
  { id: 'dashboard', href: '/', icon: '🏠', label: 'Dashboard' },
  { id: 'peptides', href: '/schedule', icon: '💉', label: 'Peptides' },
  { id: 'meals', href: '/meals', icon: '🍽️', label: 'Meals' },
  { id: 'vitals', href: '/vitals', icon: '📊', label: 'Vitals' },
  { id: 'more', href: '/more', icon: '☰', label: 'More' }
]

export default function DesktopNav({ active, user }) {
  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-56 lg:flex-col lg:border-r lg:border-gray-800 lg:bg-gray-900/95 lg:backdrop-blur-sm">
      <div className="border-b border-gray-800 px-5 py-6">
        <div className="text-lg font-semibold text-white">PeptiFit</div>
        <div className="mt-1 text-xs text-gray-400">{user?.username || 'Account'}</div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active
          return (
            <Link
              key={item.id}
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
