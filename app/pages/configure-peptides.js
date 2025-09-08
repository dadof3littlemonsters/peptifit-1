import { useState, useEffect } from 'react'
import { peptides, auth } from '../lib/api'
import Link from 'next/link'
import { 
  ArrowLeftIcon, 
  PlusIcon,
  XMarkIcon,
  CheckIcon,
  BeakerIcon,
  ClockIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline'

export default function PeptideConfigurationWizard() {
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [userStack, setUserStack] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState('selection') // selection, configure, review
  const [configuringPeptide, setConfiguringPeptide] = useState(null)
  const [scheduleConfig, setScheduleConfig] = useState({
    frequency: 'weekly',
    customDays: [],
    doses: [{ amount: '', unit: 'mg', time: '08:00' }],
    notes: '',
    isActive: true
  })

  useEffect(() => {
    loadPeptides()
    loadUserStack()
  }, [])

  const loadPeptides = async () => {
    try {
      const peptidesData = await peptides.getAll()
      setAvailablePeptides(peptidesData)
    } catch (error) {
      console.error('Failed to load peptides:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadUserStack = async () => {
    // TODO: Load user's configured peptides from API
    // For now, using mock data
    setUserStack([])
  }

  const frequencyOptions = [
    { value: 'daily', label: 'Daily', description: 'Every day' },
    { value: 'bid', label: 'Twice Daily', description: 'Morning and evening' },
    { value: 'tid', label: 'Three Times Daily', description: 'Morning, afternoon, evening' },
    { value: 'weekly', label: 'Weekly', description: 'Once per week' },
    { value: 'custom-weekly', label: 'Custom Weekly', description: 'Multiple times per week' },
    { value: 'every-x-days', label: 'Every X Days', description: 'Every 2, 3, 4... days' },
    { value: 'as-needed', label: 'As Needed', description: 'PRN dosing' },
    { value: 'cycling', label: 'Cycling Protocol', description: 'Complex on/off patterns' }
  ]

  const daysOfWeek = [
    { short: 'Mon', full: 'Monday' },
    { short: 'Tue', full: 'Tuesday' },
    { short: 'Wed', full: 'Wednesday' },
    { short: 'Thu', full: 'Thursday' },
    { short: 'Fri', full: 'Friday' },
    { short: 'Sat', full: 'Saturday' },
    { short: 'Sun', full: 'Sunday' }
  ]

  const units = ['mg', 'mcg', 'IU', 'ml', 'units']

  const addToStack = (peptide) => {
    setConfiguringPeptide(peptide)
    setCurrentStep('configure')
    setScheduleConfig({
      frequency: peptide.name.toLowerCase().includes('tirzepatide') || peptide.name.toLowerCase().includes('retatrutide') ? 'weekly' : 'daily',
      customDays: [],
      doses: [{ amount: '', unit: 'mg', time: '08:00' }],
      notes: '',
      isActive: true
    })
  }

  const removeFromStack = (peptideId) => {
    setUserStack(prev => prev.filter(p => p.peptide_id !== peptideId))
  }

  const toggleCustomDay = (dayIndex) => {
    setScheduleConfig(prev => ({
      ...prev,
      customDays: prev.customDays.includes(dayIndex)
        ? prev.customDays.filter(d => d !== dayIndex)
        : [...prev.customDays, dayIndex].sort()
    }))
  }

  const updateDose = (index, field, value) => {
    setScheduleConfig(prev => ({
      ...prev,
      doses: prev.doses.map((dose, i) => 
        i === index ? { ...dose, [field]: value } : dose
      )
    }))
  }

  const addDoseSlot = () => {
    setScheduleConfig(prev => ({
      ...prev,
      doses: [...prev.doses, { amount: '', unit: 'mg', time: '08:00' }]
    }))
  }

  const removeDoseSlot = (index) => {
    if (scheduleConfig.doses.length > 1) {
      setScheduleConfig(prev => ({
        ...prev,
        doses: prev.doses.filter((_, i) => i !== index)
      }))
    }
  }

  const saveConfiguration = () => {
    const newStackItem = {
      peptide_id: configuringPeptide.id,
      peptide: configuringPeptide,
      schedule: { ...scheduleConfig },
      configured_at: new Date().toISOString()
    }
    
    setUserStack(prev => [...prev, newStackItem])
    setCurrentStep('selection')
    setConfiguringPeptide(null)
  }

  const isInStack = (peptideId) => {
    return userStack.some(item => item.peptide_id === peptideId)
  }

  const renderFrequencyConfig = () => {
    switch (scheduleConfig.frequency) {
      case 'daily':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Daily Doses</label>
              {scheduleConfig.doses.map((dose, index) => (
                <div key={index} className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Amount"
                      value={dose.amount}
                      onChange={(e) => updateDose(index, 'amount', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <select
                      value={dose.unit}
                      onChange={(e) => updateDose(index, 'unit', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    >
                      {units.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={dose.time}
                      onChange={(e) => updateDose(index, 'time', e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    />
                    {scheduleConfig.doses.length > 1 && (
                      <button
                        onClick={() => removeDoseSlot(index)}
                        className="p-2 text-red-400 hover:text-red-300"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={addDoseSlot}
                className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm"
              >
                <PlusIcon className="h-4 w-4" />
                Add another daily dose
              </button>
            </div>
          </div>
        )

      case 'weekly':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Weekly Dose</label>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Amount"
                    value={scheduleConfig.doses[0]?.amount || ''}
                    onChange={(e) => updateDose(0, 'amount', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <select
                    value={scheduleConfig.doses[0]?.unit || 'mg'}
                    onChange={(e) => updateDose(0, 'unit', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    {units.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={scheduleConfig.customDays[0] || 0}
                    onChange={(e) => setScheduleConfig(prev => ({ ...prev, customDays: [parseInt(e.target.value)] }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    {daysOfWeek.map((day, index) => (
                      <option key={index} value={index}>{day.full}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="time"
                    value={scheduleConfig.doses[0]?.time || '08:00'}
                    onChange={(e) => updateDose(0, 'time', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )

      case 'custom-weekly':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Select Days</label>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {daysOfWeek.map((day, index) => (
                  <button
                    key={index}
                    onClick={() => toggleCustomDay(index)}
                    className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                      scheduleConfig.customDays.includes(index)
                        ? 'bg-cyan-500 text-black'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {day.short}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Doses per Selected Day</label>
              {scheduleConfig.customDays.map((dayIndex, configIndex) => (
                <div key={dayIndex} className="mb-4 p-4 bg-gray-700 rounded-lg">
                  <h4 className="text-white font-medium mb-3">{daysOfWeek[dayIndex].full}</h4>
                  {scheduleConfig.doses.map((dose, doseIndex) => (
                    <div key={doseIndex} className="grid grid-cols-3 gap-3 mb-2">
                      <div>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Amount"
                          value={dose.amount}
                          onChange={(e) => updateDose(doseIndex, 'amount', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <select
                          value={dose.unit}
                          onChange={(e) => updateDose(doseIndex, 'unit', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white"
                        >
                          {units.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <input
                          type="time"
                          value={dose.time}
                          onChange={(e) => updateDose(doseIndex, 'time', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )

      case 'as-needed':
        return (
          <div className="space-y-4">
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
              <h4 className="text-yellow-400 font-medium mb-2">As Needed (PRN) Dosing</h4>
              <p className="text-gray-300 text-sm">Set maximum doses and timing restrictions for safety.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Standard Dose</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="0.1"
                  placeholder="Amount"
                  value={scheduleConfig.doses[0]?.amount || ''}
                  onChange={(e) => updateDose(0, 'amount', e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
                <select
                  value={scheduleConfig.doses[0]?.unit || 'mg'}
                  onChange={(e) => updateDose(0, 'unit', e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  {units.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Maximum per Day</label>
              <input
                type="number"
                min="1"
                placeholder="Max doses per day"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
          </div>
        )

      default:
        return (
          <div className="text-center py-8">
            <p className="text-gray-400">Select a frequency to configure dosing details</p>
          </div>
        )
    }
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
              <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-white">Configure Peptides</h1>
              <p className="text-gray-400 text-sm">
                {currentStep === 'selection' && 'Build your peptide stack'}
                {currentStep === 'configure' && `Configure ${configuringPeptide?.name}`}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-5 py-6">
        {/* Step: Peptide Selection */}
        {currentStep === 'selection' && (
          <div className="space-y-6">
            {/* User's Current Stack */}
            {userStack.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Your Stack</h2>
                <div className="space-y-3">
                  {userStack.map((item, index) => (
                    <div key={index} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-white font-medium">{item.peptide.name}</h3>
                          <p className="text-gray-400 text-sm">
                            {item.schedule.frequency === 'weekly' && 'Weekly'}
                            {item.schedule.frequency === 'daily' && 'Daily'}
                            {item.schedule.frequency === 'custom-weekly' && `${item.schedule.customDays.length}x per week`}
                            {item.schedule.frequency === 'as-needed' && 'As needed'}
                          </p>
                          <div className="flex gap-2 mt-2">
                            {item.schedule.doses.map((dose, i) => (
                              <span key={i} className="bg-purple-600 text-white px-2 py-1 rounded text-xs">
                                {dose.amount}{dose.unit}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromStack(item.peptide_id)}
                          className="p-2 text-gray-400 hover:text-red-400"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available Peptides */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">
                {userStack.length > 0 ? 'Add More Peptides' : 'Select Peptides for Your Stack'}
              </h2>
              <div className="space-y-3">
                {availablePeptides.map((peptide) => (
                  <div key={peptide.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <BeakerIcon className="h-5 w-5 text-cyan-400" />
                          <h3 className="text-white font-medium">{peptide.name}</h3>
                          {(peptide.name.toLowerCase().includes('tirzepatide') || 
                            peptide.name.toLowerCase().includes('retatrutide')) && (
                            <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs">GLP-1</span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm mb-2">{peptide.description}</p>
                        <div className="text-xs text-gray-500">
                          <p>Typical: {peptide.dosage_range} • {peptide.frequency}</p>
                        </div>
                      </div>
                      <div className="ml-4">
                        {isInStack(peptide.id) ? (
                          <div className="flex items-center gap-2 text-green-400 text-sm">
                            <CheckIcon className="h-4 w-4" />
                            Added
                          </div>
                        ) : (
                          <button
                            onClick={() => addToStack(peptide)}
                            className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Stack Button */}
            {userStack.length > 0 && (
              <div className="pt-4">
                <Link
                  href="/"
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 px-4 rounded-xl text-center block transition-colors"
                >
                  Save My Stack ({userStack.length} peptides)
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Step: Configure Individual Peptide */}
        {currentStep === 'configure' && configuringPeptide && (
          <div className="space-y-6">
            {/* Peptide Info */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <BeakerIcon className="h-6 w-6 text-cyan-400" />
                <h2 className="text-xl font-semibold text-white">{configuringPeptide.name}</h2>
              </div>
              <p className="text-gray-400 text-sm">{configuringPeptide.description}</p>
              <p className="text-gray-500 text-xs mt-2">
                Standard: {configuringPeptide.dosage_range} • {configuringPeptide.frequency}
              </p>
            </div>

            {/* Frequency Selection */}
            <div>
              <label className="block text-lg font-medium text-white mb-4">Dosing Frequency</label>
              <div className="space-y-2">
                {frequencyOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setScheduleConfig(prev => ({ ...prev, frequency: option.value }))}
                    className={`w-full p-4 rounded-xl border text-left transition-colors ${
                      scheduleConfig.frequency === option.value
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm opacity-70">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Frequency-Specific Configuration */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4">Dosing Details</h3>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                {renderFrequencyConfig()}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Notes (Optional)</label>
              <textarea
                value={scheduleConfig.notes}
                onChange={(e) => setScheduleConfig(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Protocol notes, doctor instructions, etc..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setCurrentStep('selection')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveConfiguration}
                disabled={!scheduleConfig.doses[0]?.amount}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-medium py-3 px-4 rounded-xl transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}