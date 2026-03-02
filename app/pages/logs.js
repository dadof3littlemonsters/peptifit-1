import BottomNav from '../components/BottomNav';
import { ClipboardDocumentListIcon, PlusIcon } from '@heroicons/react/24/outline';

const SAMPLE_LOGS = [
  {
    id: 1,
    title: 'Cut phase started',
    date: '28 Feb 2026',
    note: 'Reduced calories slightly and switched injections to morning schedule.'
  },
  {
    id: 2,
    title: 'Recovery review',
    date: '24 Feb 2026',
    note: 'Sleep improved; keeping the current stack unchanged for another week.'
  }
];

export default function ProtocolLogsPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-900 text-white">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <div>
            <h1 className="text-xl font-semibold">Protocol Logs</h1>
            <p className="text-xs text-gray-400">Track protocol phases, changes, and side effects</p>
          </div>
          <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 text-black">
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="page-content mx-auto flex-1 min-h-0 overflow-y-auto w-full max-w-lg px-4 py-5 pb-[calc(104px+env(safe-area-inset-bottom))]">
        {SAMPLE_LOGS.length === 0 ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 rounded-2xl bg-cyan-500/10 p-4">
              <ClipboardDocumentListIcon className="h-12 w-12 text-cyan-400" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-white">Protocol Logs</h2>
            <p className="mb-6 max-w-sm text-gray-400">
              Track your protocol phases, medication changes, side effects, and vitals over time.
            </p>
            <button className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-3 font-semibold text-black">
              Create Your First Log
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {SAMPLE_LOGS.map((log) => (
              <div key={log.id} className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-white">{log.title}</h2>
                    <p className="mt-1 text-xs text-cyan-400">{log.date}</p>
                  </div>
                  <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-300">Journal</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-300">{log.note}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav active="more" />
    </div>
  );
}
