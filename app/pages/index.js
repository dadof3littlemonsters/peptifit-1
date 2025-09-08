import { useState, useEffect } from 'react'
import { auth, doses, peptides } from '../lib/api'
import Link from 'next/link'
import { 
  UserIcon,
  XMarkIcon,
  CogIcon
} from '@heroicons/react/24/outline'

export default function LandingDashboard({ user }) {
  const [recentDoses, setRecentDoses] = useState([])
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [userStack, setUserStack] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    loadDashboardData()
    loadUserStack()
  }, [])

  const loadDashboardData = async () => {
    try {
      const [dosesData, peptidesData] = await Promise.all([
        doses.getAll(),
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

  const loadUserStack = async () => {
    // TODO: Load from API - for now using localStorage
    try {
      const saved = localStorage.getItem('peptifit_user_stack')
      if (saved) {
        setUserStack(JSON.parse(saved))
      }
    } catch (err) {
      console.error('Error loading user stack:', err)
    }
  }

  // Calculate stats for the week - prioritize user's configured peptides
  const getWeeklyStats = () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const thisWeekDoses = recentDoses.filter(dose => 
      new Date(dose.administration_time) > weekAgo
    )
    
    // If user has configured peptides, only count those
    const relevantDoses = userStack.length > 0 
      ? thisWeekDoses.filter(dose => 
          userStack.some(item => item.peptide_id === dose.peptide_id)
        )
      : thisWeekDoses
    
    return {
      peptides: relevantDoses.length,
      workouts: 0, // Future implementation
      supplements: 0, // Future implementation
      vitals: 'None' // Future implementation
    }
  }

  // Calculate next dose info based on user's configured schedules
  const getNextDoseInfo = () => {
    if (userStack.length === 0 || recentDoses.length === 0) return null
    
    // Find next dose based on user's configured schedules
    let nextDoseInfo = null
    let earliestTime = Infinity
    
    userStack.forEach(stackItem => {
      const peptideDoses = recentDoses.filter(dose => dose.peptide_id === stackItem.peptide_id)
      if (peptideDoses.length === 0) return
      
      const lastDose = peptideDoses[0]
      const peptide = availablePeptides.find(p => p.id === stackItem.peptide_id)
      const schedule = stackItem.schedule
      
      if (schedule.frequency === 'weekly') {
        const lastDoseTime = new Date(lastDose.administration_time)
        const nextDoseTime = new Date(lastDoseTime.getTime() + (7 * 24 * 60 * 60 * 1000))
        
        if (nextDoseTime.getTime() < earliestTime) {
          earliestTime = nextDoseTime.getTime()
          const timeUntilNext = nextDoseTime.getTime() - Date.now()
          
          if (timeUntilNext <= 0) {
            nextDoseInfo = {
              isReady: true,
              peptideName: peptide?.name,
              doseAmount: schedule.doses[0]?.amount,
              doseUnit: schedule.doses[0]?.unit
            }
          } else {
            const hours = Math.floor(timeUntilNext / (1000 * 60 * 60))
            const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60))
            
            nextDoseInfo = {
              isReady: false,
              peptideName: peptide?.name,
              doseAmount: schedule.doses[0]?.amount,
              doseUnit: schedule.doses[0]?.unit,
              timeUntil: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
            }
          }
        }
      }
      // TODO: Add logic for other frequency types (custom-weekly, daily, etc.)
    })
    
    return nextDoseInfo
  }

  // Generate weekly calendar data
  const getWeeklyCalendarData = () => {
    const today = new Date()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay()) // Start from Sunday
    
    const days = []
    const currentDateObj = new Date(startOfWeek)
    
    // Generate 7 days (this week)
    for (let i = 0; i < 7; i++) {
      const dayDoses = recentDoses.filter(dose => {
        const doseDate = new Date(dose.administration_time)
        return doseDate.toDateString() === currentDateObj.toDateString()
      })
      
      // Filter to user's configured peptides if they have any
      const relevantDoses = userStack.length > 0 
        ? dayDoses.filter(dose => 
            userStack.some(item => item.peptide_id === dose.peptide_id)
          )
        : dayDoses
      
      days.push({
        date: new Date(currentDateObj),
        dayNumber: currentDateObj.getDate(),
        isCurrentMonth: currentDateObj.getMonth() === today.getMonth(),
        isToday: currentDateObj.toDateString() === today.toDateString(),
        isThisWeek: true,
        doses: relevantDoses,
        hasActivity: relevantDoses.length > 0,
        workouts: [], 
        supplements: [],
        vitals: []
      })
      
      currentDateObj.setDate(currentDateObj.getDate() + 1)
    }
    
    return days
  }

  // Generate full month calendar data (for reference)
  const getCalendarData = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())
    
    const days = []
    const currentDateObj = new Date(startDate)
    
    // Generate 42 days (6 weeks)
    for (let i = 0; i < 42; i++) {
      const dayDoses = recentDoses.filter(dose => {
        const doseDate = new Date(dose.administration_time)
        return doseDate.toDateString() === currentDateObj.toDateString()
      })
      
      // Filter to user's configured peptides if they have any
      const relevantDoses = userStack.length > 0 
        ? dayDoses.filter(dose => 
            userStack.some(item => item.peptide_id === dose.peptide_id)
          )
        : dayDoses
      
      days.push({
        date: new Date(currentDateObj),
        dayNumber: currentDateObj.getDate(),
        isCurrentMonth: currentDateObj.getMonth() === month,
        isToday: currentDateObj.toDateString() === new Date().toDateString(),
        doses: relevantDoses,
        hasActivity: relevantDoses.length > 0,
        workouts: [], 
        supplements: [],
        vitals: []
      })
      
      currentDateObj.setDate(currentDateObj.getDate() + 1)
    }
    
    return days
  }

  // Handle day click
  const handleDayClick = (day) => {
    setSelectedDay(day)
    setModalOpen(true)
  }

  // Close modal
  const closeModal = () => {
    setModalOpen(false)
    setSelectedDay(null)
  }

  // Format time for display
  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Format day for modal title
  const formatDayTitle = (date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDate = () => {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      month: 'long', 
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  const stats = getWeeklyStats()
  const nextDose = getNextDoseInfo()

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-black border-b border-gray-800">
        <div className="max-w-md mx-auto px-5 py-5">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <h1 className="text-2xl font-bold text-white">PeptiFit</h1>
              <p className="text-gray-400 text-sm">Welcome back, {user?.username}</p>
              <p className="text-gray-500 text-xs">{formatDate()}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link 
                href="/configure-peptides"
                className="p-2 text-cyan-400 hover:text-cyan-300 transition-colors"
                title="Configure Peptides"
              >
                <CogIcon className="h-6 w-6" />
              </Link>
              <button
                onClick={auth.logout}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <UserIcon className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto">
        {/* Due Today Section */}
        <div className="p-5">
          <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Due Today</h2>
              <span className="text-cyan-400 text-sm">{new Date().toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>
            
            {userStack.length > 0 ? (
              <div className="space-y-3">
                {userStack.map((stackItem, index) => {
                  const peptide = availablePeptides.find(p => p.id === stackItem.peptide_id)
                  const lastDose = recentDoses
                    .filter(dose => dose.peptide_id === stackItem.peptide_id)
                    .sort((a, b) => new Date(b.administration_time) - new Date(a.administration_time))[0]
                  
                  const isDueToday = lastDose ? 
                    new Date(lastDose.administration_time).toDateString() !== new Date().toDateString() :
                    true
                  
                  return (
                    <div key={index} className={`p-3 rounded-xl border ${
                      isDueToday 
                        ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-cyan-500/30' 
                        : 'bg-gray-700/50 border-gray-600/50'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-cyan-500/20 rounded-full flex items-center justify-center">
                            <span className="text-cyan-400 text-sm">💉</span>
                          </div>
                          <div>
                            <div className="text-white font-medium text-sm">{peptide?.name}</div>
                            <div className="text-gray-400 text-xs">
                              {stackItem.schedule.doses[0]?.amount}{stackItem.schedule.doses[0]?.unit}
                              {stackItem.schedule.frequency === 'daily' ? ' daily' : 
                               stackItem.schedule.frequency === 'weekly' ? ' weekly' : 
                               ' custom schedule'}
                            </div>
                          </div>
                        </div>
                        
                        {isDueToday ? (
                          <Link 
                            href="/log-dose"
                            className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
                          >
                            Log Dose
                          </Link>
                        ) : (
                          <div className="text-green-400 text-xs font-medium px-2 py-1 bg-green-500/20 rounded">
                            ✅ Taken
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-4xl mb-3 opacity-60">💉</div>
                <h3 className="text-white font-medium mb-2">No peptides configured</h3>
                <p className="text-gray-400 text-sm mb-4">Set up your peptide stack to see what's due today</p>
                <Link 
                  href="/configure-peptides"
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors inline-block"
                >
                  Configure Peptides
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* GLP-1 Pharmacokinetic Graph Placeholder */}
        <div className="px-5 mb-5">
          <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">System Levels</h2>
              <span className="text-cyan-400 text-sm">GLP-1 Analog</span>
            </div>
            
            <div className="bg-gray-900/50 rounded-xl p-4 mb-4 border border-gray-700">
              <div className="relative h-32 bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg overflow-hidden">
                {/* Graph placeholder with simulated curve */}
                <div className="absolute inset-0">
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-600"></div>
                  <div className="absolute left-0 top-1/2 w-full h-px bg-gray-600"></div>
                  <div className="absolute left-0 top-1/4 w-full h-px bg-gray-600"></div>
                  <div className="absolute left-0 top-3/4 w-full h-px bg-gray-600"></div>
                  
                  {/* Simulated pharmacokinetic curve */}
                  <div className="absolute bottom-0 left-0 w-full" style={{ height: '100%' }}>
                    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path 
                        d="M0,100 C20,40 40,20 60,30 C80,40 90,20 100,30" 
                        stroke="#06b6d4" 
                        strokeWidth="2" 
                        fill="none" 
                        strokeDasharray="4 2"
                      />
                      <path 
                        d="M0,100 C20,40 40,20 60,30 C80,40 90,20 100,30" 
                        stroke="#06b6d4" 
                        strokeWidth="3" 
                        fill="url(#gradient)"
                        opacity="0.3"
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  
                  {/* Current level indicator */}
                  <div className="absolute top-1/4 right-4 transform -translate-y-1/2">
                    <div className="bg-cyan-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                      Current: 72%
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-2 text-xs text-gray-400 mt-2">
                <div>0h</div>
                <div className="text-center">6h</div>
                <div className="text-center">12h</div>
                <div className="text-right">24h</div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="text-center p-2 bg-gray-700/50 rounded-lg">
                <div className="text-cyan-400 font-semibold">72%</div>
                <div className="text-gray-400 text-xs">Current</div>
              </div>
              <div className="text-center p-2 bg-gray-700/50 rounded-lg">
                <div className="text-green-400 font-semibold">12h</div>
                <div className="text-gray-400 text-xs">Peak</div>
              </div>
              <div className="text-center p-2 bg-gray-700/50 rounded-lg">
                <div className="text-orange-400 font-semibold">36h</div>
                <div className="text-gray-400 text-xs">Half-life</div>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 text-sm">💡</span>
                <span className="text-cyan-400 text-xs">
                  Based on last dose timing and peptide pharmacokinetics
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Prompt */}
        {userStack.length === 0 && (
          <div className="mx-5 mb-5">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl p-4 flex items-center gap-3 shadow-lg">
              <span className="text-2xl">⚙️</span>
              <div className="flex-1">
                <div className="font-semibold text-sm">Configure Your Peptide Stack</div>
                <div className="text-xs opacity-90">
                  Set up personalized dosing schedules for better tracking
                </div>
              </div>
              <Link href="/configure-peptides" className="text-lg">→</Link>
            </div>
          </div>
        )}

        {/* Next Dose Alert */}
        {nextDose && (
          <div className="mx-5 mb-5">
            <div className={`rounded-2xl p-4 flex items-center gap-3 shadow-lg ${
              nextDose.isReady 
                ? 'bg-gradient-to-r from-green-600 to-emerald-600' 
                : 'bg-gradient-to-r from-purple-600 to-violet-600'
            }`}>
              <span className="text-2xl">⏰</span>
              <div className="flex-1">
                <div className="font-semibold text-sm">
                  {nextDose.isReady 
                    ? `${nextDose.peptideName} dose ready!`
                    : `${nextDose.peptideName} due in ${nextDose.timeUntil}`
                  }
                </div>
                <div className="text-xs opacity-90">
                  {nextDose.isReady ? 'Tap to log dose' : `Next dose • ${nextDose.doseAmount}${nextDose.doseUnit}`}
                </div>
              </div>
              <span className="text-lg">→</span>
            </div>
          </div>
        )}

        {/* This Week Schedule */}
        <div className="mx-5 mb-5">
          <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-lg">
            {/* Week Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">This Week</h3>
              <span className="text-cyan-400 text-sm">
                {new Date().toLocaleDateString('en-GB', { month: 'short' })} Week
              </span>
            </div>

            {/* Weekly Schedule Grid */}
            <div className="grid grid-cols-7 gap-1">
              {getWeeklyCalendarData().map((day, index) => (
                <div
                  key={index}
                  onClick={() => handleDayClick(day)}
                  className={`
                    aspect-square flex flex-col items-center justify-center text-sm font-medium rounded-lg cursor-pointer transition-colors
                    ${day.isToday ? 'bg-cyan-500 text-black font-bold' : 'bg-gray-700/50 hover:bg-gray-600/50'}
                    ${day.hasActivity ? 'border border-cyan-400/30' : ''}
                  `}
                >
                  <div className="text-xs text-gray-400 mb-1">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][index]}
                  </div>
                  <div className={`${day.isToday ? 'text-black' : 'text-white'}`}>
                    {day.dayNumber}
                  </div>
                  {day.hasActivity && (
                    <div className="flex gap-0.5 mt-1">
                      {day.doses.slice(0, 2).map((_, i) => (
                        <div key={`peptide-${i}`} className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Quick Stats */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className="text-cyan-400 font-semibold">
                    {getWeeklyCalendarData().filter(day => day.hasActivity).length}
                  </div>
                  <div className="text-gray-400">Active days</div>
                </div>
                <div className="text-center">
                  <div className="text-green-400 font-semibold">
                    {getWeeklyCalendarData().reduce((total, day) => total + day.doses.length, 0)}
                  </div>
                  <div className="text-gray-400">Total doses</div>
                </div>
                <div className="text-center">
                  <div className="text-orange-400 font-semibold">
                    {userStack.length > 0 ? '85%' : '-'}
                  </div>
                  <div className="text-gray-400">Adherence</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Module Cards */}
        <div className="px-5 pb-5 space-y-4">
          {/* Peptides Module */}
          <Link href="/peptides" className="block">
            <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 hover:border-gray-600 transition-all hover:-translate-y-1 shadow-lg hover:shadow-xl">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-3xl mb-2">💉</div>
                  <h3 className="text-xl font-semibold text-white">Peptides</h3>
                  <p className="text-gray-400 text-sm">Track your peptide protocols</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-white font-semibold">
                    {userStack.length > 0 ? userStack.length : availablePeptides.length}
                  </div>
                  <div className="text-gray-400 text-xs">
                    {userStack.length > 0 ? 'In your stack' : 'Available'}
                  </div>
                </div>
                <div>
                  <div className="text-white font-semibold">{stats.peptides}</div>
                  <div className="text-gray-400 text-xs">This week</div>
                </div>
                <div>
                  <div className="text-white font-semibold">
                    {userStack.length > 0 ? '95%' : '-'}
                  </div>
                  <div className="text-gray-400 text-xs">Adherence</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-xl border border-gray-600/50">
                <span className="text-cyan-400 font-medium text-sm">
                  {userStack.length > 0 ? 'View stack & log doses' : 'Setup peptide stack'}
                </span>
                <span className="text-cyan-400">→</span>
              </div>
            </div>
          </Link>

          {/* Future Modules */}
          {[
            { icon: '🏋️', title: 'Workouts', subtitle: 'Track training sessions & progress', alert: 'Exercise tracking - Coming Soon!' },
            { icon: '💊', title: 'Supplements', subtitle: 'Manage daily supplement routine', alert: 'Supplements tracking - Coming Soon!' },
            { icon: '📊', title: 'Vitals', subtitle: 'Monitor weight, BP, glucose & more', alert: 'Vitals tracking - Coming Soon!' }
          ].map((module, index) => (
            <div 
              key={index} 
              className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700 opacity-60 shadow-lg cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => alert(module.alert)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-3xl mb-2">{module.icon}</div>
                  <h3 className="text-xl font-semibold text-white">
                    {module.title} <span className="text-sm text-gray-500 font-normal">(Coming Soon)</span>
                  </h3>
                  <p className="text-gray-400 text-sm">{module.subtitle}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-white font-semibold">-</div>
                  <div className="text-gray-400 text-xs">This week</div>
                </div>
                <div>
                  <div className="text-white font-semibold">-</div>
                  <div className="text-gray-400 text-xs">Last entry</div>
                </div>
                <div>
                  <div className="text-white font-semibold">-</div>
                  <div className="text-gray-400 text-xs">Progress</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-xl border border-gray-600/30">
                <span className="text-gray-500 font-medium text-sm">Coming in next update</span>
                <span className="text-gray-500">→</span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Navigation - 4 Prongs */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800">
          <div className="max-w-md mx-auto">
            <div className="grid grid-cols-5 py-2">
              <div className="flex flex-col items-center py-2 text-cyan-400">
                <span className="text-xl mb-1">🏠</span>
                <span className="text-xs">Dashboard</span>
              </div>
              <Link href="/peptides" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
                <span className="text-xl mb-1">💉</span>
                <span className="text-xs">Peptides</span>
              </Link>
              <button 
                onClick={() => alert('Exercise tracking - Coming Soon!')}
                className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
              >
                <span className="text-xl mb-1">🏋️</span>
                <span className="text-xs">Exercise</span>
              </button>
              <button 
                onClick={() => alert('Vitals tracking - Coming Soon!')}
                className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
              >
                <span className="text-xl mb-1">📊</span>
                <span className="text-xs">Vitals</span>
              </button>
              <button 
                onClick={() => alert('Supplements tracking - Coming Soon!')}
                className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
              >
                <span className="text-xl mb-1">💊</span>
                <span className="text-xs">Supplements</span>
              </button>
            </div>
          </div>
        </div>

        <div className="h-20"></div>
      </div>

      {/* Day Detail Modal */}
      {modalOpen && selectedDay && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-5"
          onClick={closeModal}
        >
          <div 
            className="bg-gray-800 rounded-3xl p-6 w-full max-w-sm border border-gray-700 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-semibold text-white">{formatDayTitle(selectedDay.date)}</h3>
                <p className="text-gray-400 text-sm">
                  {selectedDay.doses.length > 0 
                    ? `${selectedDay.doses.length} dose${selectedDay.doses.length > 1 ? 's' : ''} logged`
                    : 'No activity logged'
                  }
                </p>
              </div>
              <button 
                onClick={closeModal}
                className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {selectedDay.doses.length > 0 ? (
              <div className="space-y-4 mb-6">
                <h4 className="text-lg font-semibold text-white">Peptides</h4>
                {selectedDay.doses.map((dose, index) => {
                  const peptide = availablePeptides.find(p => p.id === dose.peptide_id)
                  return (
                    <div key={index} className="bg-gray-700 rounded-xl p-4 border border-gray-600">
                      <div className="flex justify-between items-center mb-3">
                        <h5 className="text-white font-semibold">{peptide?.name}</h5>
                        <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                          {dose.dose_amount}{dose.dose_unit}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Injection site</div>
                          <div className="text-white">{dose.injection_site || 'Not specified'}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Time</div>
                          <div className="text-cyan-400">{formatTime(dose.administration_time)}</div>
                        </div>
                      </div>
                      {dose.notes && (
                        <div className="mt-3 p-2 bg-gray-800 rounded-lg">
                          <div className="text-gray-300 text-sm italic">{dose.notes}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 mb-6">
                <div className="text-5xl mb-3 opacity-60">💉</div>
                <h4 className="text-lg font-semibold text-white mb-2">No doses logged</h4>
                <p className="text-gray-400 text-sm">Did you take any peptides this day?</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/log-dose"
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 px-4 rounded-xl text-center transition-colors"
                onClick={closeModal}
              >
                {selectedDay.doses.length > 0 ? 'Add Another' : 'Log Dose'}
              </Link>
              <button className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors border border-gray-600">
                {selectedDay.isToday ? 'View Schedule' : 'Edit Day'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}