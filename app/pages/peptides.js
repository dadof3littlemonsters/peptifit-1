import { useState, useEffect } from 'react'
import { peptides } from '../lib/api'
import Link from 'next/link'
import { ArrowLeftIcon, BeakerIcon } from '@heroicons/react/24/outline'

export default function PeptidesPage() {
  const [peptidesList, setPeptidesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPeptides()
  }, [])

  const loadPeptides = async () => {
    try {
      const data = await peptides.getAll()
      setPeptidesList(data)
    } catch (err) {
      setError('Failed to load peptides')
      console.error('Error loading peptides:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading peptides...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center">
            <Link href="/" className="mr-4">
              <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Peptides Library</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {peptidesList.map((peptide) => (
            <Link
              key={peptide.id}
              href={`/peptides/${peptide.id}`}
              className="block"
            >
              <div className="card hover:shadow-md transition-shadow">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <BeakerIcon className="h-8 w-8 text-primary-600" />
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{peptide.name}</h3>
                    <p className="text-gray-600 text-sm mt-1">{peptide.description}</p>
                    <div className="mt-3 space-y-1">
                      <p className="text-sm text-gray-500">
                        <span className="font-medium">Dosage:</span> {peptide.dosage_range}
                      </p>
                      <p className="text-sm text-gray-500">
                        <span className="font-medium">Frequency:</span> {peptide.frequency}
                      </p>
                      <p className="text-sm text-gray-500">
                        <span className="font-medium">Route:</span> {peptide.administration_route}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {peptidesList.length === 0 && !loading && !error && (
          <div className="text-center py-12">
            <BeakerIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No peptides available</p>
          </div>
        )}

        {/* Add padding for fixed footer */}
        <div className="h-20"></div>
      </main>
    </div>
  )
}
