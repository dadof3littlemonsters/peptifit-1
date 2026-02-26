import { useState, useEffect, useCallback } from 'react'
import { supplements } from '../lib/api'
import Link from 'next/link'
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

export default function SupplementsPage() {
  const [supplementsList, setSupplementsList] = useState([])
  const [supplementLogs, setSupplementLogs] = useState({})
  const [inventory, setInventory] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('today') // 'today', 'inventory', 'history'
  
  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingSupplement, setEditingSupplement] = useState(null)
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
    reorder_threshold: 7,
    notes: ''
  })

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [])

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
    const logs = supplementLogs[supplementId] || []
    const today = new Date().toDateString()
    return logs.some(log => new Date(log.taken_at).toDateString() === today)
  }

  // Get weekly adherence stats
  const getWeeklyStats = (supplementId) => {
    const logs = supplementLogs[supplementId] || []
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    
    const scheduledDays = []
    const takenDays = []
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + i)
      
      // Check if scheduled for this day
      const isScheduled = isScheduledForDate(supplementId, date)
      if (isScheduled) {
        scheduledDays.push(date.toDateString())
        
        // Check if taken
        const taken = logs.some(log => 
          new Date(log.taken_at).toDateString() === date.toDateString()
        )
        if (taken) takenDays.push(date.toDateString())
      }
    }
    
    const adherence = scheduledDays.length > 0 
      ? Math.round((takenDays.length / scheduledDays.length) * 100) 
      : 0
    
    return { taken: takenDays.length, scheduled: scheduledDays.length, adherence }
  }

  // Helper to check if scheduled for a specific date
  const isScheduledForDate = (supplementId, date) => {
    const supplement = supplementsList.find(s => s.id === supplementId)
    if (!supplement) return false
    
    const dayOfWeek = date.getDay()
    const freq = supplement.frequency || 'daily'
    
    if (freq === 'daily') return true
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

  // Handle adding/editing supplement
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const supplementData = {
      name: formData.name,
      description: formData.brand ? `${formData.brand} - ${formData.notes || ''}` : formData.notes,
      dose_amount: parseFloat(formData.dose_amount) || 1,
      dose_unit: formData.dose_unit,
      frequency: formData.frequency,
      time_of_day: formData.time_of_day,
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
    setEditingSupplement(supplement)
    setFormData({
      name: supplement.name || '',
      brand: supplement.description?.split(' - ')[0] || '',
      dose_amount: supplement.dose_amount || '',
      dose_unit: supplement.dose_unit || 'capsules',
      servings_per_container: inv.servingsPerContainer || '',
      remaining_servings: inv.remainingServings || '',
      frequency: supplement.frequency || 'daily',
      custom_days: inv.customDays || [],
      time_of_day: supplement.time_of_day || 'morning',
      reorder_threshold: inv.reorderThreshold || 7,
      notes: supplement.notes || ''
    })
    setShowForm(true)
  }

  // Open add form
  const handleAdd = () => {
    setEditingSupplement(null)
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
      reorder_threshold: 7,
      notes: ''
    })
    setShowForm(true)
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
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading supplements...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Header */}
      <header className="bg-[#0f172a] border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Link href="/" className="mr-4">
                <ArrowLeftIcon className="h-6 w-6 text-gray-400 hover:text-white transition-colors" />
              </Link>
              <h1 className="text-xl font-semibold text-white">Supplements</h1>
            </div>
            <button
              onClick={handleAdd}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium p-2 rounded-xl transition-colors"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex gap-1 mt-4 bg-gray-800/50 p-1 rounded-xl">
            {[
              { id: 'today', label: 'Today', icon: CalendarIcon },
              { id: 'inventory', label: 'Inventory', icon: BeakerIcon },
              { id: 'history', label: 'History', icon: ChartBarIcon }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
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
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-5 py-5 pb-24">
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })}
              </h2>
              <span className="text-sm text-gray-400">
                {getTodaysSupplements().filter(s => isTakenToday(s.id)).length} / {getTodaysSupplements().length} taken
              </span>
            </div>

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
                          onClick={() => !taken && handleLogDose(supplement)}
                          disabled={taken}
                          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            taken
                              ? 'bg-green-500 text-black'
                              : 'bg-gray-700 hover:bg-gray-600 border border-gray-600'
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
                              <h3 className={`font-semibold truncate ${taken ? 'text-gray-400 line-through' : 'text-white'}`}>
                                {supplement.name}
                              </h3>
                              <p className="text-gray-400 text-sm">
                                {supplement.dose_amount} {supplement.dose_unit}
                                {supplement.time_of_day && (
                                  <span className="text-cyan-400"> • {supplement.time_of_day.replace('_', ' ')}</span>
                                )}
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
                      {!taken && (
                        <div className="mt-3 pt-3 border-t border-gray-700/50 flex gap-2">
                          <button
                            onClick={() => handleLogDose(supplement)}
                            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-medium py-2 px-3 rounded-xl text-sm transition-colors"
                          >
                            Take Dose
                          </button>
                          <button
                            onClick={() => handleEdit(supplement)}
                            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
                          >
                            <PencilIcon className="h-4 w-4 text-gray-400" />
                          </button>
                        </div>
                      )}
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
                            {supplement.dose_amount} {supplement.dose_unit} • {supplement.frequency}
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
          className="fixed inset-0 bg-black/80 z-50 flex items-end"
          onClick={() => setShowForm(false)}
        >
          <div 
            className="w-full max-w-md mx-auto bg-[#0f172a] rounded-t-3xl border-t border-gray-700 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-gray-600 rounded-full"></div>
            </div>
            
            <div className="p-5 pb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">
                  {editingSupplement ? 'Edit Supplement' : 'Add Supplement'}
                </h2>
                <button 
                  onClick={() => setShowForm(false)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Supplement Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Creatine Monohydrate"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
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
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Unit</label>
                    <select
                      value={formData.dose_unit}
                      onChange={(e) => setFormData({ ...formData, dose_unit: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors appearance-none"
                    >
                      <option value="capsules">Capsules</option>
                      <option value="capsule">Capsule</option>
                      <option value="tablets">Tablets</option>
                      <option value="tablet">Tablet</option>
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
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Remaining</label>
                      <input
                        type="number"
                        value={formData.remaining_servings}
                        onChange={(e) => setFormData({ ...formData, remaining_servings: e.target.value })}
                        placeholder="25"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
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
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
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
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors appearance-none"
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
                              className={`py-2 rounded-lg text-xs font-medium transition-colors ${
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
                      <label className="block text-sm font-medium text-gray-400 mb-2">Time of Day</label>
                      <select
                        value={formData.time_of_day}
                        onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors appearance-none"
                      >
                        {TIME_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
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

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0f172a] border-t border-gray-800">
        <div className="max-w-md mx-auto">
          <div className="grid grid-cols-5 py-2">
            <Link href="/" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
              <span className="text-xl mb-1">🏠</span>
              <span className="text-xs">Dashboard</span>
            </Link>
            <Link href="/peptides" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
              <span className="text-xl mb-1">💉</span>
              <span className="text-xs">Peptides</span>
            </Link>
            <Link 
              href="/meals"
              className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-xl mb-1">🍽️</span>
              <span className="text-xs">Meals</span>
            </Link>
            <Link 
              href="/vitals"
              className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-xl mb-1">📊</span>
              <span className="text-xs">Vitals</span>
            </Link>
            <div className="flex flex-col items-center py-2 text-cyan-400">
              <span className="text-xl mb-1">💊</span>
              <span className="text-xs">Supplements</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
