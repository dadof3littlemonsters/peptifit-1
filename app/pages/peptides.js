import { useState, useEffect } from 'react'
import { peptides, doses } from '../lib/api'
import Link from 'next/link'
import { ArrowLeftIcon, BeakerIcon, PlusIcon } from '@heroicons/react/24/outline'

export default function PeptidesPage() {
  const [peptidesList, setPeptidesList] = useState([])
  const [recentDoses, setRecentDoses] = useState([])
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
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-black border-b border-gray-800">
        <div className="max-w-md mx-auto px-5 py-5">
          <div className="flex items-center">
            <Link href="/" className="mr-4">
              <ArrowLeftIcon className="h-6 w-6 text-gray-400 hover:text-white transition-colors" />
            </Link>
            <h1 className="text-xl font-semibold text-white">Peptides Library</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-5 py-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {peptidesList.map((peptide) => {
            const lastDose = getLastDoseInfo(peptide.id)
            return (
              <div
                key={peptide.id}
                className="bg-gray-800 rounded-2xl p-5 border border-gray-700 hover:border-gray-600 transition-all hover:-translate-y-1 shadow-lg hover:shadow-xl"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start flex-1">
                    <div className="flex-shrink-0">
                      <BeakerIcon className="h-8 w-8 text-cyan-400" />
                    </div>
                    <div className="ml-4 flex-1">
                      <h3 className="text-lg font-semibold text-white">{peptide.name}</h3>
                      <p className="text-gray-400 text-sm mt-1">{peptide.description}</p>
                      
                      {/* Last Dose Info */}
                      {lastDose && (
                        <div className="mt-3 p-3 bg-gray-700/50 rounded-xl border border-gray-600/50">
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              <span className="text-cyan-400 font-medium">Last dose: </span>
                              <span className="text-white">{lastDose.amount}{lastDose.unit}</span>
                            </div>
                            <div className="text-xs text-gray-400">
                              {formatTimeAgo(lastDose.time)}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Peptide Details */}
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Dosage</div>
                          <div className="text-white font-medium">{peptide.dosage_range}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Frequency</div>
                          <div className="text-white font-medium">{peptide.frequency}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Route</div>
                          <div className="text-white font-medium">{peptide.administration_route}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Status</div>
                          <div className={`text-xs font-medium px-2 py-1 rounded-full ${
                            lastDose 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-gray-600 text-gray-300'
                          }`}>
                            {lastDose ? 'Active' : 'Not started'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-3 mt-4">
                  <Link
                    href={`/peptides/${peptide.id}`}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-xl text-center transition-colors border border-gray-600"
                  >
                    View Details
                  </Link>
                  <Link
                    href={`/log-dose?peptide=${peptide.id}`}
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Log Dose
                  </Link>
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

        {/* Add padding for fixed footer */}
        <div className="h-20"></div>
      </main>
    </div>
  )
}
