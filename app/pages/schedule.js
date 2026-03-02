import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { doses, peptideConfigs, peptideDoses } from '../lib/api'
import BottomNav from '../components/BottomNav'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChartBarIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import {
  formatPeptideDoseSummary,
  formatPeptideFrequencyLabel,
  getPeptideWeeklyStats,
  groupDosesByDate,
  isPeptideConfigDueOnDate,
  isPeptideTakenOnDate,
  isPrnPeptideConfig
} from '../lib/peptideSchedule'

export default function PeptideSchedulePage() {
  const router = useRouter()
  const [configs, setConfigs] = useState([])
  const [allDoses, setAllDoses] = useState([])
  const [recentDoses, setRecentDoses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('today')
  const [loggingConfigId, setLoggingConfigId] = useState(null)
  const [deletingConfigId, setDeletingConfigId] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      const [configsData, recentDoseData, allDoseData] = await Promise.all([
        peptideConfigs.getAll(),
        doses.getRecent(),
        doses.getAll()
      ])

      setConfigs(configsData || [])
      setRecentDoses(recentDoseData || [])
      setAllDoses(allDoseData || [])
    } catch (err) {
      setError('Failed to load peptide schedule')
      console.error('Error loading peptide schedule:', err)
    } finally {
      setLoading(false)
    }
  }

  const scheduledConfigs = useMemo(
    () => configs.filter((config) => !isPrnPeptideConfig(config)),
    [configs]
  )

  const prnConfigs = useMemo(
    () => configs.filter((config) => isPrnPeptideConfig(config)),
    [configs]
  )

  const todaysConfigs = useMemo(
    () => scheduledConfigs.filter((config) => isPeptideConfigDueOnDate(config, allDoses, new Date()) || isPeptideTakenOnDate(config, recentDoses, new Date())),
    [scheduledConfigs, allDoses, recentDoses]
  )

  const takenTodayCount = useMemo(
    () => todaysConfigs.filter((config) => isPeptideTakenOnDate(config, recentDoses, new Date())).length,
    [todaysConfigs, recentDoses]
  )

  const prnTakenTodayCount = useMemo(
    () => prnConfigs.filter((config) => isPeptideTakenOnDate(config, recentDoses, new Date())).length,
    [prnConfigs, recentDoses]
  )

  const doseHistoryByDate = useMemo(() => groupDosesByDate(allDoses), [allDoses])

  const historyDates = useMemo(
    () => Object.keys(doseHistoryByDate).sort((a, b) => new Date(b) - new Date(a)),
    [doseHistoryByDate]
  )

  const handleQuickLog = async (config) => {
    try {
      setLoggingConfigId(config.id)
      setError('')

      let suggestedDose = config.doses?.[0]

      try {
        const suggestion = await peptideConfigs.getSuggestedDose(config.id)
        if (suggestion?.suggested_dose) {
          suggestedDose = suggestion.suggested_dose
        }
      } catch (suggestionError) {
        console.error('Failed to load suggested dose:', suggestionError)
      }

      if (!suggestedDose?.amount) {
        throw new Error('No configured dose amount found for this peptide')
      }

      await peptideDoses.create({
        peptide_id: config.peptide_id,
        config_id: config.id,
        dose_amount: parseFloat(suggestedDose.amount),
        dose_unit: suggestedDose.unit || 'mg',
        administration_time: new Date().toISOString(),
        injection_site: null,
        notes: null
      })

      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to log dose')
      console.error('Error logging peptide dose:', err)
    } finally {
      setLoggingConfigId(null)
    }
  }

  const handleDelete = async (configId) => {
    if (!confirm('Are you sure you want to remove this peptide from your stack?')) return

    try {
      setDeletingConfigId(configId)
      setError('')
      await peptideConfigs.delete(configId)
      await loadData()
    } catch (err) {
      setError('Failed to remove peptide from your stack')
      console.error('Error deleting peptide config:', err)
    } finally {
      setDeletingConfigId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading peptide schedule...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] min-h-screen flex flex-col overflow-hidden bg-gray-900 text-white">
      <header className="h-14 flex-shrink-0 border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-full w-full max-w-lg items-center px-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center">
              <Link href="/" className="mr-3 flex h-11 w-11 items-center justify-center">
                <ArrowLeftIcon className="h-6 w-6 text-gray-400 transition-colors hover:text-white" />
              </Link>
              <h1 className="text-xl font-bold text-white">Peptides</h1>
            </div>
            <Link
              href="/configure-peptides"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 font-medium text-black transition-colors hover:bg-cyan-400"
            >
              <PlusIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="mx-auto flex max-w-lg gap-1 rounded-xl bg-gray-800/50 p-1">
          {[
            { id: 'today', label: 'Today', icon: CalendarIcon },
            { id: 'stack', label: 'My Stack', icon: PlusIcon },
            { id: 'history', label: 'History', icon: ChartBarIcon }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-black'
                  : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="page-content mx-auto flex-1 min-h-0 overflow-y-auto w-full max-w-lg px-4 py-4 pb-[calc(104px+env(safe-area-inset-bottom))]">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-400">
            {error}
          </div>
        )}

        {activeTab === 'today' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })}
              </h2>
              {todaysConfigs.length > 0 && (
                <span className="text-sm text-gray-400">
                  {takenTodayCount} / {todaysConfigs.length} taken
                </span>
              )}
            </div>

            {todaysConfigs.length === 0 && prnConfigs.length === 0 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-800/50 py-12 text-center">
                <div className="mb-3 text-4xl">💉</div>
                <h3 className="mb-2 font-medium text-white">
                  {configs.length > 0 ? 'Nothing due today' : 'No peptides due today'}
                </h3>
                <p className="mb-4 text-sm text-gray-400">
                  {configs.length > 0
                    ? `You have ${configs.length} peptide${configs.length > 1 ? 's' : ''} in your stack.`
                    : 'Add a peptide to your stack or check back tomorrow'}
                </p>
                {configs.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('stack')}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-cyan-400"
                  >
                    View My Stack
                  </button>
                ) : (
                  <Link
                    href="/configure-peptides"
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-cyan-400"
                  >
                    Add Peptide
                  </Link>
                )}
              </div>
            ) : todaysConfigs.length > 0 ? (
              <div className="space-y-3">
                {todaysConfigs.map((config) => {
                  const taken = isPeptideTakenOnDate(config, recentDoses, new Date())
                  const stats = getPeptideWeeklyStats(config, allDoses, new Date())

                  return (
                    <div
                      key={config.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        taken
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <button
                          onClick={() => !taken && handleQuickLog(config)}
                          disabled={taken || loggingConfigId === config.id}
                          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all ${
                            taken
                              ? 'bg-green-500 text-black'
                              : 'border border-gray-600 bg-gray-700 hover:bg-gray-600'
                          }`}
                        >
                          {taken ? (
                            <CheckIcon className="h-5 w-5" />
                          ) : (
                            <span className="text-lg text-gray-400">{loggingConfigId === config.id ? '…' : '○'}</span>
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className={`font-semibold ${taken ? 'text-gray-400 line-through' : 'text-white'}`}>
                                {config.peptide_name}
                              </h3>
                              <p className="text-sm text-gray-400">
                                {formatPeptideDoseSummary(config)}
                                <span className="text-cyan-400"> • {formatPeptideFrequencyLabel(config)}</span>
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                taken
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-gray-700 text-gray-300'
                              }`}
                            >
                              {taken ? 'Taken' : 'Due'}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-700">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                                style={{ width: `${stats.adherence}%` }}
                              />
                            </div>
                            <span className="whitespace-nowrap text-xs text-gray-400">
                              {stats.taken}/{stats.scheduled} this week
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2 border-t border-gray-700/50 pt-3">
                        <button
                          onClick={() => handleQuickLog(config)}
                          disabled={taken || loggingConfigId === config.id}
                          className="flex-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {taken ? 'Taken Today' : loggingConfigId === config.id ? 'Logging...' : 'Take Dose'}
                        </button>
                        <button
                          onClick={() => router.push(`/log-dose?peptide=${config.peptide_id}&config=${config.id}`)}
                          className="rounded-xl bg-gray-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
                        >
                          Log Dose
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-700 bg-gray-800/50 py-8 text-center">
                <h3 className="mb-2 font-medium text-white">Nothing scheduled today</h3>
                <p className="text-sm text-gray-400">Your scheduled peptides are up to date for today.</p>
              </div>
            )}

            {prnConfigs.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Available PRN</h3>
                  <span className="text-xs text-gray-500">{prnTakenTodayCount} logged today</span>
                </div>

                {prnConfigs.map((config) => {
                  const takenToday = isPeptideTakenOnDate(config, recentDoses, new Date())

                  return (
                    <div
                      key={config.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        takenToday
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-white">{config.peptide_name}</h3>
                          <p className="mt-1 text-sm text-gray-400">
                            {formatPeptideDoseSummary(config)}
                            <span className="text-cyan-400"> • {formatPeptideFrequencyLabel(config)}</span>
                          </p>
                          {config.notes && (
                            <p className="mt-3 rounded-xl bg-gray-700/50 px-3 py-2 text-sm text-gray-300">
                              {config.notes}
                            </p>
                          )}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            takenToday
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          {takenToday ? 'Logged today' : 'Available'}
                        </span>
                      </div>

                      <div className="mt-3 flex gap-2 border-t border-gray-700/50 pt-3">
                        <button
                          onClick={() => handleQuickLog(config)}
                          disabled={loggingConfigId === config.id}
                          className="flex-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loggingConfigId === config.id ? 'Logging...' : 'Log PRN Dose'}
                        </button>
                        <button
                          onClick={() => router.push(`/log-dose?peptide=${config.peptide_id}&config=${config.id}`)}
                          className="rounded-xl bg-gray-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
                        >
                          Manual Log
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stack' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">My Stack</h2>
              <span className="text-sm text-gray-400">{configs.length} items</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/configure-peptides"
                className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-500/15"
              >
                <PlusIcon className="h-4 w-4" />
                Add Peptide
              </Link>
              <Link
                href="/configure-peptides"
                className="flex items-center justify-center gap-2 rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
              >
                <PencilIcon className="h-4 w-4" />
                Edit Library
              </Link>
            </div>

            {configs.length === 0 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-800/50 py-12 text-center">
                <div className="mb-3 text-4xl">🧪</div>
                <h3 className="mb-2 font-medium text-white">No peptide stack yet</h3>
                <p className="text-sm text-gray-400">Configure your first peptide to build a schedule</p>
              </div>
            ) : (
              <div className="space-y-3">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="rounded-2xl border border-gray-700 bg-gray-800 p-4 transition-all hover:border-gray-600"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-white">{config.peptide_name}</h3>
                        <p className="mt-1 text-sm text-gray-400">
                          {formatPeptideDoseSummary(config)} • {formatPeptideFrequencyLabel(config)}
                        </p>
                        {config.notes && (
                          <p className="mt-3 rounded-xl bg-gray-700/50 px-3 py-2 text-sm text-gray-300">
                            {config.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/configure-peptides?edit=${config.id}`}
                          className="rounded-xl bg-gray-700 p-2 transition-colors hover:bg-gray-600"
                        >
                          <PencilIcon className="h-4 w-4 text-gray-300" />
                        </Link>
                        <button
                          onClick={() => handleDelete(config.id)}
                          disabled={deletingConfigId === config.id}
                          className="rounded-xl bg-red-500/20 p-2 text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-60"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Dose History</h2>
            </div>

            {historyDates.length === 0 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-800/50 py-12 text-center">
                <div className="mb-3 text-4xl">📊</div>
                <h3 className="mb-2 font-medium text-white">No history yet</h3>
                <p className="text-sm text-gray-400">Start logging doses to see your peptide history</p>
              </div>
            ) : (
              <div className="space-y-6">
                {historyDates.map((dateKey) => (
                  <div key={dateKey} className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                      {new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </h3>
                    <div className="space-y-3">
                      {doseHistoryByDate[dateKey].map((dose) => (
                        <div
                          key={dose.id}
                          className="rounded-2xl border border-gray-700 bg-gray-800 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-white">{dose.peptide_name}</h4>
                              <p className="mt-1 text-sm text-gray-400">
                                {dose.dose_amount} {dose.dose_unit}
                              </p>
                              {dose.notes && (
                                <p className="mt-2 text-sm text-gray-300">{dose.notes}</p>
                              )}
                            </div>
                            <span className="text-sm text-cyan-400">
                              {new Date(dose.administration_time).toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <BottomNav active="peptides" />
    </div>
  )
}
