import Link from 'next/link'

const NAV_ITEMS = [
  { id: 'dashboard', href: '/', icon: '🏠', label: 'Dashboard' },
  { id: 'peptides', href: '/schedule', icon: '💉', label: 'Peptides' },
  { id: 'meals', href: '/meals', icon: '🍽️', label: 'Meals' },
  { id: 'vitals', href: '/vitals', icon: '📊', label: 'Vitals' },
  { id: 'more', href: '/more', icon: '☰', label: 'More' }
]

export default function BottomNav({ active }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <div className="grid grid-cols-5 max-w-lg mx-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === active

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center py-2 min-h-[52px] active:opacity-70 transition-colors ${
                  isActive ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="text-xl mb-0.5">{item.icon}</span>
                <span className={`text-[10px] font-medium ${isActive ? 'text-cyan-400' : 'text-gray-500'}`}>{item.label}</span>
              </Link>
            )
          })}
      </div>
    </nav>
  )
}
