import Link from 'next/link'
import BottomNav from '../components/BottomNav'

const MORE_ITEMS = [
  { href: '/peptides', icon: '🧬', label: 'Peptide Library' },
  { href: '/supplements', icon: '💊', label: 'Supplements' },
  { href: '/blood-results', icon: '🧪', label: 'Blood Results' },
  { href: '/logs', icon: '📋', label: 'Protocol Logs' },
  { href: '/chat', icon: '💬', label: 'AI Coach' },
  { href: '/profile', icon: '👤', label: 'Profile' },
  { href: '/settings', icon: '⚙️', label: 'Settings' }
]

export default function MorePage() {
  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden text-white">
      <header className="flex items-center px-4 h-14 flex-shrink-0 bg-gray-900 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-bold text-white">More</h1>
          <p className="text-xs text-gray-400">More tools and tracking sections</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20 px-4 py-4">
        <div className="space-y-3">
          {MORE_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl border border-gray-700 bg-gray-800 px-4 py-4 text-white"
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              <span className="text-cyan-400 text-sm">→</span>
            </Link>
          ))}
        </div>
      </main>

      <BottomNav active="more" />
    </div>
  )
}
