import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { peptides, peptideConfigs, peptideDoses } from '../lib/api'
import Link from 'next/link'
import BottomNav from '../components/BottomNav'
import { 
  ArrowLeftIcon, 
  CheckIcon, 
  BeakerIcon,
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline'

// Injection sites with body locations
const INJECTION_SITES = [
  { value: 'left_abdomen', label: 'Left Abdomen', icon: '🫃' },
  { value: 'right_abdomen', label: 'Right Abdomen', icon: '🫃' },
  { value: 'left_thigh', label: 'Left Thigh', icon: '🦵' },
  { value: 'right_thigh', label: 'Right Thigh', icon: '🦵' },
  { value: 'left_arm', label: 'Left Upper Arm', icon: '💪' },
  { value: 'right_arm', label: 'Right Upper Arm', icon: '💪' },
  { value: 'left_buttock', label: 'Left Buttock', icon: '🍑' },
  { value: 'right_buttock', label: 'Right Buttock', icon: '🍑' },
  { value: 'other', label: 'Other', icon: '📍' },
]

// Frequency display helpers
const getFrequencyLabel = (config) => {
  const { frequency, custom_days, interval_days } = config
  
  switch (frequency) {
    case 'daily':
      return 'daily'
    case 'bid':
      return 'twice daily'
    case 'tid':
      return 'three times daily'
    case 'weekly':
      return 'weekly'
    case 'custom-weekly':
      if (custom_days?.length > 0) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const dayNames = custom_days.map(d => days[d]).join(', ')
        return `on ${dayNames}`
      }
      return 'custom schedule'
    case 'every-x-days':
      return `every ${interval_days || 'X'} days`
    case 'as-needed':
      return 'as needed'
    default:
      return frequency
  }
}

// Get next scheduled day display
const getNextScheduledDisplay = (config) => {
  const { frequency, custom_days } = config
  const today = new Date().getDay() // 0 = Sunday
  
  if (frequency === 'weekly' && custom_days?.length > 0) {
    const scheduledDay = custom_days[0]
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `scheduled ${days[scheduledDay]}`
  }
  
  if (frequency === 'custom-weekly' && custom_days?.length > 0) {
    const nextDay = custom_days.find(d => d >= today) ?? custom_days[0]
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `next ${days[nextDay]}`
  }
  
  return getFrequencyLabel(config)
}

export default function LogDose() {
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [userConfigs, setUserConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [showManualForm, setShowManualForm] = useState(false)
  const [showAllPeptides, setShowAllPeptides] = useState(false)
  const [prefillApplied, setPrefillApplied] = useState(false)
  
  const router = useRouter()

  // Form state
  const [formData, setFormData] = useState({
    peptide_id: '',
    config_id: null,
    dose_amount: '',
    dose_unit: 'mg',
    administration_time: '',
    injection_site: '',
    notes: ''
  })

  // Initialize with current time
  useEffect(() => {
    const now = new Date()
    const localISOTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setFormData(prev => ({ ...prev, administration_time: localISOTime }))
    
    loadData()
  }, [])

  useEffect(() => {
    if (!router.isReady || loading || prefillApplied) return

    const peptideId = typeof router.query.peptide === 'string' ? router.query.peptide : ''
    const configId = typeof router.query.config === 'string' ? router.query.config : ''

    if (!peptideId && !configId) {
      setPrefillApplied(true)
      return
    }

    const matchedConfig = configId
      ? userConfigs.find((config) => config.id === configId)
      : userConfigs.find((config) => config.peptide_id === peptideId)

    if (matchedConfig) {
      handleQuickSelect(matchedConfig)
      setPrefillApplied(true)
      return
    }

    const matchedPeptide = availablePeptides.find((peptide) => peptide.id === peptideId)
    if (matchedPeptide) {
      handleManualPeptideSelect(matchedPeptide)
    }

    setPrefillApplied(true)
  }, [router.isReady, router.query.peptide, router.query.config, loading, prefillApplied, userConfigs, availablePeptides])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load user's peptide configs first
      const configsData = await peptideConfigs.getAll()
      setUserConfigs(configsData || [])
      
      // Also load all available peptides for manual selection
      const peptidesData = await peptides.getAll()
      setAvailablePeptides(peptidesData || [])
    } catch (err) {
      console.error('Failed to load data:', err)
      // 404 = no configs yet (empty state) — not a real error
      if (err?.response?.status !== 404) {
        setError('Failed to load your peptide configurations')
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle quick-select from configured peptide
  const handleQuickSelect = async (config) => {
    const peptide = config.peptide || availablePeptides.find(p => p.id === config.peptide_id)
    if (!peptide) return

    // Get suggested dose if available
    let suggestedDose = config.doses?.[0]
    
    try {
      const suggestion = await peptideConfigs.getSuggestedDose(config.id)
      if (suggestion?.suggested_dose) {
        suggestedDose = suggestion.suggested_dose
      }
    } catch (err) {
      // Use config doses as fallback
    }

    setFormData({
      peptide_id: config.peptide_id,
      config_id: config.id,
      dose_amount: suggestedDose?.amount || '',
      dose_unit: suggestedDose?.unit || 'mg',
      administration_time: formData.administration_time, // Keep current time
      injection_site: '',
      notes: ''
    })
    
    setShowManualForm(true)
    setShowAllPeptides(false)
    
    // Scroll to form
    setTimeout(() => {
      document.getElementById('dose-form')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  // Handle manual peptide selection (for non-configured peptides)
  const handleManualPeptideSelect = (peptide) => {
    setFormData({
      peptide_id: peptide.id,
      config_id: null,
      dose_amount: '',
      dose_unit: 'mg',
      administration_time: formData.administration_time,
      injection_site: '',
      notes: ''
    })
    setShowManualForm(true)
    setShowAllPeptides(false)
  }

  // Reset form to select different peptide
  const handleChangePeptide = () => {
    setFormData(prev => ({
      ...prev,
      peptide_id: '',
      config_id: null,
      dose_amount: '',
      dose_unit: 'mg',
      injection_site: '',
      notes: ''
    }))
    setShowManualForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      // Build payload - use peptideDoses endpoint
      const payload = {
        peptide_id: formData.peptide_id,
        config_id: formData.config_id,
        dose_amount: parseFloat(formData.dose_amount),
        dose_unit: formData.dose_unit,
        administration_time: formData.administration_time,
        injection_site: formData.injection_site || null,
        notes: formData.notes || null
      }

      await peptideDoses.create(payload)
      setSuccess(true)
      
      // Redirect after success
      setTimeout(() => {
        router.push('/schedule')
      }, 2000)
    } catch (err) {
      console.error('Failed to log dose:', err)
      setError(err.response?.data?.error || err.message || 'Failed to log dose. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  // Get selected peptide info
  const selectedPeptide = availablePeptides.find(p => p.id === formData.peptide_id)
  const selectedConfig = userConfigs.find(c => c.id === formData.config_id)

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading your peptides...</p>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckIcon className="h-10 w-10 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">Dose Logged!</h2>
          <p className="text-gray-400 mb-6">
            {selectedPeptide?.name} {formData.dose_amount}{formData.dose_unit} recorded successfully.
          </p>
          <p className="text-gray-500 text-sm">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] min-h-screen flex flex-col overflow-hidden bg-black">
      {/* Header */}
      <header className="h-14 flex-shrink-0 border-b border-gray-800 bg-black">
        <div className="mx-auto flex h-full max-w-md items-center px-4">
          <div className="flex items-center">
            <Link href="/" className="mr-3 flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-gray-900">
              <ArrowLeftIcon className="h-6 w-6 text-gray-400" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Log Dose</h1>
              <p className="text-gray-500 text-sm">
                {showManualForm && selectedPeptide 
                  ? selectedPeptide.name 
                  : 'Select a peptide to log'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-content mx-auto flex-1 min-h-0 overflow-y-auto max-w-md px-4 py-4 pb-[calc(104px+env(safe-area-inset-bottom))]">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <ExclamationCircleIcon className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Step 1: Quick Select from Configured Peptides */}
        {!showManualForm && userConfigs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-cyan-400" />
              Your Configured Peptides
            </h2>
            <div className="space-y-3">
              {userConfigs.map((config) => {
                const peptide = config.peptide || availablePeptides.find(p => p.id === config.peptide_id)
                if (!peptide) return null
                
                const dose = config.doses?.[0]
                const scheduleDisplay = getNextScheduledDisplay(config)
                
                return (
                  <button
                    key={config.id}
                    onClick={() => handleQuickSelect(config)}
                    className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-cyan-500/50 rounded-xl p-4 text-left transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <BeakerIcon className="h-5 w-5 text-cyan-400" />
                          <span className="text-white font-medium">{peptide.name}</span>
                          {dose && (
                            <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded text-xs font-medium">
                              {dose.amount}{dose.unit}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm">
                          {scheduleDisplay}
                        </p>
                      </div>
                      <div className="ml-3">
                        <span className="text-cyan-400 text-sm font-medium group-hover:underline">
                          Log →
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 2: Custom Dose Option */}
        {!showManualForm && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <PlusIcon className="h-5 w-5 text-gray-400" />
                Custom Dose
              </h2>
              <button
                onClick={() => setShowAllPeptides(!showAllPeptides)}
                className="text-cyan-400 text-sm flex items-center gap-1 hover:text-cyan-300"
              >
                {showAllPeptides ? 'Hide' : 'Show all peptides'}
                {showAllPeptides ? (
                  <ChevronUpIcon className="h-4 w-4" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4" />
                )}
              </button>
            </div>
            
            {!showAllPeptides ? (
              <button
                onClick={() => setShowAllPeptides(true)}
                className="w-full bg-gray-800/50 border border-dashed border-gray-600 hover:border-cyan-500/50 rounded-xl p-4 text-center transition-colors"
              >
                <PlusIcon className="h-6 w-6 text-gray-500 mx-auto mb-2" />
                <span className="text-gray-400">Log a different peptide or custom dose</span>
              </button>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {availablePeptides
                  .filter(p => !userConfigs.some(c => c.peptide_id === p.id))
                  .map((peptide) => (
                    <button
                      key={peptide.id}
                      onClick={() => handleManualPeptideSelect(peptide)}
                      className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-xl p-3 text-left transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <BeakerIcon className="h-5 w-5 text-gray-500" />
                        <div className="flex-1">
                          <span className="text-white font-medium">{peptide.name}</span>
                          <p className="text-gray-500 text-xs">{peptide.dosage_range}</p>
                        </div>
                        <span className="text-cyan-400 text-sm">Select →</span>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Dose Form */}
        {showManualForm && (
          <div id="dose-form" className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {/* Form Header */}
            <div className="bg-gray-750 border-b border-gray-700 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                    <BeakerIcon className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">{selectedPeptide?.name}</h3>
                    {selectedConfig && (
                      <p className="text-gray-400 text-xs">From your configuration</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleChangePeptide}
                  className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-5 space-y-6">
              {/* Dose Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Dose Amount <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <input
                      type="number"
                      name="dose_amount"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={formData.dose_amount}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-base text-white placeholder-gray-500 outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <select
                      name="dose_unit"
                      value={formData.dose_unit}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-base text-white outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value="mg">mg</option>
                      <option value="mcg">mcg</option>
                      <option value="IU">IU</option>
                      <option value="ml">ml</option>
                      <option value="units">units</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Administration Time */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <span className="flex items-center gap-2">
                    <ClockIcon className="h-4 w-4 text-gray-500" />
                    Administration Time <span className="text-red-400">*</span>
                  </span>
                </label>
                <input
                  type="datetime-local"
                  name="administration_time"
                  required
                  value={formData.administration_time}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-base text-white outline-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Injection Site */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  <span className="flex items-center gap-2">
                    <MapPinIcon className="h-4 w-4 text-gray-500" />
                    Injection Site
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {INJECTION_SITES.map((site) => (
                    <button
                      key={site.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, injection_site: site.value }))}
                      className={`flex min-h-12 items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                        formData.injection_site === site.value
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <span>{site.icon}</span>
                      <span className="truncate">{site.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Any notes about this dose..."
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-base text-white placeholder-gray-500 outline-none resize-none transition-colors focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !formData.dose_amount}
                  className={`w-full py-4 px-6 rounded-xl font-semibold text-black transition-all ${
                    submitting || !formData.dose_amount
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98]'
                  }`}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Logging Dose...
                    </span>
                  ) : (
                    `Log ${selectedPeptide?.name || 'Dose'}`
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Empty State - No configs */}
        {!loading && userConfigs.length === 0 && !showManualForm && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <BeakerIcon className="h-8 w-8 text-gray-600" />
            </div>
            <h3 className="text-white font-medium mb-2">No Peptides Configured</h3>
            <p className="text-gray-400 text-sm mb-6">
              Configure your peptides first to see quick-select options here.
            </p>
            <Link
              href="/configure-peptides"
              className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-3 rounded-xl font-medium transition-colors"
            >
              <PlusIcon className="h-5 w-5" />
              Configure Peptides
            </Link>
          </div>
        )}
      </main>

      <BottomNav active="peptides" />
    </div>
  )
}
