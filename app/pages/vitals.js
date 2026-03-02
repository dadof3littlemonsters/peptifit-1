import { useState, useEffect, useMemo } from 'react'
import { vitals, auth } from '../lib/api'
import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import BottomNav from '../components/BottomNav'
import {
  ArrowLeftIcon,
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
    shortLabel: 'Weight',
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
    shortLabel: 'BP',
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
    shortLabel: 'Glucose',
    unit: 'mg/dL',
    altUnit: 'mmol/L',
    icon: BeakerIcon,
    color: '#8b5cf6', // violet-500
    min: 30,
    max: 600,
    step: 1,
    quickValues: [80, 90, 100, 110, 120]
  },
  heart_rate: {
    label: 'Heart Rate',
    shortLabel: 'Heart',
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
    shortLabel: 'Body Fat',
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
    shortLabel: 'Temp',
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

  const hasAnyLatestReadings = useMemo(
    () => Object.values(latestReadings || {}).some(Boolean),
    [latestReadings]
  )

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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading vitals...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] min-h-screen flex flex-col overflow-hidden bg-gray-900 text-white">
      {/* Header */}
      <header className="h-14 flex-shrink-0 border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-full w-full max-w-lg items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex h-11 w-11 items-center justify-center text-gray-400 transition-colors hover:text-white">
                <ArrowLeftIcon className="h-6 w-6" />
              </Link>
              <h1 className="text-xl font-bold text-white">Vitals</h1>
            </div>
            <button
              onClick={() => setQuickMode(!quickMode)}
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
                quickMode ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
              }`}
              title="Quick Entry Mode"
            >
              <MicrophoneIcon className="h-5 w-5" />
            </button>
        </div>
      </header>

      <main className="page-content mx-auto flex-1 min-h-0 overflow-y-auto w-full max-w-lg px-4 pt-3 pb-[calc(104px+env(safe-area-inset-bottom))]">
        {/* View Tabs */}
        <div className="mt-0">
        <div className="bg-gray-800 rounded-xl p-1 flex gap-1">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'log', label: 'Log' },
            { id: 'history', label: 'History' }
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                activeView === id
                  ? 'bg-cyan-500 text-black'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4">
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
          </div>
        )}

        {/* Dashboard View */}
        {activeView === 'dashboard' && (
          <div className={`mt-4 ${hasAnyLatestReadings ? 'space-y-6' : 'space-y-4'}`}>
          {/* Latest Readings Grid */}
          <div>
            <h2 className={`font-semibold text-white ${hasAnyLatestReadings ? 'mb-3 text-lg' : 'mb-2 text-sm'}`}>Latest Readings</h2>
            <div className="grid grid-cols-3 gap-2">
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
                    className={`bg-gray-800 rounded-xl border transition-all cursor-pointer ${
                      reading ? 'p-2' : 'p-1.5'
                    } ${
                      chartType === type 
                        ? 'border-cyan-500 shadow-lg shadow-cyan-500/20' 
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 ${reading ? 'mb-2' : 'mb-1'}`}>
                      <div className={`rounded-lg ${reading ? 'p-1.5' : 'p-1'}`} style={{ backgroundColor: `${config.color}20` }}>
                        <Icon className={`${reading ? 'h-4 w-4' : 'h-3.5 w-3.5'}`} style={{ color: config.color }} />
                      </div>
                      <span className="text-[11px] leading-tight text-gray-400">{config.shortLabel || config.label}</span>
                    </div>
                    
                    <div className={`flex items-end ${reading ? 'gap-2' : 'gap-1'}`}>
                      <span className={`${reading ? 'text-lg' : 'text-base'} font-bold text-white`}>
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
          <div className="bg-gray-800 rounded-2xl p-3 border border-gray-700">
            <div className={`flex items-start justify-between ${chartData.length > 0 ? 'mb-4' : 'mb-2'}`}>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {VITAL_TYPES[chartType]?.label} Trend
                </h3>
                {chartData.length > 0 && (
                  <p className="text-gray-400 text-sm">
                    Last {timeRange} days
                  </p>
                )}
              </div>
              {chartData.length > 0 && (
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
              )}
            </div>
            
            {chartData.length > 0 && isClient ? (
              <div className="h-48">
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
              <div className="flex h-24 items-center justify-center text-gray-500">
                <div className="text-center">
                  <ChartBarIcon className="mx-auto mb-1 h-8 w-8 opacity-50" />
                  <p className="text-sm">{isClient ? 'No data for selected period' : 'Loading chart...'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Log Buttons */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Quick Log</h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(VITAL_TYPES).map(([type, config]) => {
                const Icon = config.icon
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type)
                      setActiveView('log')
                    }}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-2 flex flex-col items-center gap-1 text-center transition-colors"
                  >
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                    <span className="text-[11px] leading-tight text-gray-400 whitespace-normal break-words">
                      {config.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          </div>
        )}

        {/* Log Vital View */}
        {activeView === 'log' && (
          <div className="mt-6">
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
                        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-center text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
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
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-4 text-center text-3xl font-bold text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
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
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 py-3 pl-12 pr-4 text-base text-white focus:border-cyan-500 focus:outline-none"
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
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none resize-none"
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
          <div className="mt-6 space-y-4">
          {/* Filters */}
          <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <FunnelIcon className="w-5 h-5 text-cyan-400" />
              <span className="font-medium text-white">Filters</span>
            </div>
            
            <div className="space-y-3">
              <select
                value={historyFilter.type}
                onChange={(e) => setHistoryFilter({ ...historyFilter, type: e.target.value })}
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
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
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input
                    type="date"
                    value={historyFilter.end}
                    onChange={(e) => setHistoryFilter({ ...historyFilter, end: e.target.value })}
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
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
                    className="bg-gray-800 rounded-xl p-3 border border-gray-700 flex items-center gap-4"
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
      </main>

      <BottomNav active="vitals" />
    </div>
  )
}
