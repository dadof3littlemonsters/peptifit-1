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