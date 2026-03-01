import { useState, useEffect } from 'react'
import { peptides, doses } from '../lib/api'
import Link from 'next/link'
import BottomNav from '../components/BottomNav'
import { ArrowLeftIcon, BeakerIcon, PlusIcon } from '@heroicons/react/24/outline'

export default function PeptidesPage() {
  const [peptidesList, setPeptidesList] = useState([])
  const [recentDoses, setRecentDoses] = useState([])
  const [activePeptideId, setActivePeptideId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPeptides()
  }, [])

  const loadPeptides = async () => {
    try {
      const [peptidesData, dosesData] = await Promise.all([
        peptides.getAll(),
        doses.getAll()
      ])
      setPeptidesList(peptidesData)
      setRecentDoses(dosesData)
      setActivePeptideId((current) => current || peptidesData[0]?.id || '')
    } catch (err) {
      setError('Failed to load peptides')
      console.error('Error loading peptides:', err)
    } finally {
      setLoading(false)
    }
  }

  const getLastDoseInfo = (peptideId) => {
    const peptideDoses = recentDoses.filter(dose => dose.peptide_id === peptideId)
    if (peptideDoses.length === 0) return null
    
    const lastDose = peptideDoses[0] // Assuming doses are sorted by date
    return {
      time: new Date(lastDose.administration_time),
      amount: lastDose.dose_amount,
      unit: lastDose.dose_unit
    }
  }

  const formatTimeAgo = (date) => {
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading peptides...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-black text-white">
      <header className="flex h-14 flex-shrink-0 items-center border-b border-gray-800 bg-black">
        <div className="mx-auto flex w-full max-w-md items-center px-4">
          <div className="flex items-center">
            <Link href="/" className="mr-3 flex h-11 w-11 items-center justify-center">
              <ArrowLeftIcon className="h-6 w-6 text-gray-400 hover:text-white transition-colors" />
            </Link>
            <h1 className="text-xl font-bold text-white">Peptides</h1>
          </div>
        </div>
      </header>

      <main className="page-content mx-auto w-full max-w-md px-4 py-4 pb-24">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {peptidesList.map((peptide) => {
            const lastDose = getLastDoseInfo(peptide.id)
            const isExpanded = activePeptideId === peptide.id || (!activePeptideId && peptidesList[0]?.id === peptide.id)
            return (
              <div
                key={peptide.id}
                className={`min-h-16 rounded-2xl border p-4 transition-colors ${
                  isExpanded
                    ? 'border-cyan-500/30 bg-gray-800'
                    : 'border-gray-700 bg-gray-800/80'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <BeakerIcon className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-white">{peptide.name}</h3>
                        <p className="mt-1 text-sm text-gray-400">
                          {isExpanded ? peptide.description : peptide.description?.slice(0, 78)}
                          {!isExpanded && peptide.description?.length > 78 ? '...' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivePeptideId(peptide.id)}
                        className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          isExpanded
                            ? 'bg-cyan-500/15 text-cyan-400'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {isExpanded ? 'Open' : 'Expand'}
                      </button>
                    </div>

                    {lastDose && (
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-600/50 bg-gray-700/40 px-3 py-2">
                        <div className="text-sm">
                          <span className="font-medium text-cyan-400">Last dose </span>
                          <span className="text-white">{lastDose.amount}{lastDose.unit}</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatTimeAgo(lastDose.time)}
                        </div>
                      </div>
                    )}

                    {isExpanded ? (
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="mb-1 text-xs text-gray-400">Dosage</div>
                          <div className="font-medium text-white">{peptide.dosage_range}</div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-gray-400">Frequency</div>
                          <div className="font-medium text-white">{peptide.frequency}</div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-gray-400">Route</div>
                          <div className="font-medium text-white">{peptide.administration_route}</div>
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-gray-400">Status</div>
                          <div className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            lastDose
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-gray-600 text-gray-300'
                          }`}>
                            {lastDose ? 'Active' : 'Not started'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-gray-700 px-2 py-1 text-gray-300">{peptide.dosage_range}</span>
                        <span className="rounded-full bg-gray-700 px-2 py-1 text-gray-300">{peptide.frequency}</span>
                      </div>
                    )}

                    <div className="mt-4 flex gap-2">
                      <Link
                        href={`/peptides/${peptide.id}`}
                        className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-gray-600 bg-gray-700 px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-gray-600"
                      >
                        View Details
                      </Link>
                      <Link
                        href={`/log-dose?peptide=${peptide.id}`}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 text-sm font-medium text-black transition-colors hover:from-cyan-400 hover:to-blue-400"
                      >
                        <PlusIcon className="h-4 w-4" />
                        Log Dose
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {peptidesList.length === 0 && !loading && !error && (
          <div className="text-center py-12">
            <BeakerIcon className="h-12 w-12 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-400">No peptides available</p>
          </div>
        )}

      </main>

      <BottomNav active="peptides" />
    </div>
  )
}
