import { useState, useEffect, useMemo } from 'react'
import { vitals, auth } from '../lib/api'
import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  ArrowLeftIcon,
  PlusIcon,
  ChartBarIcon,
  ClockIcon,
  CalendarIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MinusIcon,
  FunnelIcon,
  XMarkIcon,
  MicrophoneIcon,
  HeartIcon,
  FireIcon,
  ScaleIcon,
  BeakerIcon,
  BoltIcon
} from '@heroicons/react/24/outline'

// Temperature icon using a custom SVG since ThermometerIcon may not be available
const TemperatureIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
  </svg>
)

// Dynamically import Recharts components to avoid SSR issues
const LineChart = dynamic(() => import('recharts').then(mod => mod.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(mod => mod.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false })

// Vital type definitions with units and display info
const VITAL_TYPES = {
  weight: {
    label: 'Weight',
    unit: 'kg',
    altUnit: 'lbs',
    icon: ScaleIcon,
    color: '#06b6d4', // cyan-500
    min: 0,
    max: 300,
    step: 0.1,
    quickValues: [70, 75, 80, 85, 90]
  },
  blood_pressure: {
    label: 'Blood Pressure',
    unit: 'mmHg',
    icon: HeartIcon,
    color: '#ef4444', // red-500
    isCompound: true,
    subFields: [
      { key: 'systolic', label: 'Systolic', min: 50, max: 250, step: 1 },
      { key: 'diastolic', label: 'Diastolic', min: 30, max: 150, step: 1 },
      { key: 'pulse', label: 'Pulse', min: 30, max: 200, step: 1 }
    ],
    quickValues: []
  },
  blood_glucose: {
    label: 'Blood Glucose',
    unit: 'mg/dL',
    altUnit: 'mmol/L',
    icon: BeakerIcon,
    color: '#8b5cf6', // violet-500
    min: 30,
    max: 600,
    step: 1,
    quickValues: [80, 90, 100, 110, 120]
  },
  calories: {
    label: 'Calories',
    unit: 'kcal',
    icon: FireIcon,
    color: '#f97316', // orange-500
    min: 0,
    max: 10000,
    step: 10,
    quickValues: [1500, 1800, 2000, 2200, 2500]
  },
  heart_rate: {
    label: 'Heart Rate',
    unit: 'bpm',
    icon: BoltIcon,
    color: '#ec4899', // pink-500
    min: 30,
    max: 220,
    step: 1,
    quickValues: [60, 70, 75, 80, 90]
  },
  body_fat: {
    label: 'Body Fat',
    unit: '%',
    icon: ChartBarIcon,
    color: '#10b981', // emerald-500
    min: 0,
    max: 60,
    step: 0.1,
    quickValues: [10, 12, 15, 18, 20, 25]
  },
  temperature: {
    label: 'Temperature',
    unit: '°C',
    altUnit: '°F',
    icon: TemperatureIcon,
    color: '#f59e0b', // amber-500
    min: 35,
    max: 42,
    step: 0.1,
    quickValues: [36.5, 36.6, 36.7, 37.0, 37.5]
  }
}

// Time range options for charts
const TIME_RANGES = [
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
  { value: 90, label: '90 Days' }
]

export default function VitalsPage() {
  const router = useRouter()
  
  // State
  const [vitalsData, setVitalsData] = useState([])
  const [latestReadings, setLatestReadings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('dashboard') // dashboard, log, history
  const [quickMode, setQuickMode] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isClient, setIsClient] = useState(false)
  
  // Form state
  const [selectedType, setSelectedType] = useState('weight')
  const [formData, setFormData] = useState({
    value: '',
    systolic: '',
    diastolic: '',
    pulse: '',
    notes: '',
    measured_at: ''
  })
  
  // Chart state
  const [chartType, setChartType] = useState('weight')
  const [timeRange, setTimeRange] = useState(30)
  const [chartData, setChartData] = useState([])
  
  // History filter state
  const [historyFilter, setHistoryFilter] = useState({
    type: '',
    start: '',
    end: ''
  })

  // Set isClient and formData measured_at only on client side
  useEffect(() => {
    setIsClient(true)
    setFormData(prev => ({
      ...prev,
      measured_at: new Date().toISOString().slice(0, 16)
    }))
  }, [])

  // Check auth and load data on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Wait for router to be ready and check if we're in browser
      if (typeof window === 'undefined') return
      
      try {
        if (!auth.isAuthenticated()) {
          router.push('/login')
          return
        }
        setIsAuthenticated(true)
        await loadData()
      } catch (err) {
        console.error('Auth check error:', err)
        router.push('/login')
      }
    }
    checkAuth()
  }, [])

  // Load chart data when type or range changes
  useEffect(() => {
    if ((activeView === 'dashboard' || activeView === 'history') && isAuthenticated) {
      loadChartData(chartType, timeRange)
    }
  }, [chartType, timeRange, activeView, isAuthenticated])

  const loadData = async () => {
    try {
      setLoading(true)
      const [allVitals, latest] = await Promise.all([
        vitals.getAll({ limit: 200 }),
        vitals.getLatest()
      ])
      setVitalsData(allVitals || [])
      setLatestReadings(latest || {})
    } catch (err) {
      setError('Failed to load vitals data')
      console.error('Error loading vitals:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadChartData = async (type, days) => {
    try {
      const data = await vitals.getHistory(type, days)
      // Format data for Recharts
      const formatted = (data || []).map(v => ({
        date: new Date(v.measured_at).toLocaleDateString('en-GB', { 
          month: 'short', 
          day: 'numeric' 
        }),
        fullDate: v.measured_at,
        value: parseFloat(v.value),
        notes: v.notes
      })).reverse()
      setChartData(formatted)
    } catch (err) {
      console.error('Error loading chart data:', err)
      setChartData([])
    }
  }

  // Calculate trend for a vital type
  const getTrend = (type) => {
    const typeData = vitalsData
      .filter(v => v.vital_type === type)
      .sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))
    
    if (typeData.length < 2) return { direction: 'neutral', change: 0 }
    
    const latest = parseFloat(typeData[0].value)
    const previous = parseFloat(typeData[1].value)
    const change = latest - previous
    const percentChange = previous !== 0 ? ((change / previous) * 100).toFixed(1) : 0
    
    let direction = 'neutral'
    if (Math.abs(change) < 0.01) direction = 'neutral'
    else if (type === 'weight' || type === 'body_fat') {
      // For weight/body fat, down is often good
      direction = change < 0 ? 'down' : 'up'
    } else {
      direction = change > 0 ? 'up' : 'down'
    }
    
    return { direction, change: Math.abs(change).toFixed(2), percentChange }
  }

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      let value = formData.value
      
      // Special handling for blood pressure
      if (selectedType === 'blood_pressure') {
        value = `${formData.systolic}/${formData.diastolic}`
        if (formData.pulse) {
          value += `/${formData.pulse}`
        }
      }
      
      await vitals.create({
        vital_type: selectedType,
        value: value.toString(),
        measured_at: formData.measured_at,
        notes: formData.notes
      })
      
      // Reset form and reload data
      setFormData({
        value: '',
        systolic: '',
        diastolic: '',
        pulse: '',
        notes: '',
        measured_at: new Date().toISOString().slice(0, 16)
      })
      
      await loadData()
      setActiveView('dashboard')
    } catch (err) {
      setError('Failed to save vital reading')
      console.error('Error saving vital:', err)
    }
  }

  // Handle quick value selection
  const handleQuickValue = (val) => {
    setFormData({ ...formData, value: val })
  }

  // Filter history
  const filteredHistory = useMemo(() => {
    return vitalsData
      .filter(v => {
        if (historyFilter.type && v.vital_type !== historyFilter.type) return false
        if (historyFilter.start && new Date(v.measured_at) < new Date(historyFilter.start)) return false
        if (historyFilter.end && new Date(v.measured_at) > new Date(historyFilter.end)) return false
        return true
      })
      .sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))
  }, [vitalsData, historyFilter])

  // Format value display
  const formatValue = (vital) => {
    if (!vital) return '-'
    const config = VITAL_TYPES[vital.vital_type]
    if (vital.vital_type === 'blood_pressure') {
      return vital.value
    }
    return `${vital.value} ${config?.unit || ''}`
  }

  // Get trend icon
  const TrendIcon = ({ direction }) => {
    if (direction === 'up') return <ChevronUpIcon className="w-5 h-5 text-red-400" />
    if (direction === 'down') return <ChevronDownIcon className="w-5 h-5 text-green-400" />
    return <MinusIcon className="w-5 h-5 text-gray-400" />
  }

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg">
          <p className="text-gray-300 text-sm mb-1">{label}</p>
          <p className="text-cyan-400 font-semibold">
            {payload[0].value} {VITAL_TYPES[chartType]?.unit}
          </p>
          {payload[0].payload.notes && (
            <p className="text-gray-400 text-xs mt-1 italic">{payload[0].payload.notes}</p>
          )}
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading vitals...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <header className="bg-black border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                <ArrowLeftIcon className="h-6 w-6" />
              </Link>
              <h1 className="text-xl font-bold text-white">Vitals</h1>
            </div>
            <button
              onClick={() => setQuickMode(!quickMode)}
              className={`p-2 rounded-lg transition-colors ${
                quickMode ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
              }`}
              title="Quick Entry Mode"
            >
              <MicrophoneIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* View Tabs */}
      <div className="max-w-md mx-auto px-5 mt-4">
        <div className="bg-gray-800 rounded-xl p-1 flex gap-1">
          {['dashboard', 'log', 'history'].map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors capitalize ${
                activeView === view
                  ? 'bg-cyan-500 text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-md mx-auto px-5 mt-4">
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Dashboard View */}
      {activeView === 'dashboard' && (
        <div className="max-w-md mx-auto px-5 mt-6 space-y-6">
          {/* Latest Readings Grid */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Latest Readings</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(VITAL_TYPES).map(([type, config]) => {
                const reading = latestReadings[type]
                const trend = getTrend(type)
                const Icon = config.icon
                
                return (
                  <div
                    key={type}
                    onClick={() => {
                      setChartType(type)
                      loadChartData(type, timeRange)
                    }}
                    className={`bg-gray-800 rounded-xl p-4 border transition-all cursor-pointer ${
                      chartType === type 
                        ? 'border-cyan-500 shadow-lg shadow-cyan-500/20' 
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${config.color}20` }}>
                        <Icon className="w-4 h-4" style={{ color: config.color }} />
                      </div>
                      <span className="text-gray-400 text-xs">{config.label}</span>
                    </div>
                    
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-white">
                        {reading ? reading.value : '-'}
                      </span>
                      {reading && (
                        <span className="text-gray-500 text-xs mb-1">
                          {config.unit}
                        </span>
                      )}
                    </div>
                    
                    {reading && (
                      <div className="flex items-center gap-1 mt-2">
                        <TrendIcon direction={trend.direction} />
                        <span className={`text-xs ${
                          trend.direction === 'neutral' ? 'text-gray-400' :
                          trend.direction === 'up' ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {trend.change} {trend.direction !== 'neutral' && `(${trend.percentChange}%)`}
                        </span>
                      </div>
                    )}
                    
                    {reading && (
                      <div className="text-gray-500 text-xs mt-1">
                        {new Date(reading.measured_at).toLocaleDateString('en-GB', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Trend Chart */}
          <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {VITAL_TYPES[chartType]?.label} Trend
                </h3>
                <p className="text-gray-400 text-sm">
                  Last {timeRange} days
                </p>
              </div>
              <div className="flex gap-1">
                {TIME_RANGES.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => setTimeRange(range.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      timeRange === range.value
                        ? 'bg-cyan-500 text-black'
                        : 'bg-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
            
            {chartData.length > 0 && isClient ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      fontSize={12}
                      tickLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={VITAL_TYPES[chartType]?.color || '#06b6d4'}
                      strokeWidth={2}
                      dot={{ fill: VITAL_TYPES[chartType]?.color || '#06b6d4', strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <ChartBarIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{isClient ? 'No data for selected period' : 'Loading chart...'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Log Buttons */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Quick Log</h3>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(VITAL_TYPES).map(([type, config]) => {
                const Icon = config.icon
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type)
                      setActiveView('log')
                    }}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-2 transition-colors"
                  >
                    <Icon className="w-6 h-6" style={{ color: config.color }} />
                    <span className="text-xs text-gray-400">{config.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Log Vital View */}
      {activeView === 'log' && (
        <div className="max-w-md mx-auto px-5 mt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Vital Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Vital Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(VITAL_TYPES).map(([type, config]) => {
                  const Icon = config.icon
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedType(type)}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        selectedType === type
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium">{config.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Value Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Value {VITAL_TYPES[selectedType]?.unit && 
                  <span className="text-gray-500">({VITAL_TYPES[selectedType].unit})</span>
                }
              </label>
              
              {selectedType === 'blood_pressure' ? (
                <div className="grid grid-cols-3 gap-3">
                  {VITAL_TYPES.blood_pressure.subFields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                      <input
                        type="number"
                        value={formData[field.key]}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none text-center text-lg"
                        placeholder="--"
                        required={field.key !== 'pulse'}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <input
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    min={VITAL_TYPES[selectedType]?.min}
                    max={VITAL_TYPES[selectedType]?.max}
                    step={VITAL_TYPES[selectedType]?.step}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none text-center text-3xl font-bold"
                    placeholder="0"
                    required
                    autoFocus
                  />
                  
                  {/* Quick Value Buttons */}
                  {VITAL_TYPES[selectedType]?.quickValues?.length > 0 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                      {VITAL_TYPES[selectedType].quickValues.map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleQuickValue(val)}
                          className="flex-shrink-0 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Date/Time */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Date & Time
              </label>
              <div className="relative">
                <ClockIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="datetime-local"
                  value={formData.measured_at}
                  onChange={(e) => setFormData({ ...formData, measured_at: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-12 pr-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none resize-none"
                placeholder="Add any notes..."
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-4 rounded-xl transition-colors text-lg"
            >
              Save Reading
            </button>
          </form>
        </div>
      )}

      {/* History View */}
      {activeView === 'history' && (
        <div className="max-w-md mx-auto px-5 mt-6 space-y-4">
          {/* Filters */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <FunnelIcon className="w-5 h-5 text-cyan-400" />
              <span className="font-medium text-white">Filters</span>
            </div>
            
            <div className="space-y-3">
              <select
                value={historyFilter.type}
                onChange={(e) => setHistoryFilter({ ...historyFilter, type: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
              >
                <option value="">All Types</option>
                {Object.entries(VITAL_TYPES).map(([type, config]) => (
                  <option key={type} value={type}>{config.label}</option>
                ))}
              </select>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input
                    type="date"
                    value={historyFilter.start}
                    onChange={(e) => setHistoryFilter({ ...historyFilter, start: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input
                    type="date"
                    value={historyFilter.end}
                    onChange={(e) => setHistoryFilter({ ...historyFilter, end: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
              
              {(historyFilter.type || historyFilter.start || historyFilter.end) && (
                <button
                  onClick={() => setHistoryFilter({ type: '', start: '', end: '' })}
                  className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* History List */}
          <div className="space-y-2">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No readings found</p>
                {historyFilter.type && (
                  <p className="text-sm mt-1">Try adjusting your filters</p>
                )}
              </div>
            ) : (
              filteredHistory.map((vital) => {
                const config = VITAL_TYPES[vital.vital_type]
                const Icon = config?.icon || BeakerIcon
                
                return (
                  <div
                    key={vital.id}
                    className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center gap-4"
                  >
                    <div 
                      className="p-2 rounded-lg flex-shrink-0"
                      style={{ backgroundColor: `${config?.color}20` || '#374151' }}
                    >
                      <Icon 
                        className="w-5 h-5" 
                        style={{ color: config?.color || '#9ca3af' }} 
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{config?.label}</span>
                        <span className="text-cyan-400 font-bold text-lg">
                          {formatValue(vital)}
                        </span>
                      </div>
                      <div className="text-gray-400 text-xs">
                        {new Date(vital.measured_at).toLocaleString('en-GB', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      {vital.notes && (
                        <div className="text-gray-500 text-xs mt-1 truncate">
                          {vital.notes}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Floating Quick Add Button */}
      <button
        onClick={() => setActiveView('log')}
        className="fixed bottom-24 right-5 bg-cyan-500 hover:bg-cyan-400 text-black w-14 h-14 rounded-full shadow-lg shadow-cyan-500/30 flex items-center justify-center transition-colors z-20"
      >
        <PlusIcon className="w-7 h-7" />
      </button>

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
            <div className="flex flex-col items-center py-2 text-cyan-400">
              <span className="text-xl mb-1">📊</span>
              <span className="text-xs">Vitals</span>
            </div>
            <Link 
              href="/supplements"
              className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-xl mb-1">💊</span>
              <span className="text-xs">Supplements</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
