import Link from 'next/link'

const NAV_ITEMS = [
  { id: 'dashboard', href: '/', icon: '🏠', label: 'Dashboard' },
  { id: 'diary', href: '/meals', icon: '📓', label: 'Diary' },
  { id: 'peptides', href: '/peptides', icon: '💉', label: 'Peptides' },
  { id: 'more', href: '/more', icon: '☰', label: 'More' }
]

export default function BottomNav({ active }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <div className="grid grid-cols-4 max-w-lg mx-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === active

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center py-3 min-h-[56px] active:opacity-70 transition-colors ${
                  isActive ? 'text-cyan-400' : 'text-gray-500'
                }`}
              >
                <span className="text-2xl mb-1">{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            )
          })}
      </div>
    </nav>
  )
}
