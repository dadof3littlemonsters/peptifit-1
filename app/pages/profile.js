import Link from 'next/link';
import BottomNav from '../components/BottomNav';
import { UserIcon } from '@heroicons/react/24/outline';

const USER = {
  name: 'PeptiFit User',
  plan: 'Family Plan'
};

const USAGE = {
  chatsToday: 4,
  scansToday: 2
};

export default function ProfilePage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-900 text-white">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto h-14 max-w-lg px-4">
          <div className="flex h-full items-center">
            <div>
              <h1 className="text-xl font-semibold">Profile</h1>
              <p className="text-xs text-gray-400">Account, preferences, and usage</p>
            </div>
          </div>
        </div>
      </header>

      <main className="page-content mx-auto w-full max-w-lg space-y-5 px-4 py-5 pb-24">
        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500/20">
            <UserIcon className="h-8 w-8 text-cyan-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">{USER.name}</h2>
          <span className="mt-1 inline-block rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">
            {USER.plan.toUpperCase()}
          </span>
          <Link href="/settings" className="mt-4 block w-full rounded-xl bg-gray-700 py-2.5 text-sm font-medium text-cyan-400">
            Edit Profile
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
          <h3 className="mb-4 font-semibold text-white">Preferences</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Unit System</span>
              <span className="text-sm text-white">SI Units</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">AI Model</span>
              <span className="text-sm text-white">Pending Integration</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
          <h3 className="mb-4 font-semibold text-white">Usage</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-gray-700/50 p-3 text-center">
              <p className="text-2xl font-bold text-cyan-400">{USAGE.chatsToday}</p>
              <p className="text-xs text-gray-400">Chats Today</p>
            </div>
            <div className="rounded-xl bg-gray-700/50 p-3 text-center">
              <p className="text-2xl font-bold text-cyan-400">{USAGE.scansToday}</p>
              <p className="text-xs text-gray-400">Scans Today</p>
            </div>
          </div>
        </div>
      </main>

      <BottomNav active="more" />
    </div>
  );
}
