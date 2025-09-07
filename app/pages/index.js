import { useState, useEffect } from 'react'
import { auth, doses, peptides } from '../lib/api'
import Link from 'next/link'
import { 
  PlusIcon, 
  BeakerIcon, 
  ClockIcon, 
  UserIcon,
  CalendarDaysIcon 
} from '@heroicons/react/24/outline'

export default function Dashboard({ user }) {
  const [recentDoses, setRecentDoses] = useState([])
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const [dosesData, peptidesData] = await Promise.all([
        doses.getRecent(),
        peptides.getAll()
      ])
      setRecentDoses(dosesData)
      setAvailablePeptides(peptidesData)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
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
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary-600">PeptiFit</h1>
              <p className="text-gray-600">Welcome back, {user?.username}</p>
            </div>
            <button
              onClick={auth.logout}
              className="p-2 text-gray-600 hover:text-gray-800"
            >
              <UserIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Quick Actions */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/log-dose" className="btn-primary">
              <PlusIcon className="h-5 w-5 inline mr-2" />
              Log Dose
            </Link>
            <Link href="/peptides" className="btn-secondary">
              <BeakerIcon className="h-5 w-5 inline mr-2" />
              Peptides
            </Link>
          </div>
        </div>

        {/* Recent Doses */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Doses</h2>
            <Link href="/doses" className="text-primary-600 text-sm font-medium">
              View All
            </Link>
          </div>
          
          {recentDoses.length === 0 ? (
            <div className="text-center py-8">
              <BeakerIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No doses logged yet</p>
              <Link href="/log-dose" className="text-primary-600 text-sm font-medium mt-2 inline-block">
                Log your first dose
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentDoses.slice(0, 3).map((dose) => (
                <div key={dose.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{dose.peptide_name}</p>
                    <p className="text-sm text-gray-600">
                      {dose.dose_amount}{dose.dose_unit}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      <ClockIcon className="h-4 w-4 inline mr-1" />
                      {formatDate(dose.administration_time)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Peptides */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Peptides</h2>
          <div className="grid grid-cols-2 gap-3">
            {availablePeptides.map((peptide) => (
              <Link
                key={peptide.id}
                href={`/peptides/${peptide.id}`}
                className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                <div className="text-center">
                  <BeakerIcon className="h-8 w-8 text-primary-600 mx-auto mb-2" />
                  <p className="font-medium text-gray-900 text-sm">{peptide.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{peptide.frequency}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2">
          <div className="max-w-md mx-auto">
            <div className="flex justify-around">
              <Link href="/" className="nav-item flex-col">
                <div className="p-2">
                  <CalendarDaysIcon className="h-6 w-6 text-primary-600 mx-auto" />
                  <span className="text-xs text-primary-600 mt-1">Dashboard</span>
                </div>
              </Link>
              <Link href="/log-dose" className="nav-item flex-col">
                <div className="p-2">
                  <PlusIcon className="h-6 w-6 text-gray-600 mx-auto" />
                  <span className="text-xs text-gray-600 mt-1">Log Dose</span>
                </div>
              </Link>
              <Link href="/peptides" className="nav-item flex-col">
                <div className="p-2">
                  <BeakerIcon className="h-6 w-6 text-gray-600 mx-auto" />
                  <span className="text-xs text-gray-600 mt-1">Peptides</span>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Add padding to account for fixed footer */}
        <div className="h-20"></div>
      </main>
    </div>
  )
}
