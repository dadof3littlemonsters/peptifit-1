import { useState, useEffect, useCallback, useRef } from 'react'
import { ai, supplements } from '../lib/api'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import BottomNav from '../components/BottomNav'
import CameraCapturePanel from '../components/CameraCapturePanel'
import { 
  ArrowLeftIcon, 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

// Days of week for schedule display
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Frequency options
const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'twice_daily', label: 'Twice Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
  { value: 'weekends', label: 'Weekends (Sat-Sun)' },
  { value: 'custom', label: 'Custom Days' }
]

// Time of day options
const TIME_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'with_breakfast', label: 'With Breakfast' },
  { value: 'before_lunch', label: 'Before Lunch' },
  { value: 'with_lunch', label: 'With Lunch' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'with_dinner', label: 'With Dinner' },
  { value: 'evening', label: 'Evening' },
  { value: 'before_bed', label: 'Before Bed' },
  { value: 'anytime', label: 'Anytime' }
]

const BarcodeScanner = dynamic(() => import('../components/BarcodeScanner'), {
  ssr: false
})

function getAiScanErrorMessage(error, fallbackMessage) {
  if (error?.response?.status === 504) {
    return 'Label analysis timed out. Try a closer photo with just the label.'
  }

  return error?.response?.data?.error || error?.message || fallbackMessage
}

function getScheduledDoseCount(frequency) {
  if (frequency === 'twice_daily') {
    return 2
  }

  return 1
}

function parseTimeOfDayValue(timeOfDay) {
  const parts = String(timeOfDay || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)

  return {
    primary: parts[0] || 'morning',
    secondary: parts[1] || 'evening'
  }
}

function buildTimeOfDayValue(frequency, primaryTime, secondaryTime) {
  if (frequency === 'twice_daily') {
    return `${primaryTime || 'morning'}|${secondaryTime || 'evening'}`
  }

  return primaryTime || 'morning'
}

function formatTimeOfDayLabel(timeOfDay) {
  const { primary, secondary } = parseTimeOfDayValue(timeOfDay)
  const formatPart = (value) => value.replaceAll('_', ' ')

  if (String(timeOfDay || '').includes('|')) {
    return `${formatPart(primary)} + ${formatPart(secondary)}`
  }

  return formatPart(primary)
}

export default function SupplementsPage() {
  const supplementScanRequestIdRef = useRef(0)
  const [supplementsList, setSupplementsList] = useState([])
  const [supplementLogs, setSupplementLogs] = useState({})
  const [inventory, setInventory] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('today') // 'today', 'inventory', 'history'
  
  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingSupplement, setEditingSupplement] = useState(null)
  const [entryMode, setEntryMode] = useState('manual')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogResults, setCatalogResults] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [barcodeLookupLoading, setBarcodeLookupLoading] = useState(false)
  const [barcodeError, setBarcodeError] = useState('')
  const [barcodeNotFound, setBarcodeNotFound] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanCaptured, setScanCaptured] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    dose_amount: '',
    dose_unit: 'capsules',
    servings_per_container: '',
    remaining_servings: '',
    frequency: 'daily',
    custom_days: [],
    time_of_day: 'morning',
    second_time_of_day: 'evening',
    reorder_threshold: 7,
    notes: ''
  })

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!showForm || entryMode !== 'search' || catalogQuery.trim().length < 2) {
      if (!catalogQuery.trim()) {
        setCatalogResults([])
        setCatalogError('')
      }
      return undefined
    }

    const timeoutId = setTimeout(async () => {
      setCatalogLoading(true)
      setCatalogError('')

      try {
        const response = await supplements.searchCatalog(catalogQuery.trim())
        setCatalogResults(response.results || [])
      } catch (catalogFailure) {
        setCatalogResults([])
        setCatalogError(catalogFailure.response?.data?.error || 'Search failed')
      } finally {
        setCatalogLoading(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [showForm, entryMode, catalogQuery])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await supplements.getAll()
      setSupplementsList(data)
      
      // Load inventory from localStorage (since backend doesn't have inventory fields)
      const savedInventory = localStorage.getItem('peptifit_supplement_inventory')
      if (savedInventory) {
        setInventory(JSON.parse(savedInventory))
      }
      
      // Load logs for all supplements
      const logsData = {}
      for (const supp of data) {
        try {
          const logs = await supplements.getLogs(supp.id, { limit: 100 })
          logsData[supp.id] = logs
        } catch (err) {
          console.error(`Failed to load logs for ${supp.id}:`, err)
        }
      }
      setSupplementLogs(logsData)
    } catch (err) {
      setError('Failed to load supplements')
      console.error('Error loading supplements:', err)
    } finally {
      setLoading(false)
    }
  }

  // Save inventory to localStorage
  const saveInventory = useCallback((newInventory) => {
    setInventory(newInventory)
    localStorage.setItem('peptifit_supplement_inventory', JSON.stringify(newInventory))
  }, [])

  // Initialize inventory for a supplement
  const initializeInventory = (supplementId, servingsPerContainer) => {
    const newInventory = {
      ...inventory,
      [supplementId]: {
        servingsPerContainer: parseInt(servingsPerContainer) || 30,
        remainingServings: parseInt(servingsPerContainer) || 30,
        reorderThreshold: 7,
        lastPurchased: new Date().toISOString()
      }
    }
    saveInventory(newInventory)
  }

  // Get inventory status for a supplement
  const getInventoryStatus = (supplementId) => {
    const inv = inventory[supplementId]
    if (!inv) return { status: 'unknown', daysRemaining: null, color: 'gray' }
    
    const daysRemaining = inv.remainingServings
    
    if (daysRemaining <= 3) {
      return { status: 'critical', daysRemaining, color: 'red' }
    } else if (daysRemaining <= 7) {
      return { status: 'warning', daysRemaining, color: 'yellow' }
    } else {
      return { status: 'good', daysRemaining, color: 'green' }
    }
  }

  // Check if supplement is scheduled for today
  const isScheduledForToday = (supplement) => {
    const today = new Date().getDay()
    const freq = supplement.frequency || 'daily'
    
    if (freq === 'daily') return true
    if (freq === 'twice_daily') return true
    if (freq === 'weekly') {
      // For weekly, check if taken this week
      const logs = supplementLogs[supplement.id] || []
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      return !logs.some(log => new Date(log.taken_at) > weekAgo)
    }
    if (freq === 'weekdays') return today >= 1 && today <= 5
    if (freq === 'weekends') return today === 0 || today === 6
    if (freq === 'custom') {
      const customDays = inventory[supplement.id]?.customDays || []
      return customDays.includes(today)
    }
    return true
  }

  // Check if dose was taken today
  const isTakenToday = (supplementId) => {
    return getTakenDoseCountToday(supplementId) >= getScheduledDoseCount(
      supplementsList.find((supplement) => supplement.id === supplementId)?.frequency || 'daily'
    )
  }

  const getTakenDoseCountToday = (supplementId) => {
    const logs = supplementLogs[supplementId] || []
    const today = new Date().toDateString()
    return logs.filter((log) => new Date(log.taken_at).toDateString() === today).length
  }

  const getLatestTodayLog = (supplementId) => {
    const logs = supplementLogs[supplementId] || []
    const today = new Date().toDateString()
    return logs.find((log) => new Date(log.taken_at).toDateString() === today) || null
  }

  const getTodaySummary = () => {
    const todaysSupplements = getTodaysSupplements()

    return todaysSupplements.reduce((summary, supplement) => {
      const scheduled = getScheduledDoseCount(supplement.frequency || 'daily')
      const taken = Math.min(getTakenDoseCountToday(supplement.id), scheduled)

      return {
        taken: summary.taken + taken,
        scheduled: summary.scheduled + scheduled
      }
    }, { taken: 0, scheduled: 0 })
  }

  // Get weekly adherence stats
  const getWeeklyStats = (supplementId) => {
    const logs = supplementLogs[supplementId] || []
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    
    let scheduledDoses = 0
    let takenDoses = 0
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + i)
      
      // Check if scheduled for this day
      const isScheduled = isScheduledForDate(supplementId, date)
      if (isScheduled) {
        const supplement = supplementsList.find((item) => item.id === supplementId)
        const scheduledForDay = getScheduledDoseCount(supplement?.frequency || 'daily')
        const takenForDay = logs.filter((log) =>
          new Date(log.taken_at).toDateString() === date.toDateString()
        ).length

        scheduledDoses += scheduledForDay
        takenDoses += Math.min(takenForDay, scheduledForDay)
      }
    }
    
    const adherence = scheduledDoses > 0
      ? Math.round((takenDoses / scheduledDoses) * 100)
      : 0
    
    return { taken: takenDoses, scheduled: scheduledDoses, adherence }
  }

  // Helper to check if scheduled for a specific date
  const isScheduledForDate = (supplementId, date) => {
    const supplement = supplementsList.find(s => s.id === supplementId)
    if (!supplement) return false
    
    const dayOfWeek = date.getDay()
    const freq = supplement.frequency || 'daily'
    
    if (freq === 'daily') return true
    if (freq === 'twice_daily') return true
    if (freq === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5
    if (freq === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6
    if (freq === 'custom') {
      const customDays = inventory[supplementId]?.customDays || []
      return customDays.includes(dayOfWeek)
    }
    return true
  }

  // Handle logging a dose
  const handleLogDose = async (supplement) => {
    try {
      const doseData = {
        dose_amount: supplement.dose_amount || 1,
        dose_unit: supplement.dose_unit || 'capsule',
        taken_at: new Date().toISOString()
      }
      
      await supplements.logDose(supplement.id, doseData)
      
      // Decrement inventory
      const inv = inventory[supplement.id]
      if (inv && inv.remainingServings > 0) {
        const newInventory = {
          ...inventory,
          [supplement.id]: {
            ...inv,
            remainingServings: inv.remainingServings - 1
          }
        }
        saveInventory(newInventory)
      }
      
      // Refresh logs
      const logs = await supplements.getLogs(supplement.id, { limit: 100 })
      setSupplementLogs(prev => ({ ...prev, [supplement.id]: logs }))
    } catch (err) {
      setError('Failed to log dose')
      console.error('Error logging dose:', err)
    }
  }

  const handleUndoDose = async (supplement) => {
    const latestLog = getLatestTodayLog(supplement.id)

    if (!latestLog) {
      return
    }

    try {
      await supplements.deleteLog(supplement.id, latestLog.id)

      const inv = inventory[supplement.id]
      if (inv) {
        const maxServings = inv.servingsPerContainer || inv.remainingServings || 0
        const newInventory = {
          ...inventory,
          [supplement.id]: {
            ...inv,
            remainingServings: Math.min(maxServings, (inv.remainingServings || 0) + 1)
          }
        }
        saveInventory(newInventory)
      }

      const logs = await supplements.getLogs(supplement.id, { limit: 100 })
      setSupplementLogs((prev) => ({ ...prev, [supplement.id]: logs }))
    } catch (err) {
      setError('Failed to undo dose')
      console.error('Error undoing dose:', err)
    }
  }

  // Handle adding/editing supplement
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const supplementData = {
      name: formData.name,
      brand: formData.brand,
      dosage: formData.dose_amount ? `${formData.dose_amount} ${formData.dose_unit}` : '',
      dose_amount: parseFloat(formData.dose_amount) || 1,
      dose_unit: formData.dose_unit,
      servings_per_container: parseInt(formData.servings_per_container, 10) || null,
      frequency: formData.frequency,
      time_of_day: buildTimeOfDayValue(formData.frequency, formData.time_of_day, formData.second_time_of_day),
      notes: formData.notes
    }
    
    try {
      if (editingSupplement) {
        await supplements.update(editingSupplement.id, supplementData)
        
        // Update inventory
        const newInventory = {
          ...inventory,
          [editingSupplement.id]: {
            ...inventory[editingSupplement.id],
            servingsPerContainer: parseInt(formData.servings_per_container) || 30,
            remainingServings: parseInt(formData.remaining_servings) || parseInt(formData.servings_per_container) || 30,
            reorderThreshold: parseInt(formData.reorder_threshold) || 7,
            customDays: formData.frequency === 'custom' ? formData.custom_days : []
          }
        }
        saveInventory(newInventory)
      } else {
        const result = await supplements.create(supplementData)
        
        // Initialize inventory for new supplement
        if (result.id) {
          initializeInventory(result.id, formData.servings_per_container)
          
          // Set custom days if needed
          if (formData.frequency === 'custom') {
            const newInventory = {
              ...inventory,
              [result.id]: {
                ...inventory[result.id],
                customDays: formData.custom_days
              }
            }
            saveInventory(newInventory)
          }
        }
      }
      
      // Reset form and reload
      setShowForm(false)
      setEditingSupplement(null)
      setEntryMode('manual')
      supplementScanRequestIdRef.current += 1
      setScanLoading(false)
      setScanError('')
      setScanCaptured('')
      setFormData({
        name: '',
        brand: '',
        dose_amount: '',
        dose_unit: 'capsules',
        servings_per_container: '',
        remaining_servings: '',
        frequency: 'daily',
        custom_days: [],
        time_of_day: 'morning',
        second_time_of_day: 'evening',
        reorder_threshold: 7,
        notes: ''
      })
      loadData()
    } catch (err) {
      setError('Failed to save supplement')
      console.error('Error saving supplement:', err)
    }
  }

  // Handle deleting supplement
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this supplement?')) return
    
    try {
      await supplements.delete(id)
      
      // Remove from inventory
      const newInventory = { ...inventory }
      delete newInventory[id]
      saveInventory(newInventory)
      
      loadData()
    } catch (err) {
      setError('Failed to delete supplement')
      console.error('Error deleting supplement:', err)
    }
  }

  // Open edit form
  const handleEdit = (supplement) => {
    const inv = inventory[supplement.id] || {}
    const parsedTimes = parseTimeOfDayValue(supplement.time_of_day)
    setEditingSupplement(supplement)
    setEntryMode('manual')
    supplementScanRequestIdRef.current += 1
    setCatalogQuery('')
    setCatalogResults([])
    setCatalogLoading(false)
    setCatalogError('')
    setBarcodeLookupLoading(false)
    setBarcodeError('')
    setBarcodeNotFound(false)
    setScanLoading(false)
    setScanError('')
    setScanCaptured('')
    setFormData({
      name: supplement.name || '',
      brand: supplement.brand || '',
      dose_amount: supplement.dose_amount || '',
      dose_unit: supplement.dose_unit || 'capsules',
      servings_per_container: inv.servingsPerContainer || '',
      remaining_servings: inv.remainingServings || '',
      frequency: supplement.frequency || 'daily',
      custom_days: inv.customDays || [],
      time_of_day: parsedTimes.primary,
      second_time_of_day: parsedTimes.secondary,
      reorder_threshold: inv.reorderThreshold || 7,
      notes: supplement.notes || ''
    })
    setShowForm(true)
  }

  // Open add form
  const handleAdd = () => {
    setEditingSupplement(null)
    setEntryMode('search')
    supplementScanRequestIdRef.current += 1
    setCatalogQuery('')
    setCatalogResults([])
    setCatalogLoading(false)
    setCatalogError('')
    setBarcodeLookupLoading(false)
    setBarcodeError('')
    setBarcodeNotFound(false)
    setScanLoading(false)
    setScanError('')
    setScanCaptured('')
    setFormData({
      name: '',
      brand: '',
      dose_amount: '',
      dose_unit: 'capsules',
      servings_per_container: '',
      remaining_servings: '',
      frequency: 'daily',
      custom_days: [],
      time_of_day: 'morning',
      second_time_of_day: 'evening',
      reorder_threshold: 7,
      notes: ''
    })
    setShowForm(true)
  }

  const applyCatalogResult = (result) => {
    const noteParts = [result?.ingredients, result?.directions].filter(Boolean)

    setFormData((current) => ({
      ...current,
      name: result?.name || current.name,
      brand: result?.brand || current.brand,
      dose_amount: result?.dose_amount ?? current.dose_amount,
      dose_unit: result?.dose_unit || current.dose_unit,
      servings_per_container: result?.servings_per_container ?? current.servings_per_container,
      notes: noteParts.length > 0 ? noteParts.join('\n') : current.notes
    }))
    setEntryMode('manual')
    setCatalogError('')
    setBarcodeError('')
    setBarcodeNotFound(false)
  }

  const handleSupplementBarcodeDetected = async (rawCode) => {
    const code = String(rawCode || '').trim()

    if (!code) {
      return
    }

    setBarcodeLookupLoading(true)
    setBarcodeError('')
    setBarcodeNotFound(false)

    try {
      const result = await supplements.lookupBarcode(code)
      applyCatalogResult(result)
    } catch (lookupFailure) {
      if (lookupFailure.response?.status === 404) {
        setBarcodeNotFound(true)
        return
      }

      setBarcodeError(lookupFailure.response?.data?.error || 'Barcode lookup failed')
    } finally {
      setBarcodeLookupLoading(false)
    }
  }

  const handleSupplementScan = async ({ base64Image, previewUrl }) => {
    const requestId = supplementScanRequestIdRef.current + 1
    supplementScanRequestIdRef.current = requestId
    setScanCaptured(previewUrl)
    setScanLoading(true)
    setScanError('')

    try {
      const result = await ai.scanSupplementLabel(base64Image)
      if (supplementScanRequestIdRef.current !== requestId) {
        return
      }

      const noteParts = [result?.ingredients, result?.directions].filter(Boolean)

      setFormData((current) => ({
        ...current,
        name: result?.name || current.name,
        brand: result?.brand || current.brand,
        dose_amount: result?.dose_amount ?? current.dose_amount,
        dose_unit: result?.dose_unit || current.dose_unit,
        servings_per_container: result?.servings_per_container ?? current.servings_per_container,
        notes: noteParts.length > 0 ? noteParts.join('\n') : current.notes
      }))
      setEntryMode('manual')
    } catch (scanFailure) {
      if (supplementScanRequestIdRef.current === requestId) {
        setScanError(getAiScanErrorMessage(scanFailure, 'Unable to analyze this label.'))
        setEntryMode('manual')
      }
    } finally {
      if (supplementScanRequestIdRef.current === requestId) {
        setScanLoading(false)
      }
    }
  }

  const retrySupplementScan = () => {
    supplementScanRequestIdRef.current += 1
    setScanCaptured('')
    setScanError('')
    setScanLoading(false)
  }

  // Get today's supplements
  const getTodaysSupplements = () => {
    return supplementsList.filter(s => isScheduledForToday(s))
  }

  // Get supplements needing reorder
  const getReorderAlerts = () => {
    return supplementsList.filter(s => {
      const status = getInventoryStatus(s.id)
      return status.status === 'critical' || status.status === 'warning'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading supplements...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-900 text-white">
      {/* Header */}
      <header className="h-14 flex-shrink-0 border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-full w-full max-w-lg items-center px-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center">
              <Link href="/" className="mr-3 flex h-11 w-11 items-center justify-center">
                <ArrowLeftIcon className="h-6 w-6 text-gray-400 hover:text-white transition-colors" />
              </Link>
              <h1 className="text-xl font-bold text-white">Supplements</h1>
            </div>
            <button
              onClick={handleAdd}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 font-medium text-black transition-colors hover:bg-cyan-400"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="mx-auto flex max-w-lg gap-1 rounded-xl bg-gray-800/50 p-1">
          {[
            { id: 'today', label: 'Today', icon: CalendarIcon },
            { id: 'inventory', label: 'Inventory', icon: BeakerIcon },
            { id: 'history', label: 'History', icon: ChartBarIcon }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-black'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="page-content mx-auto flex-1 min-h-0 overflow-y-auto w-full max-w-lg px-4 py-4 pb-[calc(104px+env(safe-area-inset-bottom))]">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl mb-6">
            {error}
          </div>
        )}

        {/* Reorder Alerts Banner */}
        {getReorderAlerts().length > 0 && activeTab !== 'inventory' && (
          <div className="mb-6">
            <div className="bg-gradient-to-r from-orange-600/20 to-red-600/20 border border-orange-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500/20 p-2 rounded-lg">
                  <ExclamationTriangleIcon className="h-5 w-5 text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium text-sm">Low Stock Alert</h3>
                  <p className="text-gray-400 text-xs">
                    {getReorderAlerts().length} supplement{getReorderAlerts().length > 1 ? 's' : ''} need reordering
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('inventory')}
                  className="text-orange-400 text-xs font-medium hover:text-orange-300"
                >
                  View →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TODAY TAB */}
        {activeTab === 'today' && (
          <div className="space-y-4">
            {(() => {
              const todaySummary = getTodaySummary()

              return (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })}
              </h2>
              {getTodaysSupplements().length > 0 && (
                <span className="text-sm text-gray-400">
                  {todaySummary.taken} / {todaySummary.scheduled} doses taken
                </span>
              )}
            </div>
              )
            })()}

            {getTodaysSupplements().length === 0 ? (
              <div className="text-center py-12 bg-gray-800/50 rounded-2xl border border-gray-700">
                <div className="text-4xl mb-3">💊</div>
                <h3 className="text-white font-medium mb-2">No supplements scheduled</h3>
                <p className="text-gray-400 text-sm mb-4">Add supplements to start tracking</p>
                <button
                  onClick={handleAdd}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  Add Supplement
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {getTodaysSupplements().map((supplement) => {
                  const taken = isTakenToday(supplement.id)
                  const takenCount = getTakenDoseCountToday(supplement.id)
                  const scheduledCount = getScheduledDoseCount(supplement.frequency || 'daily')
                  const canTakeDose = takenCount < scheduledCount
                  const inventoryStatus = getInventoryStatus(supplement.id)
                  const stats = getWeeklyStats(supplement.id)
                  
                  return (
                    <div
                      key={supplement.id}
                      className={`bg-gray-800 rounded-2xl p-4 border transition-all ${
                        taken 
                          ? 'border-green-500/30 bg-green-500/5' 
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Checkbox */}
                        <button
                          onClick={() => canTakeDose && handleLogDose(supplement)}
                          disabled={!canTakeDose}
                          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            taken
                              ? 'bg-green-500 text-black'
                              : canTakeDose
                                ? 'bg-gray-700 hover:bg-gray-600 border border-gray-600'
                                : 'bg-gray-700 text-gray-500 border border-gray-600'
                          }`}
                        >
                          {taken ? (
                            <CheckIcon className="h-5 w-5" />
                          ) : (
                            <PlusIcon className="h-5 w-5 text-gray-400" />
                          )}
                        </button>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className={`font-semibold truncate ${taken ? 'text-gray-400' : 'text-white'}`}>
                                {supplement.name}
                              </h3>
                              <p className="text-gray-400 text-sm">
                                {supplement.dose_amount} {supplement.dose_unit}
                                {supplement.time_of_day && (
                                  <span className="text-cyan-400"> • {formatTimeOfDayLabel(supplement.time_of_day)}</span>
                                )}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {takenCount} / {scheduledCount} doses taken today
                              </p>
                            </div>
                            
                            {/* Inventory indicator */}
                            <div className={`flex-shrink-0 w-3 h-3 rounded-full ${
                              inventoryStatus.color === 'red' ? 'bg-red-500 animate-pulse' :
                              inventoryStatus.color === 'yellow' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`} title={`${inventoryStatus.daysRemaining} days remaining`} />
                          </div>
                          
                          {/* Weekly progress */}
                          <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
                                style={{ width: `${stats.adherence}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {stats.taken}/{stats.scheduled} this week
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="mt-3 pt-3 border-t border-gray-700/50 flex gap-2">
                        {canTakeDose && (
                          <button
                            onClick={() => handleLogDose(supplement)}
                            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-2 px-3 rounded-xl text-sm transition-colors"
                          >
                            {scheduledCount > 1 ? 'Log Dose' : 'Take Dose'}
                          </button>
                        )}
                        {takenCount > 0 && (
                          <button
                            onClick={() => handleUndoDose(supplement)}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-3 rounded-xl text-sm transition-colors"
                          >
                            Undo Last Dose
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(supplement)}
                          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
                        >
                          <PencilIcon className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* INVENTORY TAB */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Supplement Inventory</h2>
              <span className="text-sm text-gray-400">{supplementsList.length} items</span>
            </div>

            {supplementsList.length === 0 ? (
              <div className="text-center py-12 bg-gray-800/50 rounded-2xl border border-gray-700">
                <div className="text-4xl mb-3">📦</div>
                <h3 className="text-white font-medium mb-2">No supplements yet</h3>
                <p className="text-gray-400 text-sm mb-4">Add your first supplement to track inventory</p>
                <button
                  onClick={handleAdd}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  Add Supplement
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {supplementsList.map((supplement) => {
                  const status = getInventoryStatus(supplement.id)
                  const inv = inventory[supplement.id] || {}
                  
                  return (
                    <div
                      key={supplement.id}
                      className="bg-gray-800 rounded-2xl p-4 border border-gray-700 hover:border-gray-600 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white truncate">{supplement.name}</h3>
                            {status.color === 'red' && (
                              <span className="flex-shrink-0 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-medium">
                                Reorder Now
                              </span>
                            )}
                            {status.color === 'yellow' && (
                              <span className="flex-shrink-0 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full font-medium">
                                Low Stock
                              </span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm mt-1">
                            {supplement.dose_amount} {supplement.dose_unit} • {supplement.frequency.replace('_', ' ')}
                          </p>
                        </div>
                        
                        {/* Stock indicator */}
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${
                            status.color === 'red' ? 'text-red-400' :
                            status.color === 'yellow' ? 'text-yellow-400' :
                            'text-green-400'
                          }`}>
                            {inv.remainingServings || 0}
                          </div>
                          <div className="text-xs text-gray-400">days left</div>
                        </div>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                          <span>Stock level</span>
                          <span>{inv.servingsPerContainer || 0} total servings</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              status.color === 'red' ? 'bg-red-500' :
                              status.color === 'yellow' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ 
                              width: `${Math.min(100, ((inv.remainingServings || 0) / (inv.servingsPerContainer || 1)) * 100)}%` 
                            }}
                          />
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="mt-3 pt-3 border-t border-gray-700/50 flex gap-2">
                        <button
                          onClick={() => handleEdit(supplement)}
                          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          <PencilIcon className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            // Restock functionality
                            const newInventory = {
                              ...inventory,
                              [supplement.id]: {
                                ...inv,
                                remainingServings: inv.servingsPerContainer || 30,
                                lastPurchased: new Date().toISOString()
                              }
                            }
                            saveInventory(newInventory)
                          }}
                          className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 font-medium py-2 px-3 rounded-xl text-sm transition-colors"
                        >
                          Restock
                        </button>
                        <button
                          onClick={() => handleDelete(supplement.id)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Dose History</h2>
            </div>

            {supplementsList.length === 0 ? (
              <div className="text-center py-12 bg-gray-800/50 rounded-2xl border border-gray-700">
                <div className="text-4xl mb-3">📊</div>
                <h3 className="text-white font-medium mb-2">No history yet</h3>
                <p className="text-gray-400 text-sm">Start logging doses to see your history</p>
              </div>
            ) : (
              <div className="space-y-6">
                {supplementsList.map((supplement) => {
                  const logs = supplementLogs[supplement.id] || []
                  const stats = getWeeklyStats(supplement.id)
                  
                  if (logs.length === 0) return null
                  
                  return (
                    <div key={supplement.id} className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white">{supplement.name}</h3>
                        <span className="text-xs text-gray-400">{stats.adherence}% adherence</span>
                      </div>
                      
                      {/* Last 7 days */}
                      <div className="grid grid-cols-7 gap-1 mb-4">
                        {[...Array(7)].map((_, i) => {
                          const date = new Date()
                          date.setDate(date.getDate() - (6 - i))
                          const taken = logs.some(log => 
                            new Date(log.taken_at).toDateString() === date.toDateString()
                          )
                          const isToday = i === 6
                          
                          return (
                            <div key={i} className="text-center">
                              <div className="text-xs text-gray-500 mb-1">
                                {DAYS_OF_WEEK[date.getDay()]}
                              </div>
                              <div className={`aspect-square rounded-lg flex items-center justify-center ${
                                taken 
                                  ? 'bg-green-500/20 text-green-400' 
                                  : isToday 
                                    ? 'bg-gray-700 text-gray-400 border border-cyan-500/30'
                                    : 'bg-gray-700/50 text-gray-600'
                              }`}>
                                {taken ? <CheckIcon className="h-4 w-4" /> : '•'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      
                      {/* Recent logs */}
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 uppercase tracking-wider">Recent doses</div>
                        {logs.slice(0, 3).map((log) => (
                          <div key={log.id} className="flex items-center justify-between py-2 px-3 bg-gray-700/50 rounded-xl">
                            <div className="flex items-center gap-2">
                              <CheckIcon className="h-4 w-4 text-green-400" />
                              <span className="text-sm text-white">
                                {log.dose_amount} {log.dose_unit}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">
                              {new Date(log.taken_at).toLocaleDateString('en-GB', { 
                                day: 'numeric', 
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        ))}
                        {logs.length > 3 && (
                          <div className="text-center text-xs text-gray-500 py-2">
                            +{logs.length - 3} more entries
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add/Edit Form Bottom Sheet */}
      {showForm && (
        <div 
          className="fixed inset-0 z-50 flex items-end bg-black/60 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => {
            setShowForm(false)
            setEntryMode('manual')
            supplementScanRequestIdRef.current += 1
            setCatalogQuery('')
            setCatalogResults([])
            setCatalogLoading(false)
            setCatalogError('')
            setBarcodeLookupLoading(false)
            setBarcodeError('')
            setBarcodeNotFound(false)
            setScanError('')
            setScanCaptured('')
            setScanLoading(false)
          }}
        >
          <div 
            className="mx-auto max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-gray-700 bg-gray-900 sm:max-h-[85dvh] sm:rounded-3xl sm:border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-gray-600 rounded-full"></div>
            </div>
            
            <div className="p-5 pb-24">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">
                  {editingSupplement ? 'Edit Supplement' : 'Add Supplement'}
                </h2>
                <button 
                  onClick={() => {
                    setShowForm(false)
                    setEntryMode('manual')
                    supplementScanRequestIdRef.current += 1
                    setCatalogQuery('')
                    setCatalogResults([])
                    setCatalogLoading(false)
                    setCatalogError('')
                    setBarcodeLookupLoading(false)
                    setBarcodeError('')
                    setBarcodeNotFound(false)
                    setScanError('')
                    setScanCaptured('')
                    setScanLoading(false)
                  }}
                  className="flex h-11 w-11 items-center justify-center text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="mb-5 grid grid-cols-4 gap-2 rounded-2xl bg-gray-800/60 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('manual')
                    supplementScanRequestIdRef.current += 1
                    setCatalogError('')
                    setBarcodeError('')
                    setBarcodeNotFound(false)
                  }}
                  className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    entryMode === 'manual'
                      ? 'bg-cyan-500 text-black'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('search')
                    setCatalogError('')
                    setBarcodeError('')
                    setBarcodeNotFound(false)
                  }}
                  className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    entryMode === 'search'
                      ? 'bg-cyan-500 text-black'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('barcode')
                    setCatalogError('')
                    setBarcodeError('')
                    setBarcodeNotFound(false)
                    setBarcodeLookupLoading(false)
                  }}
                  className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    entryMode === 'barcode'
                      ? 'bg-cyan-500 text-black'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Barcode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('scan')
                    supplementScanRequestIdRef.current += 1
                    setScanError('')
                    setScanCaptured('')
                    setScanLoading(false)
                  }}
                  className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    entryMode === 'scan'
                      ? 'bg-cyan-500 text-black'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Scan Label
                </button>
              </div>

              {scanError && (
                <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {scanError}
                </div>
              )}

              {entryMode === 'search' && (
                <div className="mb-5 space-y-4">
                  <p className="text-sm text-gray-400">
                    Search the supplement database first, then fall back to barcode or label scan if needed.
                  </p>
                  <input
                    type="text"
                    autoFocus
                    value={catalogQuery}
                    onChange={(event) => setCatalogQuery(event.target.value)}
                    placeholder="Search creatine, omega 3, vitamin d..."
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                  />

                  {catalogLoading && <p className="text-sm text-gray-400">Searching...</p>}
                  {catalogError && <p className="text-sm text-red-400">{catalogError}</p>}

                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {catalogResults.map((result) => (
                      <button
                        key={`${result.source}-${result.id}`}
                        type="button"
                        onClick={() => applyCatalogResult(result)}
                        className="w-full rounded-xl border border-gray-700 bg-gray-800 p-3 text-left transition-colors hover:border-cyan-500/30 hover:bg-gray-700"
                      >
                        <div className="text-base font-semibold text-white">{result.name}</div>
                        <div className="mt-1 text-sm text-gray-400">{result.brand || 'No brand listed'}</div>
                        <div className="mt-2 text-xs text-cyan-400">
                          {result.dose_amount && result.dose_unit
                            ? `${result.dose_amount} ${result.dose_unit}`
                            : 'Dose not available'}
                        </div>
                      </button>
                    ))}
                    {!catalogLoading && catalogQuery.trim().length >= 2 && catalogResults.length === 0 && !catalogError && (
                      <div className="space-y-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                        <p className="text-sm text-yellow-100">No supplement results found.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEntryMode('barcode')
                              setBarcodeError('')
                              setBarcodeNotFound(false)
                            }}
                            className="flex-1 rounded-xl bg-gray-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
                          >
                            Try Barcode
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEntryMode('scan')
                              supplementScanRequestIdRef.current += 1
                              setScanError('')
                              setScanCaptured('')
                              setScanLoading(false)
                            }}
                            className="flex-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-cyan-400"
                          >
                            Scan Label
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className={`space-y-5 ${entryMode === 'scan' || entryMode === 'search' || entryMode === 'barcode' ? 'hidden' : ''}`}>
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Supplement Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Creatine Monohydrate"
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                    required
                  />
                </div>
                
                {/* Brand */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Brand</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="e.g., Optimum Nutrition"
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                
                {/* Dose */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Dose Amount</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.dose_amount}
                      onChange={(e) => setFormData({ ...formData, dose_amount: e.target.value })}
                      placeholder="5"
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Unit</label>
                    <select
                      value={formData.dose_unit}
                      onChange={(e) => setFormData({ ...formData, dose_unit: e.target.value })}
                      className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white transition-colors appearance-none focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="capsules">Capsules</option>
                      <option value="capsule">Capsule</option>
                      <option value="tablets">Tablets</option>
                      <option value="tablet">Tablet</option>
                      <option value="softgels">Softgels</option>
                      <option value="drops">Drops</option>
                      <option value="g">g (grams)</option>
                      <option value="mg">mg (milligrams)</option>
                      <option value="mcg">mcg (micrograms)</option>
                      <option value="ml">ml (milliliters)</option>
                      <option value="scoops">Scoops</option>
                      <option value="serving">Serving</option>
                    </select>
                  </div>
                </div>
                
                {/* Inventory */}
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                  <h3 className="text-sm font-medium text-cyan-400 mb-4">📦 Inventory Settings</h3>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Servings/Container</label>
                      <input
                        type="number"
                        value={formData.servings_per_container}
                        onChange={(e) => setFormData({ ...formData, servings_per_container: e.target.value })}
                        placeholder="30"
                        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Remaining</label>
                      <input
                        type="number"
                        value={formData.remaining_servings}
                        onChange={(e) => setFormData({ ...formData, remaining_servings: e.target.value })}
                        placeholder="25"
                        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Reorder Alert (days)</label>
                    <input
                      type="number"
                      value={formData.reorder_threshold}
                      onChange={(e) => setFormData({ ...formData, reorder_threshold: e.target.value })}
                      placeholder="7"
                      className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>
                
                {/* Schedule */}
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                  <h3 className="text-sm font-medium text-cyan-400 mb-4">📅 Schedule</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Frequency</label>
                      <select
                        value={formData.frequency}
                        onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white transition-colors appearance-none focus:border-cyan-500 focus:outline-none"
                      >
                        {FREQUENCY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Custom days selector */}
                    {formData.frequency === 'custom' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Select Days</label>
                        <div className="grid grid-cols-7 gap-1">
                          {DAYS_OF_WEEK.map((day, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => {
                                const days = formData.custom_days.includes(index)
                                  ? formData.custom_days.filter(d => d !== index)
                                  : [...formData.custom_days, index]
                                setFormData({ ...formData, custom_days: days })
                              }}
                              className={`min-h-11 rounded-lg py-2 text-xs font-medium transition-colors ${
                                formData.custom_days.includes(index)
                                  ? 'bg-cyan-500 text-black'
                                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                              }`}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        {formData.frequency === 'twice_daily' ? 'First Dose Time' : 'Time of Day'}
                      </label>
                      <select
                        value={formData.time_of_day}
                        onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white transition-colors appearance-none focus:border-cyan-500 focus:outline-none"
                      >
                        {TIME_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    {formData.frequency === 'twice_daily' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Second Dose Time</label>
                        <select
                          value={formData.second_time_of_day}
                          onChange={(e) => setFormData({ ...formData, second_time_of_day: e.target.value })}
                          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white transition-colors appearance-none focus:border-cyan-500 focus:outline-none"
                        >
                          {TIME_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Any additional notes..."
                    rows={3}
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors resize-none focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                
                {/* Submit */}
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-semibold py-4 rounded-xl transition-colors"
                >
                  {editingSupplement ? 'Update Supplement' : 'Add Supplement'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {showForm && entryMode === 'barcode' && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setEntryMode('manual')}
        >
          <div
            className="my-auto max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4 sm:max-h-[85dvh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Scan Supplement Barcode</h2>
                <p className="text-sm text-gray-400">Point the camera at the supplement barcode.</p>
              </div>
              <button
                type="button"
                onClick={() => setEntryMode('manual')}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <BarcodeScanner
              active={showForm && entryMode === 'barcode' && !barcodeLookupLoading}
              onDetected={handleSupplementBarcodeDetected}
              onError={() => setBarcodeError('Unable to access camera. Check browser permissions and HTTPS.')}
            />

            {barcodeLookupLoading && <p className="mt-3 text-sm text-gray-400">Looking up supplement...</p>}
            {barcodeError && <p className="mt-3 text-sm text-red-400">{barcodeError}</p>}
            {barcodeNotFound && (
              <div className="mt-4 space-y-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-sm text-yellow-100">Supplement not found in the barcode database.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryMode('search')
                      setCatalogError('')
                    }}
                    className="flex-1 rounded-xl bg-gray-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
                  >
                    Search Instead
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEntryMode('scan')
                      supplementScanRequestIdRef.current += 1
                      setScanError('')
                      setScanCaptured('')
                      setScanLoading(false)
                    }}
                    className="flex-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-cyan-400"
                  >
                    Scan Label
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && entryMode === 'scan' && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setEntryMode('manual')}
        >
          <div
            className="my-auto max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4 sm:max-h-[85dvh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Scan Supplement Label</h2>
                <p className="text-sm text-gray-400">Take a clear photo of the label for dose extraction.</p>
              </div>
              <button
                type="button"
                onClick={() => setEntryMode('manual')}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <CameraCapturePanel
              active={showForm && entryMode === 'scan'}
              capturedImage={scanCaptured}
              error={scanError}
              loading={scanLoading}
              loadingText="Analyzing label..."
              captureLabel="Take Photo 📸"
              onCapture={handleSupplementScan}
              onRetry={retrySupplementScan}
              onFallback={() => setEntryMode('manual')}
              fallbackLabel="Enter Manually"
            />
          </div>
        </div>
      )}

      <BottomNav active="more" />
    </div>
  )
}
