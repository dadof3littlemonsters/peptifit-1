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
  const [currentDate, setCurrentDate] = useState(new Date())
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

  // Generate calendar data
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
        // Future: add workouts, supplements, vitals arrays
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

  // Navigation functions
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))
  }

  const formatDate = () => {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      month: 'long', 
      day: 'numeric'
    })
  }

  const formatMonthYear = () => {
    return currentDate.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric'
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
  const calendarDays = getCalendarData()

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
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 p-5">
          <div className="bg-gray-800 rounded-2xl p-5 text-center border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
            <div className="text-2xl mb-2">💉</div>
            <div className="text-2xl font-bold text-white">{stats.peptides}</div>
            <div className="text-gray-400 text-xs font-medium">Peptides this week</div>
          </div>
          
          <div className="bg-gray-800 rounded-2xl p-5 text-center border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 to-emerald-500"></div>
            <div className="text-2xl mb-2">🏋️</div>
            <div className="text-2xl font-bold text-white">{stats.workouts}</div>
            <div className="text-gray-400 text-xs font-medium">Workouts this week</div>
          </div>
          
          <div className="bg-gray-800 rounded-2xl p-5 text-center border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-yellow-500"></div>
            <div className="text-2xl mb-2">💊</div>
            <div className="text-2xl font-bold text-white">{stats.supplements}</div>
            <div className="text-gray-400 text-xs font-medium">Supplements today</div>
          </div>
          
          <div className="bg-gray-800 rounded-2xl p-5 text-center border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-pink-500"></div>
            <div className="text-2xl mb-2">📊</div>
            <div className="text-xl font-bold text-white">{stats.vitals}</div>
            <div className="text-gray-400 text-xs font-medium">Last vitals</div>
          </div>
        </div>

        {/* Configuration Prompt */}
        {userStack.length === 0 && (
          <div className="mx-5 mb-5">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl p-4 flex items-center gap-3">
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
            <div className={`rounded-2xl p-4 flex items-center gap-3 ${
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

        {/* Calendar */}
        <div className="mx-5 mb-5">
          <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-5">
              <button 
                onClick={goToPreviousMonth}
                className="p-2 text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
              >
                ‹
              </button>
              <h3 className="text-lg font-semibold text-white">{formatMonthYear()}</h3>
              <button 
                onClick={goToNextMonth}
                className="p-2 text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
              >
                ›
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center p-3 text-xs font-medium text-gray-400">
                  {day}
                </div>
              ))}
              
              {calendarDays.map((day, index) => (
                <div
                  key={index}
                  onClick={() => handleDayClick(day)}
                  className={`
                    aspect-square flex flex-col items-center justify-center text-sm font-medium rounded-lg cursor-pointer transition-colors
                    ${day.isCurrentMonth ? 'text-gray-300' : 'text-gray-600'}
                    ${day.isToday ? 'bg-cyan-500 text-black font-bold' : 'hover:bg-gray-700/50'}
                    ${day.hasActivity && !day.isToday ? 'text-white' : ''}
                  `}
                >
                  {day.dayNumber}
                  {day.hasActivity && (
                    <div className="flex gap-0.5 mt-0.5">
                      {day.doses.slice(0, 3).map((_, i) => (
                        <div key={`peptide-${i}`} className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Module Cards */}
        <div className="px-5 pb-5 space-y-4">
          {/* Peptides Module */}
          <Link href="/peptides" className="block">
            <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 hover:border-gray-600 transition-all hover:-translate-y-1">
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
            { icon: '🏋️', title: 'Workouts', subtitle: 'Track training sessions & progress' },
            { icon: '💊', title: 'Supplements', subtitle: 'Manage daily supplement routine' },
            { icon: '📊', title: 'Vitals', subtitle: 'Monitor weight, BP, glucose & more' }
          ].map((module, index) => (
            <div key={index} className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700 opacity-60">
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

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800">
          <div className="max-w-md mx-auto">
            <div className="grid grid-cols-4 py-2">
              <div className="flex flex-col items-center py-2 text-cyan-400">
                <span className="text-xl mb-1">🏠</span>
                <span className="text-xs">Home</span>
              </div>
              <Link href="/peptides" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
                <span className="text-xl mb-1">💉</span>
                <span className="text-xs">Peptides</span>
              </Link>
              <div className="flex flex-col items-center py-2 text-gray-400">
                <span className="text-xl mb-1">📊</span>
                <span className="text-xs">Analytics</span>
              </div>
              <button 
                onClick={auth.logout}
                className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
              >
                <span className="text-xl mb-1">👤</span>
                <span className="text-xs">Profile</span>
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