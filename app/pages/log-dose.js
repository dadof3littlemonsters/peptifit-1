import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { doses, peptides } from '../lib/api'
import Link from 'next/link'
import { ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline'

export default function LogDose() {
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [formData, setFormData] = useState({
    peptide_id: '',
    dose_amount: '',
    dose_unit: 'mg',
    administration_time: '',
    injection_site: '',
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    loadPeptides()
    // Set current time as default
    const now = new Date()
    const localISOTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setFormData(prev => ({ ...prev, administration_time: localISOTime }))
  }, [])

  const loadPeptides = async () => {
    try {
      const peptidesData = await peptides.getAll()
      setAvailablePeptides(peptidesData)
    } catch (error) {
      console.error('Failed to load peptides:', error)
      setError('Failed to load peptides')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await doses.create(formData)
      setSuccess(true)
      
      // Reset form after success
      setTimeout(() => {
        router.push('/')
      }, 2000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log dose')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckIcon className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Dose Logged Successfully!</h2>
          <p className="text-gray-600">Redirecting to dashboard...</p>
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
            <h1 className="text-xl font-semibold text-gray-900">Log Dose</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6">
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Peptide Selection */}
            <div>
              <label htmlFor="peptide_id" className="block text-sm font-medium text-gray-700 mb-2">
                Peptide *
              </label>
              <select
                id="peptide_id"
                name="peptide_id"
                required
                className="input-field"
                value={formData.peptide_id}
                onChange={handleChange}
              >
                <option value="">Select a peptide</option>
                {availablePeptides.map((peptide) => (
                  <option key={peptide.id} value={peptide.id}>
                    {peptide.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Dose Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="dose_amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Dose Amount *
                </label>
                <input
                  id="dose_amount"
                  name="dose_amount"
                  type="number"
                  step="0.1"
                  required
                  className="input-field"
                  placeholder="2.5"
                  value={formData.dose_amount}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label htmlFor="dose_unit" className="block text-sm font-medium text-gray-700 mb-2">
                  Unit *
                </label>
                <select
                  id="dose_unit"
                  name="dose_unit"
                  required
                  className="input-field"
                  value={formData.dose_unit}
                  onChange={handleChange}
                >
                  <option value="mg">mg</option>
                  <option value="mcg">mcg</option>
                  <option value="IU">IU</option>
                  <option value="ml">ml</option>
                </select>
              </div>
            </div>

            {/* Administration Time */}
            <div>
              <label htmlFor="administration_time" className="block text-sm font-medium text-gray-700 mb-2">
                Administration Time *
              </label>
              <input
                id="administration_time"
                name="administration_time"
                type="datetime-local"
                required
                className="input-field"
                value={formData.administration_time}
                onChange={handleChange}
              />
            </div>

            {/* Injection Site */}
            <div>
              <label htmlFor="injection_site" className="block text-sm font-medium text-gray-700 mb-2">
                Injection Site
              </label>
              <select
                id="injection_site"
                name="injection_site"
                className="input-field"
                value={formData.injection_site}
                onChange={handleChange}
              >
                <option value="">Select injection site</option>
                <option value="abdomen">Abdomen</option>
                <option value="thigh">Thigh</option>
                <option value="upper_arm">Upper Arm</option>
                <option value="buttocks">Buttocks</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="input-field resize-none"
                placeholder="Any notes about this dose..."
                value={formData.notes}
                onChange={handleChange}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`btn-primary ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? 'Logging Dose...' : 'Log Dose'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
