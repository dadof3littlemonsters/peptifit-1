import { useState, useEffect } from 'react'
import { peptides, peptideConfigs } from '../lib/api'
import Link from 'next/link'
import { 
  ArrowLeftIcon, 
  PlusIcon,
  XMarkIcon,
  CheckIcon,
  BeakerIcon,
  ClockIcon,
  CalendarDaysIcon,
  ExclamationCircleIcon,
  TrashIcon
} from '@heroicons/react/24/outline'

export default function PeptideConfigurationWizard() {
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [userStack, setUserStack] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [currentStep, setCurrentStep] = useState('selection') // selection, configure, review
  const [configuringPeptide, setConfiguringPeptide] = useState(null)
  const [editingConfigId, setEditingConfigId] = useState(null)
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

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || successMessage) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccessMessage(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, successMessage])

  const loadPeptides = async () => {
    try {
      setLoading(true)
      const peptidesData = await peptides.getAll()
      setAvailablePeptides(peptidesData)
    } catch (error) {
      console.error('Failed to load peptides:', error)
      setError('Failed to load available peptides. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const loadUserStack = async () => {
    try {
      setLoading(true)
      const configs = await peptideConfigs.getAll()
      // Transform API response (flat fields) to match the component's expected format
      const transformedStack = configs.map(config => ({
        id: config.id,
        peptide_id: config.peptide_id,
        peptide: {
          id: config.peptide_id,
          name: config.peptide_name,
          description: config.peptide_description,
          dosage_range: config.dosage_range,
          administration_route: config.administration_route,
          storage_requirements: config.storage_requirements
        },
        schedule: {
          frequency: config.frequency || 'weekly',
          customDays: config.custom_days || [],
          doses: config.doses || [{ amount: '', unit: 'mg', time: '08:00' }],
          everyXDays: config.every_x_days,
          cycleOnWeeks: config.cycle_config?.days_on ? Math.floor(config.cycle_config.days_on / 7) : null,
          cycleOffWeeks: config.cycle_config?.days_off ? Math.floor(config.cycle_config.days_off / 7) : null,
          notes: config.notes || '',
          isActive: config.is_active !== undefined ? config.is_active : true
        },
        configured_at: config.created_at,
        updated_at: config.updated_at
      }))
      setUserStack(transformedStack)
    } catch (err) {
      console.error('Error loading user stack:', err)
      setError('Failed to load your peptide configurations. Please refresh the page.')
    } finally {
      setLoading(false)
    }
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
    setEditingConfigId(null)
    setCurrentStep('configure')
    setScheduleConfig({
      frequency: peptide.name.toLowerCase().includes('tirzepatide') || peptide.name.toLowerCase().includes('retatrutide') ? 'weekly' : 'daily',
      customDays: [],
      doses: [{ amount: '', unit: 'mg', time: '08:00' }],
      notes: '',
      isActive: true
    })
  }

  const editStackItem = (stackItem) => {
    setConfiguringPeptide(stackItem.peptide)
    setEditingConfigId(stackItem.id)
    setCurrentStep('configure')
    setScheduleConfig({
      ...stackItem.schedule
    })
  }

  const removeFromStack = async (configId) => {
    if (!confirm('Are you sure you want to remove this peptide from your stack?')) {
      return
    }

    try {
      setSaving(true)
      await peptideConfigs.delete(configId)
      setUserStack(prev => prev.filter(p => p.id !== configId))
      setSuccessMessage('Peptide removed from your stack')
    } catch (err) {
      console.error('Error removing peptide:', err)
      setError('Failed to remove peptide. Please try again.')
    } finally {
      setSaving(false)
    }
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

  const saveConfiguration = async () => {
    if (!scheduleConfig.doses[0]?.amount) {
      setError('Please enter a dose amount')
      return
    }

    try {
      setSaving(true)
      setError(null)

      // Build flat config data to match backend API expectations
      const configData = {
        peptide_id: configuringPeptide.id,
        frequency: scheduleConfig.frequency,
        doses: scheduleConfig.doses,
        custom_days: scheduleConfig.customDays || [],
        every_x_days: scheduleConfig.everyXDays || null,
        cycle_config: scheduleConfig.frequency === 'cycling' && scheduleConfig.cycleOnWeeks && scheduleConfig.cycleOffWeeks
          ? { days_on: scheduleConfig.cycleOnWeeks * 7, days_off: scheduleConfig.cycleOffWeeks * 7 }
          : null,
        notes: scheduleConfig.notes || '',
        is_active: scheduleConfig.isActive !== undefined ? scheduleConfig.isActive : true
      }

      if (editingConfigId) {
        // Update existing config - backend returns { message }
        await peptideConfigs.update(editingConfigId, configData)
        // Update local state with the data we sent
        setUserStack(prev => prev.map(item =>
          item.id === editingConfigId
            ? {
                ...item,
                schedule: {
                  frequency: scheduleConfig.frequency,
                  customDays: scheduleConfig.customDays || [],
                  doses: scheduleConfig.doses,
                  everyXDays: scheduleConfig.everyXDays,
                  cycleOnWeeks: scheduleConfig.cycleOnWeeks,
                  cycleOffWeeks: scheduleConfig.cycleOffWeeks,
                  notes: scheduleConfig.notes,
                  isActive: scheduleConfig.isActive
                },
                updated_at: new Date().toISOString()
              }
            : item
        ))
        setSuccessMessage(`${configuringPeptide.name} configuration updated`)
      } else {
        // Create new config - backend returns { id, message }
        const savedConfig = await peptideConfigs.create(configData)
        // Build the new stack item using local data since backend only returns id
        const newStackItem = {
          id: savedConfig.id,
          peptide_id: configuringPeptide.id,
          peptide: configuringPeptide,
          schedule: {
            frequency: scheduleConfig.frequency,
            customDays: scheduleConfig.customDays || [],
            doses: scheduleConfig.doses,
            everyXDays: scheduleConfig.everyXDays,
            cycleOnWeeks: scheduleConfig.cycleOnWeeks,
            cycleOffWeeks: scheduleConfig.cycleOffWeeks,
            notes: scheduleConfig.notes,
            isActive: scheduleConfig.isActive
          },
          configured_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        setUserStack(prev => [...prev, newStackItem])
        setSuccessMessage(`${configuringPeptide.name} added to your stack`)
      }

      setCurrentStep('selection')
      setConfiguringPeptide(null)
      setEditingConfigId(null)
    } catch (err) {
      console.error('Error saving configuration:', err)
      setError(err.response?.data?.error || 'Failed to save configuration. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const isInStack = (peptideId) => {
    return userStack.some(item => item.peptide_id === peptideId)
  }

  const getStackItemForPeptide = (peptideId) => {
    return userStack.find(item => item.peptide_id === peptideId)
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

      case 'bid':
        return (
          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
              <p className="text-blue-400 text-sm">Twice daily dosing (BID) - Morning and Evening</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Morning Dose</label>
              <div className="grid grid-cols-3 gap-3 mb-3">
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
                <input
                  type="time"
                  value={scheduleConfig.doses[0]?.time || '08:00'}
                  onChange={(e) => updateDose(0, 'time', e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Evening Dose</label>
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  step="0.1"
                  placeholder="Amount"
                  value={scheduleConfig.doses[1]?.amount || ''}
                  onChange={(e) => updateDose(1, 'amount', e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
                <select
                  value={scheduleConfig.doses[1]?.unit || 'mg'}
                  onChange={(e) => updateDose(1, 'unit', e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  {units.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
                <input
                  type="time"
                  value={scheduleConfig.doses[1]?.time || '20:00'}
                  onChange={(e) => updateDose(1, 'time', e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
            </div>
          </div>
        )

      case 'tid':
        return (
          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
              <p className="text-blue-400 text-sm">Three times daily dosing (TID)</p>
            </div>
            {['Morning', 'Afternoon', 'Evening'].map((timeOfDay, index) => (
              <div key={index}>
                <label className="block text-sm font-medium text-gray-300 mb-2">{timeOfDay} Dose</label>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Amount"
                    value={scheduleConfig.doses[index]?.amount || ''}
                    onChange={(e) => updateDose(index, 'amount', e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                  <select
                    value={scheduleConfig.doses[index]?.unit || 'mg'}
                    onChange={(e) => updateDose(index, 'unit', e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    {units.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={scheduleConfig.doses[index]?.time || (index === 0 ? '08:00' : index === 1 ? '14:00' : '20:00')}
                    onChange={(e) => updateDose(index, 'time', e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
              </div>
            ))}
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
              {scheduleConfig.doses.map((dose, doseIndex) => (
                <div key={doseIndex} className="grid grid-cols-4 gap-3 mb-3">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Amount"
                    value={dose.amount}
                    onChange={(e) => updateDose(doseIndex, 'amount', e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                  <select
                    value={dose.unit}
                    onChange={(e) => updateDose(doseIndex, 'unit', e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    {units.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={dose.time}
                    onChange={(e) => updateDose(doseIndex, 'time', e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                  {scheduleConfig.doses.length > 1 && (
                    <button
                      onClick={() => removeDoseSlot(doseIndex)}
                      className="p-2 text-red-400 hover:text-red-300"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addDoseSlot}
                className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm"
              >
                <PlusIcon className="h-4 w-4" />
                Add another dose slot
              </button>
            </div>
          </div>
        )

      case 'every-x-days':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Every X Days</label>
              <input
                type="number"
                min="2"
                max="30"
                placeholder="Number of days"
                value={scheduleConfig.everyXDays || ''}
                onChange={(e) => setScheduleConfig(prev => ({ 
                  ...prev, 
                  everyXDays: parseInt(e.target.value) || 2 
                }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white mb-2"
              />
              <p className="text-gray-500 text-sm">e.g., Every 3 days</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Dose</label>
              <div className="grid grid-cols-3 gap-3">
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
                <input
                  type="time"
                  value={scheduleConfig.doses[0]?.time || '08:00'}
                  onChange={(e) => updateDose(0, 'time', e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
            </div>
          </div>
        )

      case 'cycling':
        return (
          <div className="space-y-4">
            <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4">
              <h4 className="text-purple-400 font-medium mb-2">Cycling Protocol</h4>
              <p className="text-gray-300 text-sm">Define on/off periods for your peptide cycle.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">On Period (weeks)</label>
                <input
                  type="number"
                  min="1"
                  max="52"
                  placeholder="Weeks on"
                  value={scheduleConfig.cycleOnWeeks || ''}
                  onChange={(e) => setScheduleConfig(prev => ({ 
                    ...prev, 
                    cycleOnWeeks: parseInt(e.target.value) || '' 
                  }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Off Period (weeks)</label>
                <input
                  type="number"
                  min="1"
                  max="52"
                  placeholder="Weeks off"
                  value={scheduleConfig.cycleOffWeeks || ''}
                  onChange={(e) => setScheduleConfig(prev => ({ 
                    ...prev, 
                    cycleOffWeeks: parseInt(e.target.value) || '' 
                  }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Dosing During On Period</label>
              <div className="grid grid-cols-3 gap-3">
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
                <select
                  value={scheduleConfig.cycleFrequency || 'daily'}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, cycleFrequency: e.target.value }))}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
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
                value={scheduleConfig.maxDailyDoses || ''}
                onChange={(e) => setScheduleConfig(prev => ({ 
                  ...prev, 
                  maxDailyDoses: parseInt(e.target.value) || '' 
                }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Minimum Hours Between Doses</label>
              <input
                type="number"
                min="1"
                max="24"
                placeholder="Hours"
                value={scheduleConfig.minHoursBetween || ''}
                onChange={(e) => setScheduleConfig(prev => ({ 
                  ...prev, 
                  minHoursBetween: parseInt(e.target.value) || '' 
                }))}
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

  if (loading && userStack.length === 0 && availablePeptides.length === 0) {
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
        {/* Error Message */}
        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-start gap-3">
            <ExclamationCircleIcon className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 bg-green-900/30 border border-green-700 rounded-xl p-4 flex items-start gap-3">
            <CheckIcon className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-green-200 text-sm">{successMessage}</p>
          </div>
        )}

        {/* Step: Peptide Selection */}
        {currentStep === 'selection' && (
          <div className="space-y-6">
            {/* User's Current Stack */}
            {userStack.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Your Stack ({userStack.length})</h2>
                <div className="space-y-3">
                  {userStack.map((item, index) => (
                    <div key={item.id || index} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-white font-medium">{item.peptide.name}</h3>
                          <p className="text-gray-400 text-sm">
                            {item.schedule.frequency === 'weekly' && 'Weekly'}
                            {item.schedule.frequency === 'daily' && 'Daily'}
                            {item.schedule.frequency === 'bid' && 'Twice Daily'}
                            {item.schedule.frequency === 'tid' && 'Three Times Daily'}
                            {item.schedule.frequency === 'custom-weekly' && `${item.schedule.customDays?.length || 0}x per week`}
                            {item.schedule.frequency === 'as-needed' && 'As needed'}
                            {item.schedule.frequency === 'every-x-days' && `Every ${item.schedule.everyXDays} days`}
                            {item.schedule.frequency === 'cycling' && 'Cycling Protocol'}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {item.schedule.doses?.map((dose, i) => (
                              dose.amount && (
                                <span key={i} className="bg-purple-600 text-white px-2 py-1 rounded text-xs">
                                  {dose.amount}{dose.unit} @{dose.time}
                                </span>
                              )
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => editStackItem(item)}
                            className="p-2 text-gray-400 hover:text-cyan-400"
                            title="Edit configuration"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => removeFromStack(item.id)}
                            className="p-2 text-gray-400 hover:text-red-400"
                            title="Remove from stack"
                            disabled={saving}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
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
                {availablePeptides.map((peptide) => {
                  const existingConfig = getStackItemForPeptide(peptide.id)
                  return (
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
                          {existingConfig ? (
                            <button
                              onClick={() => editStackItem(existingConfig)}
                              className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm"
                            >
                              <CheckIcon className="h-4 w-4" />
                              Edit
                            </button>
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
                  )
                })}
              </div>
            </div>

            {/* Save Stack Button */}
            {userStack.length > 0 && (
              <div className="pt-4">
                <Link
                  href="/"
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 px-4 rounded-xl text-center block transition-colors"
                >
                  Done - Back to Dashboard
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
                onClick={() => {
                  setCurrentStep('selection')
                  setConfiguringPeptide(null)
                  setEditingConfigId(null)
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={saveConfiguration}
                disabled={!scheduleConfig.doses[0]?.amount || saving}
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {saving && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                )}
                {editingConfigId ? 'Update' : 'Save'} Configuration
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}