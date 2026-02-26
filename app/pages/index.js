import { useState, useEffect, useMemo } from 'react'
import { auth, doses, peptides, vitals, meals } from '../lib/api'
import Link from 'next/link'
import {
  UserIcon,
  XMarkIcon,
  CogIcon,
  FireIcon,
  PlusIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import PharmacokineticGraph from '../components/PharmacokineticGraph'

// Default calorie goal
const DEFAULT_CALORIE_GOAL = 2500

// Reusable compact section card component
function SectionCard({
  icon,
  title,
  subtitle,
  stats,
  ctaText,
  href,
  onClick,
  comingSoon = false,
  className = ''
}) {
  const CardWrapper = href ? Link : 'div'
  const wrapperProps = href ? { href } : { onClick }

  return (
    <CardWrapper
      {...wrapperProps}
      className={`
        block bg-gray-800 rounded-xl p-4 border border-gray-700
        ${!comingSoon ? 'hover:border-gray-600 hover:bg-gray-750 cursor-pointer' : 'opacity-50 cursor-default'}
        transition-all
        ${className}
      `}
    >
      {/* Header row: icon + title/subtitle */}
      <div className="flex items-center gap-3 mb-3">
        <div className="text-2xl flex-shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white truncate">
            {title}
            {comingSoon && <span className="text-xs text-gray-500 font-normal ml-1.5">Soon</span>}
          </h3>
          <p className="text-gray-400 text-xs truncate">{subtitle}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-3">
        {stats.map((stat, i) => (
          <div key={i} className="min-w-0">
            <div className={`text-sm font-semibold ${stat.color || 'text-white'} truncate`}>
              {stat.value}
            </div>
            <div className="text-gray-500 text-xs truncate">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* CTA row */}
      <div className={`
        flex items-center justify-between py-2 px-3 rounded-lg text-sm
        ${comingSoon
          ? 'bg-gray-700/30 text-gray-500'
          : 'bg-gray-700/50 text-cyan-400'
        }
      `}>
        <span className="font-medium truncate">{ctaText}</span>
        <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
      </div>
    </CardWrapper>
  )
}

export default function LandingDashboard({ user }) {
  const [recentDoses, setRecentDoses] = useState([])
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [userStack, setUserStack] = useState([])
  const [vitalsData, setVitalsData] = useState([])
  const [latestVitals, setLatestVitals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  
  // Calories card state
  const [todayMeals, setTodayMeals] = useState([])
  const [calorieGoal, setCalorieGoal] = useState(DEFAULT_CALORIE_GOAL)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddForm, setQuickAddForm] = useState({
    food_name: '',
    calories: '',
    meal_type: 'snack'
  })

  useEffect(() => {
    loadDashboardData()
    loadUserStack()
    loadTodayMeals()
    loadCalorieGoal()
  }, [])

  // Load today's meals from API
  const loadTodayMeals = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const response = await meals.getByDate(today)
      // API returns grouped meals, flatten them into an array
      const groupedMeals = response.meals || {}
      const allMeals = [
        ...(groupedMeals.breakfast || []),
        ...(groupedMeals.lunch || []),
        ...(groupedMeals.dinner || []),
        ...(groupedMeals.snack || [])
      ]
      setTodayMeals(allMeals)
    } catch (err) {
      console.error('Error loading today meals:', err)
    }
  }

  // Load calorie goal from localStorage
  const loadCalorieGoal = () => {
    try {
      const saved = localStorage.getItem('peptifit_calorie_goal')
      if (saved) {
        setCalorieGoal(parseInt(saved, 10))
      }
    } catch (err) {
      console.error('Error loading calorie goal:', err)
    }
  }

  // Calculate today's calorie totals
  const todayCalories = useMemo(() => {
    return todayMeals.reduce((acc, meal) => acc + (parseInt(meal.calories) || 0), 0)
  }, [todayMeals])

  const calorieProgress = Math.min((todayCalories / calorieGoal) * 100, 100)
  const remainingCalories = calorieGoal - todayCalories

  // Quick add handlers
  const openQuickAdd = () => {
    setQuickAddForm({
      food_name: '',
      calories: '',
      meal_type: 'snack'
    })
    setQuickAddOpen(true)
  }

  const closeQuickAdd = () => {
    setQuickAddOpen(false)
  }

  const handleQuickAddChange = (e) => {
    const { name, value } = e.target
    setQuickAddForm(prev => ({ ...prev, [name]: value }))
  }

  const handleQuickAddSubmit = async (e) => {
    e.preventDefault()
    if (!quickAddForm.food_name || !quickAddForm.calories) return

    const newMeal = {
      meal_type: quickAddForm.meal_type,
      food_name: quickAddForm.food_name,
      calories: parseInt(quickAddForm.calories, 10),
      protein: null,
      carbs: null,
      fat: null,
      logged_at: new Date().toISOString()
    }

    try {
      await meals.create(newMeal)
      await loadTodayMeals()
      closeQuickAdd()
    } catch (err) {
      console.error('Error saving meal:', err)
      alert('Failed to save meal. Please try again.')
    }
  }

  const loadDashboardData = async () => {
    try {
      const [dosesData, peptidesData, vitalsLatest] = await Promise.all([
        doses.getAll(),
        peptides.getAll(),
        vitals.getLatest().catch(() => null)
      ])
      setRecentDoses(dosesData)
      setAvailablePeptides(peptidesData)
      
      // Load vitals data for dashboard preview
      if (vitalsLatest) {
        const allVitals = Object.values(vitalsLatest)
        setLatestVitals(allVitals[0] || null)
        setVitalsData(allVitals)
      }
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
    const currentDate = new Date()
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
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">PeptiFit</h1>
              <p className="text-gray-500 text-xs">{formatDate()}</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-400 text-sm mr-2 hidden sm:inline">{user?.username}</span>
              <Link
                href="/configure-peptides"
                className="p-2 text-cyan-400 hover:text-cyan-300 transition-colors"
                title="Configure Peptides"
              >
                <CogIcon className="h-5 w-5" />
              </Link>
              <button
                onClick={auth.logout}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <UserIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* ===== HERO SECTION ===== */}
        <div className="mb-6 space-y-4">
          {/* This Week Calendar + Stats - Hero Widget */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-white">This Week</h3>
              <span className="text-cyan-400 text-xs">
                {new Date().toLocaleDateString('en-GB', { month: 'short' })}
              </span>
            </div>

            {/* Weekly Calendar Row */}
            <div className="grid grid-cols-7 gap-1.5 mb-3">
              {getWeeklyCalendarData().map((day, index) => (
                <div
                  key={index}
                  onClick={() => handleDayClick(day)}
                  className={`
                    aspect-square flex flex-col items-center justify-center text-xs font-medium rounded-lg cursor-pointer transition-colors
                    ${day.isToday ? 'bg-cyan-500 text-black font-bold' : 'bg-gray-700/50 hover:bg-gray-600/50'}
                    ${day.hasActivity && !day.isToday ? 'ring-1 ring-cyan-400/40' : ''}
                  `}
                >
                  <div className={`text-[10px] ${day.isToday ? 'text-black/60' : 'text-gray-500'}`}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][index]}
                  </div>
                  <div>{day.dayNumber}</div>
                  {day.hasActivity && (
                    <div className="flex gap-0.5 mt-0.5">
                      {day.doses.slice(0, 2).map((_, i) => (
                        <div key={`dot-${i}`} className={`w-1 h-1 rounded-full ${day.isToday ? 'bg-black/50' : 'bg-cyan-400'}`} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Inline Stats */}
            <div className="flex items-center justify-around text-xs border-t border-gray-700 pt-3">
              <div className="text-center">
                <div className="text-cyan-400 font-semibold">{getWeeklyCalendarData().filter(d => d.hasActivity).length}</div>
                <div className="text-gray-500">Active</div>
              </div>
              <div className="text-center">
                <div className="text-green-400 font-semibold">{getWeeklyCalendarData().reduce((t, d) => t + d.doses.length, 0)}</div>
                <div className="text-gray-500">Doses</div>
              </div>
              <div className="text-center">
                <div className="text-orange-400 font-semibold">{userStack.length > 0 ? '85%' : '-'}</div>
                <div className="text-gray-500">Adherence</div>
              </div>
            </div>
          </div>

          {/* Configure Peptide Stack CTA Banner */}
          {userStack.length === 0 && (
            <Link
              href="/configure-peptides"
              className="block bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl p-3 hover:from-cyan-500 hover:to-blue-500 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">⚙️</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">Configure Your Peptide Stack</div>
                  <div className="text-xs opacity-80">Set up personalized dosing schedules</div>
                </div>
                <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
              </div>
            </Link>
          )}

          {/* Next Dose Alert */}
          {nextDose && (
            <Link
              href="/log-dose"
              className={`block rounded-xl p-3 transition-all ${
                nextDose.isReady
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500'
                  : 'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">⏰</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">
                    {nextDose.isReady ? `${nextDose.peptideName} dose ready!` : `${nextDose.peptideName} due in ${nextDose.timeUntil}`}
                  </div>
                  <div className="text-xs opacity-80">
                    {nextDose.isReady ? 'Tap to log dose' : `Next dose • ${nextDose.doseAmount}${nextDose.doseUnit}`}
                  </div>
                </div>
                <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
              </div>
            </Link>
          )}

          {/* Due Today (compact, only if peptides configured) */}
          {userStack.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Due Today</h3>
                <span className="text-gray-500 text-xs">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</span>
              </div>
              <div className="space-y-2">
                {userStack.map((stackItem, index) => {
                  const peptide = availablePeptides.find(p => p.id === stackItem.peptide_id)
                  const lastDose = recentDoses
                    .filter(dose => dose.peptide_id === stackItem.peptide_id)
                    .sort((a, b) => new Date(b.administration_time) - new Date(a.administration_time))[0]
                  const isDueToday = lastDose
                    ? new Date(lastDose.administration_time).toDateString() !== new Date().toDateString()
                    : true
                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-2.5 rounded-lg ${
                        isDueToday ? 'bg-cyan-600/10 border border-cyan-500/20' : 'bg-gray-700/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">💉</span>
                        <div className="min-w-0">
                          <div className="text-white text-sm font-medium truncate">{peptide?.name}</div>
                          <div className="text-gray-400 text-xs">
                            {stackItem.schedule.doses[0]?.amount}{stackItem.schedule.doses[0]?.unit}
                          </div>
                        </div>
                      </div>
                      {isDueToday ? (
                        <Link
                          href="/log-dose"
                          className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-2.5 py-1 rounded text-xs transition-colors flex-shrink-0"
                        >
                          Log
                        </Link>
                      ) : (
                        <span className="text-green-400 text-xs font-medium bg-green-500/20 px-2 py-0.5 rounded flex-shrink-0">✓ Done</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* GLP-1 Pharmacokinetic Graph */}
          <PharmacokineticGraph
            recentDoses={recentDoses}
            userStack={userStack}
            availablePeptides={availablePeptides}
          />
        </div>

        {/* ===== CALORIES CARD (Prominent) ===== */}
        <div className="mb-6">
          <div className="bg-gradient-to-br from-gray-800 to-gray-800/80 rounded-xl p-4 border border-orange-500/20 shadow-lg shadow-orange-500/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <FireIcon className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Calories</h3>
                  <p className="text-gray-500 text-xs">Today's intake</p>
                </div>
              </div>
              <Link href="/meals" className="text-cyan-400 hover:text-cyan-300 text-xs font-medium">
                View all →
              </Link>
            </div>

            {/* Progress Display */}
            <div className="mb-3">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-2xl font-bold text-white">{todayCalories}</span>
                <span className="text-gray-400 text-sm">/ {calorieGoal} kcal</span>
              </div>
              <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all duration-500"
                  style={{ width: `${calorieProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${remainingCalories >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {remainingCalories >= 0 ? `${remainingCalories} remaining` : `${Math.abs(remainingCalories)} over`}
                </span>
                <span className="text-gray-500">{Math.round(calorieProgress)}%</span>
              </div>
            </div>

            {/* Quick Add */}
            <button
              onClick={openQuickAdd}
              className="w-full bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 text-cyan-400 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <PlusIcon className="h-4 w-4" />
              Quick Add Food
            </button>
          </div>
        </div>

        {/* ===== SECTION CARDS GRID ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-6">
          {/* Peptides */}
          <SectionCard
            icon="💉"
            title="Peptides"
            subtitle="Track your protocols"
            stats={[
              { value: userStack.length > 0 ? userStack.length : availablePeptides.length, label: userStack.length > 0 ? 'In stack' : 'Available' },
              { value: stats.peptides, label: 'This week' },
              { value: userStack.length > 0 ? '95%' : '-', label: 'Adherence' }
            ]}
            ctaText={userStack.length > 0 ? 'View stack' : 'Setup stack'}
            href="/log-dose"
          />

          {/* Supplements */}
          <SectionCard
            icon="💊"
            title="Supplements"
            subtitle="Daily routine"
            stats={[
              { value: '-', label: 'This week' },
              { value: '-', label: 'Due today' },
              { value: '-', label: 'In stock' }
            ]}
            ctaText="Track supplements"
            href="/supplements"
          />

          {/* Meals */}
          <SectionCard
            icon="🍽️"
            title="Meals"
            subtitle="Nutrition & macros"
            stats={[
              { value: todayMeals.length, label: 'Today' },
              { value: todayCalories, label: 'Calories' },
              { value: remainingCalories >= 0 ? remainingCalories : Math.abs(remainingCalories), label: remainingCalories >= 0 ? 'Left' : 'Over', color: remainingCalories >= 0 ? 'text-green-400' : 'text-red-400' }
            ]}
            ctaText="Log meals"
            href="/meals"
          />

          {/* Vitals */}
          <SectionCard
            icon="📊"
            title="Vitals"
            subtitle="Weight, BP, glucose"
            stats={[
              { value: vitalsData?.length || '-', label: 'Readings' },
              { value: latestVitals ? new Date(latestVitals.measured_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '-', label: 'Last' },
              { value: '7', label: 'Types' }
            ]}
            ctaText="Track vitals"
            href="/vitals"
          />

          {/* Blood Results */}
          <SectionCard
            icon="🧪"
            title="Blood Results"
            subtitle="AI-powered analysis"
            stats={[
              { value: '-', label: 'Panels' },
              { value: '-', label: 'Last test' },
              { value: '-', label: 'Flagged' }
            ]}
            ctaText="Log & analyze"
            href="/blood-results"
          />

          {/* Workouts - Coming Soon */}
          <SectionCard
            icon="🏋️"
            title="Workouts"
            subtitle="Training sessions"
            stats={[
              { value: '-', label: 'This week' },
              { value: '-', label: 'Last' },
              { value: '-', label: 'Progress' }
            ]}
            ctaText="Coming soon"
            comingSoon
          />
        </div>

        {/* Spacer for bottom nav */}
        <div className="h-16"></div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-5 py-1.5">
            <div className="flex flex-col items-center py-1.5 text-cyan-400">
              <span className="text-lg mb-0.5">🏠</span>
              <span className="text-[10px]">Dashboard</span>
            </div>
            <Link href="/log-dose" className="flex flex-col items-center py-1.5 text-gray-400 hover:text-white transition-colors">
              <span className="text-lg mb-0.5">💉</span>
              <span className="text-[10px]">Peptides</span>
            </Link>
            <Link href="/meals" className="flex flex-col items-center py-1.5 text-gray-400 hover:text-white transition-colors">
              <span className="text-lg mb-0.5">🍽️</span>
              <span className="text-[10px]">Meals</span>
            </Link>
            <Link href="/vitals" className="flex flex-col items-center py-1.5 text-gray-400 hover:text-white transition-colors">
              <span className="text-lg mb-0.5">📊</span>
              <span className="text-[10px]">Vitals</span>
            </Link>
            <Link href="/supplements" className="flex flex-col items-center py-1.5 text-gray-400 hover:text-white transition-colors">
              <span className="text-lg mb-0.5">💊</span>
              <span className="text-[10px]">Supplements</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Day Detail Modal */}
      {modalOpen && selectedDay && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-gray-800 rounded-xl p-5 w-full max-w-sm border border-gray-700 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{formatDayTitle(selectedDay.date)}</h3>
                <p className="text-gray-400 text-xs">
                  {selectedDay.doses.length > 0
                    ? `${selectedDay.doses.length} dose${selectedDay.doses.length > 1 ? 's' : ''} logged`
                    : 'No activity logged'}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {selectedDay.doses.length > 0 ? (
              <div className="space-y-3 mb-4">
                <h4 className="text-sm font-semibold text-white">Peptides</h4>
                {selectedDay.doses.map((dose, index) => {
                  const peptide = availablePeptides.find(p => p.id === dose.peptide_id)
                  return (
                    <div key={index} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="text-white text-sm font-semibold">{peptide?.name}</h5>
                        <span className="bg-purple-600 text-white px-2 py-0.5 rounded text-xs font-medium">
                          {dose.dose_amount}{dose.dose_unit}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-gray-500 mb-0.5">Site</div>
                          <div className="text-white">{dose.injection_site || 'Not specified'}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-0.5">Time</div>
                          <div className="text-cyan-400">{formatTime(dose.administration_time)}</div>
                        </div>
                      </div>
                      {dose.notes && (
                        <div className="mt-2 p-2 bg-gray-800 rounded text-xs text-gray-300 italic">
                          {dose.notes}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-6 mb-4">
                <div className="text-4xl mb-2 opacity-60">💉</div>
                <h4 className="text-sm font-semibold text-white mb-1">No doses logged</h4>
                <p className="text-gray-400 text-xs">Did you take any peptides this day?</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/log-dose"
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-2.5 px-3 rounded-lg text-center text-sm transition-colors"
                onClick={closeModal}
              >
                {selectedDay.doses.length > 0 ? 'Add Another' : 'Log Dose'}
              </Link>
              <button className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2.5 px-3 rounded-lg text-sm transition-colors border border-gray-600">
                {selectedDay.isToday ? 'View Schedule' : 'Edit Day'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Calories Modal */}
      {quickAddOpen && (
        <div
          className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={closeQuickAdd}
        >
          <div
            className="bg-gray-800 w-full max-w-sm rounded-xl p-5 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Quick Add Food</h3>
              <button
                onClick={closeQuickAdd}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  Food Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="food_name"
                  value={quickAddForm.food_name}
                  onChange={handleQuickAddChange}
                  placeholder="e.g., Protein Shake"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  Calories <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  name="calories"
                  value={quickAddForm.calories}
                  onChange={handleQuickAddChange}
                  placeholder="e.g., 250"
                  min="0"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">Meal Type</label>
                <select
                  name="meal_type"
                  value={quickAddForm.meal_type}
                  onChange={handleQuickAddChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="breakfast">🌅 Breakfast</option>
                  <option value="lunch">☀️ Lunch</option>
                  <option value="dinner">🌙 Dinner</option>
                  <option value="snack">🍿 Snack</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-2.5 rounded-lg text-sm transition-colors mt-4"
              >
                Add Food
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}