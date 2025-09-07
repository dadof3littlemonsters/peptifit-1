import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { peptides, doses } from '../../lib/api'
import Link from 'next/link'
import { 
  ArrowLeftIcon, 
  BeakerIcon, 
  PlusIcon,
  ClockIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

export default function PeptideDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const [peptide, setPeptide] = useState(null)
  const [recentDoses, setRecentDoses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) {
      loadPeptideData()
    }
  }, [id])

  const loadPeptideData = async () => {
    try {
      const [peptideData, dosesData] = await Promise.all([
        peptides.getById(id),
        doses.getAll()
      ])
      
      setPeptide(peptideData)
      
      // Filter doses for this specific peptide
      const peptideDoses = dosesData.filter(dose => dose.peptide_id === id)
      setRecentDoses(peptideDoses.slice(0, 5)) // Show last 5 doses
      
    } catch (err) {
      setError('Failed to load peptide details')
      console.error('Error loading peptide:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading peptide details...</p>
        </div>
      </div>
    )
  }

  if (error || !peptide) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BeakerIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">{error || 'Peptide not found'}</p>
          <Link href="/peptides" className="text-primary-600 font-medium">
            Back to Peptides
          </Link>
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
            <Link href="/peptides" className="mr-4">
              <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">{peptide.name}</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Peptide Information */}
        <div className="card">
          <div className="flex items-start">
            <BeakerIcon className="h-8 w-8 text-primary-600 flex-shrink-0" />
            <div className="ml-4 flex-1">
              <h2 className="text-lg font-semibold text-gray-900">{peptide.name}</h2>
              <p className="text-gray-600 mt-2">{peptide.description}</p>
              
              <div className="mt-4 space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-700">Dosage Range</span>
                  <span className="text-sm text-gray-900">{peptide.dosage_range}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-700">Frequency</span>
                  <span className="text-sm text-gray-900">{peptide.frequency}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-700">Administration</span>
                  <span className="text-sm text-gray-900">{peptide.administration_route}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-medium text-gray-700">Storage</span>
                  <span className="text-sm text-gray-900">{peptide.storage_requirements}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action */}
        <div className="card">
          <Link 
            href={`/log-dose?peptide=${peptide.id}`}
            className="btn-primary inline-flex items-center justify-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Log Dose for {peptide.name}
          </Link>
        </div>

        {/* Recent Doses */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Doses</h3>
          
          {recentDoses.length === 0 ? (
            <div className="text-center py-8">
              <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 mb-2">No doses logged yet</p>
              <Link 
                href={`/log-dose?peptide=${peptide.id}`}
                className="text-primary-600 text-sm font-medium"
              >
                Log your first dose
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentDoses.map((dose) => (
                <div key={dose.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">
                      {dose.dose_amount}{dose.dose_unit}
                    </p>
                    {dose.injection_site && (
                      <p className="text-sm text-gray-600">{dose.injection_site}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      {formatDate(dose.administration_time)}
                    </p>
                  </div>
                </div>
              ))}
              
              {recentDoses.length >= 5 && (
                <div className="text-center pt-2">
                  <Link href="/doses" className="text-primary-600 text-sm font-medium">
                    View all doses
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Safety Information */}
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start">
            <InformationCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-1" />
            <div className="ml-3">
              <p className="text-sm text-blue-800">
                <strong>Important:</strong> This app is for tracking purposes only. 
                Always consult with your healthcare provider regarding peptide usage, 
                dosing, and any side effects.
              </p>
            </div>
          </div>
        </div>

        {/* Add padding for any fixed footer */}
        <div className="h-20"></div>
      </main>
    </div>
  )
}
