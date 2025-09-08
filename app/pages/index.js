import { useState, useEffect } from 'react'
import { auth, doses, peptides } from '../lib/api'
import Link from 'next/link'
import { 
  UserIcon,
  PlusIcon
} from '@heroicons/react/24/outline'

export default function LandingDashboard({ user }) {
  const [recentDoses, setRecentDoses] = useState([])
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    loadDashboardData()
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

  // Calculate stats for the week
  const getWeeklyStats = () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const thisWeekDoses = recentDoses.filter(dose => 
      new Date(dose.administration_time) > weekAgo
    )
    
    return {
      peptides: thisWeekDoses.length,
      workouts: 0, // Future implementation
      supplements: 0, // Future implementation
      vitals: 'None' // Future implementation
    }
  }

  // Calculate next dose info
  const getNextDoseInfo = () => {
    if (recentDoses.length === 0) return null
    
    // Find most recent GLP-1 dose
    const glpDoses = recentDoses.filter(dose => {
      const peptide = availablePeptides.find(p => p.id === dose.peptide_id)
      return peptide && (
        peptide.name.toLowerCase().includes('tirzepatide') || 
        peptide.name.toLowerCase().includes('retatrutide')
      )
    })
    
    if (glpDoses.length === 0) return null
    
    const lastDose = glpDoses[0]
    const peptide = availablePeptides.find(p => p.id === lastDose.peptide_id)
    const lastDoseTime = new Date(lastDose.administration_time)
    
    // Assume weekly dosing for now - will make configurable later
    const nextDoseTime = new Date(lastDoseTime.getTime() + (7 * 24 * 60 * 60 * 1000))
    const timeUntilNext = nextDoseTime.getTime() - Date.now()
    
    if (timeUntilNext <= 0) {
      return {
        isReady: true,
        peptideName: peptide?.name,
        doseAmount: lastDose.dose_amount,
        doseUnit: lastDose.dose_unit
      }
    }
    
    const hours = Math.floor(timeUntilNext / (1000 * 60 * 60))
    const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60))
    
    return {
      isReady: false,
      peptideName: peptide?.name,
      doseAmount: lastDose.dose_amount,
      doseUnit: lastDose.dose_unit,
      timeUntil: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    }
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
      
      days.push({
        date: new Date(currentDateObj),
        dayNumber: currentDateObj.getDate(),
        isCurrentMonth: currentDateObj.getMonth() === month,
        isToday: currentDateObj.toDateString() === new Date().toDateString(),
        doses: dayDoses,
        hasActivity: dayDoses.length > 0
      })
      
      currentDateObj.setDate(currentDateObj.getDate() + 1)
    }
    
    return days
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
            <button
              onClick={auth.logout}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <UserIcon className="h-6 w-6" />
            </button>
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
                        <div key={i} className="w-1 h-1 bg-cyan-400 rounded-full"></div>
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
                  <div className="text-white font-semibold">{availablePeptides.length}</div>
                  <div className="text-gray-400 text-xs">Available</div>
                </div>
                <div>
                  <div className="text-white font-semibold">{stats.peptides}</div>
                  <div className="text-gray-400 text-xs">This week</div>
                </div>
                <div>
                  <div className="text-white font-semibold">95%</div>
                  <div className="text-gray-400 text-xs">Adherence</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-xl border border-gray-600/50">
                <span className="text-cyan-400 font-medium text-sm">View peptides & log doses</span>
                <span className="text-cyan-400">→</span>
              </div>
            </div>
          </Link>

          {/* Future Modules - Coming Soon */}
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

        {/* Bottom padding for fixed nav */}
        <div className="h-20"></div>
      </div>
    </div>
  )
}