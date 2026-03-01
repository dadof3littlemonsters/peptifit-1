import { useState, useEffect, useMemo } from 'react'
import { doses, peptides, vitals, meals, food, bloodResults } from '../lib/api'
import Link from 'next/link'
import BottomNav from '../components/BottomNav'
import {
  ChevronDownIcon,
  HeartIcon,
  XMarkIcon,
  PlusIcon
} from '@heroicons/react/24/outline'

// Default calorie goal
const DEFAULT_CALORIE_GOAL = 2500

const DASHBOARD_STATUS_COLORS = {
  normal: 'bg-green-500/20 text-green-400',
  optimal: 'bg-green-500/20 text-green-400',
  borderline: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-orange-500/20 text-orange-400',
  low: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400'
}

function DashboardRangeBar({ value, low, high, max }) {
  const min = 0
  const safeMax = max || Math.max(Number(high) * 1.4 || 0, Number(value) * 1.2 || 0, 100)
  const toPct = (input) => Math.max(0, Math.min(100, ((Number(input) - min) / (safeMax - min || 1)) * 100))
  const lowPct = toPct(low)
  const highPct = toPct(high)
  const valuePct = toPct(value)

  return (
    <div className="relative pt-1">
      <div className="h-2 overflow-hidden rounded-full bg-gray-700">
        <div className="flex h-full">
          <div className="bg-red-500/60" style={{ width: `${lowPct}%` }} />
          <div className="bg-green-500/70" style={{ width: `${Math.max(highPct - lowPct, 4)}%` }} />
          <div className="flex-1 bg-red-500/60" />
        </div>
      </div>
      <div
        className="absolute top-1.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-gray-900 bg-white shadow-lg"
        style={{ left: `${valuePct}%` }}
      />
    </div>
  )
}

function BiomarkerGroup({ title, markers, open, onToggle }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-700 bg-gray-800">
      <button onClick={onToggle} className="flex w-full items-center justify-between p-4 text-left">
        <div className="flex items-center gap-2">
          <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          <span className="font-semibold text-white">{title}</span>
        </div>
        <span className="text-sm text-gray-500">{markers.length} tracked</span>
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {markers.map((marker) => {
            const statusClass = DASHBOARD_STATUS_COLORS[marker.status] || DASHBOARD_STATUS_COLORS.normal

            return (
              <div key={`${title}-${marker.name}`} className="rounded-xl bg-gray-700/50 p-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="font-medium text-white">{marker.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass}`}>
                    {marker.status || 'normal'}
                  </span>
                </div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-lg font-bold text-cyan-400">
                    {marker.value}{' '}
                    <span className="text-sm font-normal text-gray-400">{marker.unit}</span>
                  </span>
                  <span className="text-xs text-gray-500">
                    {marker.reference_range_low} - {marker.reference_range_high}
                  </span>
                </div>
                <DashboardRangeBar
                  value={marker.value}
                  low={marker.reference_range_low}
                  high={marker.reference_range_high}
                  max={Math.max(Number(marker.reference_range_high) * 1.4 || 0, Number(marker.value) * 1.2 || 0, 100)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatRow({ icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg w-6 text-center">{icon}</span>
      <span className="text-gray-400 text-sm flex-1">{label}</span>
      <span className={`font-bold text-base ${color}`}>{value}</span>
    </div>
  )
}

function CalorieRing({ consumed, goal, exerciseCalories = 0 }) {
  const remaining = goal - consumed + exerciseCalories
  const percent = Math.min((consumed / goal) * 100, 100)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference
  const isOver = remaining < 0

  return (
    <div className="bg-gray-800 rounded-2xl p-4 mx-4 mt-3">
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <svg width="128" height="128" className="-rotate-90">
            <circle cx="64" cy="64" r={radius} fill="none" stroke="#374151" strokeWidth="10" />
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke={isOver ? '#ef4444' : '#06b6d4'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${isOver ? 'text-red-400' : 'text-white'}`}>
              {Math.abs(remaining)}
            </span>
            <span className="text-[10px] text-gray-400">{isOver ? 'over' : 'remaining'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-1">
          <StatRow icon="🎯" label="Goal" value={goal} color="text-gray-300" />
          <StatRow icon="🍽️" label="Food" value={consumed} color="text-cyan-400" />
          <StatRow icon="🔥" label="Exercise" value={exerciseCalories} color="text-orange-400" />
        </div>
      </div>
    </div>
  )
}

function MacroBar({ protein, carbs, fat }) {
  const targets = { protein: 150, carbs: 250, fat: 65 }

  const bars = [
    { label: 'Protein', value: protein, target: targets.protein, color: '#06b6d4' },
    { label: 'Carbs', value: carbs, target: targets.carbs, color: '#a78bfa' },
    { label: 'Fat', value: fat, target: targets.fat, color: '#f59e0b' }
  ]

  return (
    <div className="bg-gray-800 rounded-2xl p-4 mx-4 mt-3">
      <div className="flex gap-4">
        {bars.map(({ label, value, target, color }) => {
          const pct = Math.min((value / target) * 100, 100)

          return (
            <div key={label} className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-medium">{Math.round(value)}g</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-1 text-right">{target}g</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PeptideDoseCard({ userStack, recentDoses }) {
  if (!userStack || userStack.length === 0) return null

  const today = new Date().toDateString()
  const todayDoses = recentDoses.filter((dose) =>
    new Date(dose.administration_time).toDateString() === today
  )

  return (
    <div className="bg-gray-800 rounded-2xl p-4 mx-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white font-semibold text-sm">Peptides Today</span>
        <Link href="/peptides" className="text-cyan-400 text-xs">View all →</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {userStack.map((item) => {
          const dosed = todayDoses.some((dose) => dose.peptide_id === item.peptide_id)
          const label = item.peptide_name || item.peptide?.name || item.peptide_id

          return (
            <div
              key={item.peptide_id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                dosed
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-gray-700 text-gray-400 border border-gray-600'
              }`}
            >
              <span>{dosed ? '✓' : '○'}</span>
              <span>{label}</span>
            </div>
          )
        })}
      </div>
    </div>
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
  const [selectedDayFood, setSelectedDayFood] = useState({ logs: [], totals: null })
  const [selectedDayFoodLoading, setSelectedDayFoodLoading] = useState(false)
  const [latestBloodResult, setLatestBloodResult] = useState(null)
  const [openBiomarkerGroups, setOpenBiomarkerGroups] = useState(['Hormones'])

  // Calories card state
  const [todayMeals, setTodayMeals] = useState([])
  const [calorieGoal, setCalorieGoal] = useState(DEFAULT_CALORIE_GOAL)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddForm, setQuickAddForm] = useState({
    food_name: '',
    calories: '',
    meal_type: 'snack'
  })

  // Due Today collapsible state
  const [dueTodayExpanded, setDueTodayExpanded] = useState(false)

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
  // IMPORTANT: All hooks must be declared before any early returns (Rules of Hooks).
  const todayCalories = useMemo(() => {
    return todayMeals.reduce((acc, meal) => acc + (parseInt(meal.calories) || 0), 0)
  }, [todayMeals])

  const todayMacros = useMemo(() => ({
    protein: todayMeals.reduce((a, m) => a + (parseFloat(m.protein) || 0), 0),
    carbs: todayMeals.reduce((a, m) => a + (parseFloat(m.carbs) || 0), 0),
    fat: todayMeals.reduce((a, m) => a + (parseFloat(m.fat) || 0), 0)
  }), [todayMeals])

  // Calculate which stack items are still due today (no dose logged today).
  // Must be here — above the `if (loading) return` — so hook count is constant
  // across every render regardless of loading state.
  const itemsDueToday = useMemo(() => {
    return userStack.filter(stackItem => {
      const lastDose = recentDoses
        .filter(dose => dose.peptide_id === stackItem.peptide_id)
        .sort((a, b) => new Date(b.administration_time) - new Date(a.administration_time))[0]
      return !lastDose || new Date(lastDose.administration_time).toDateString() !== new Date().toDateString()
    })
  }, [userStack, recentDoses])

  const biomarkerGroups = useMemo(() => {
    const markers = latestBloodResult?.markers || []
    return markers.reduce((groups, marker) => {
      let category = 'Other'
      const normalizedName = marker.name?.toLowerCase() || ''

      if (normalizedName.includes('testosterone') || normalizedName.includes('estradiol') || normalizedName.includes('shbg')) {
        category = 'Hormones'
      } else if (normalizedName.includes('cholesterol') || normalizedName.includes('triglycerides')) {
        category = 'Lipids'
      } else if (normalizedName.includes('glucose') || normalizedName.includes('a1c')) {
        category = 'Metabolic'
      }

      if (!groups[category]) groups[category] = []
      groups[category].push(marker)
      return groups
    }, {})
  }, [latestBloodResult])

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
      const [dosesData, peptidesData, vitalsLatest, bloodPanels] = await Promise.all([
        doses.getAll(),
        peptides.getAll(),
        vitals.getLatest().catch(() => null),
        bloodResults.getAll().catch(() => [])
      ])
      setRecentDoses(dosesData)
      setAvailablePeptides(peptidesData)
      setLatestBloodResult(Array.isArray(bloodPanels) && bloodPanels.length > 0 ? bloodPanels[0] : null)

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
    loadDayFood(day.date)
  }

  const loadDayFood = async (date) => {
    try {
      setSelectedDayFoodLoading(true)
      const dateKey = date.toISOString().split('T')[0]
      const response = await food.getLogs(dateKey)
      setSelectedDayFood({
        logs: response.logs || [],
        totals: response.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
      })
    } catch (err) {
      console.error('Error loading day food logs:', err)
      setSelectedDayFood({ logs: [], totals: null })
    } finally {
      setSelectedDayFoodLoading(false)
    }
  }

  // Close modal
  const closeModal = () => {
    setModalOpen(false)
    setSelectedDay(null)
    setSelectedDayFood({ logs: [], totals: null })
    setSelectedDayFoodLoading(false)
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

  const getFoodSummaryByMeal = (logs = []) => {
    const summary = {}
    logs.forEach((log) => {
      if (!summary[log.meal_type]) {
        summary[log.meal_type] = { count: 0, calories: 0 }
      }

      summary[log.meal_type].count += 1
      summary[log.meal_type].calories += Number(log.calories) || 0
    })

    return summary
  }

  // ── All hooks are above this line. No hooks may appear below. ──
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

  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden text-white">
      <header className="flex items-center justify-between px-4 h-14 flex-shrink-0 bg-gray-900 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-bold text-white">Today</h1>
          <p className="text-xs text-gray-400">{formatDate()}</p>
        </div>
        <Link href="/settings" className="text-gray-400 text-sm bg-gray-800 px-3 py-1.5 rounded-lg min-h-[36px] flex items-center">
          Edit
        </Link>
      </header>

      <main className="page-content pb-24">
        <div className="px-4 pt-3">
          <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-cyan-500/20 p-2">
                  <HeartIcon className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Health Dashboard</h2>
                  <p className="text-sm text-gray-400">Your health at a glance</p>
                </div>
              </div>
              <Link href="/blood-results" className="text-xs font-medium text-cyan-400">
                Panels →
              </Link>
            </div>
          </div>
        </div>

        <CalorieRing consumed={todayCalories} goal={calorieGoal} />
        <MacroBar
          protein={todayMacros.protein}
          carbs={todayMacros.carbs}
          fat={todayMacros.fat}
        />
        <PeptideDoseCard userStack={userStack} recentDoses={recentDoses} />

        <div className="mt-4 px-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-base font-semibold text-white">Biomarker Summary</h3>
                <p className="text-xs text-gray-400">
                  {latestBloodResult
                    ? `Latest panel from ${new Date(latestBloodResult.test_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                    : 'Add a blood panel to populate this section'}
                </p>
              </div>
              <Link href="/blood-results" className="text-xs text-cyan-400">
                Open →
              </Link>
            </div>

            {!latestBloodResult ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-sm text-gray-400">
                No blood panels yet. Use Blood Results to log a panel manually or upload a PDF.
              </div>
            ) : (
              Object.entries(biomarkerGroups).map(([groupName, markers]) => (
                <BiomarkerGroup
                  key={groupName}
                  title={groupName}
                  markers={markers}
                  open={openBiomarkerGroups.includes(groupName)}
                  onToggle={() =>
                    setOpenBiomarkerGroups((current) =>
                      current.includes(groupName)
                        ? current.filter((item) => item !== groupName)
                        : [...current, groupName]
                    )
                  }
                />
              ))
            )}
          </div>
        </div>

        <div className="mt-4 px-4 pb-4">
          <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-white">This Week</h3>
              <span className="text-cyan-400 text-xs">
                {new Date().toLocaleDateString('en-GB', { month: 'short' })}
              </span>
            </div>

            <div className="mb-3 grid grid-cols-7 gap-2">
              {getWeeklyCalendarData().map((day, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`
                    flex min-h-11 flex-col items-center justify-center rounded-lg text-xs font-medium transition-colors
                    ${day.isToday ? 'bg-cyan-500 text-white font-bold' : 'bg-gray-700/50 hover:bg-gray-600/50'}
                    ${day.hasActivity && !day.isToday ? 'ring-1 ring-cyan-400/40' : ''}
                  `}
                >
                  <div className={`text-[10px] ${day.isToday ? 'text-white/70' : 'text-gray-500'}`}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][index]}
                  </div>
                  <div>{day.dayNumber}</div>
                  {day.hasActivity && (
                    <div className="flex gap-0.5 mt-0.5">
                      {day.doses.slice(0, 2).map((_, i) => (
                        <div key={`dot-${i}`} className={`h-1.5 w-1.5 rounded-full ${day.isToday ? 'bg-white/70' : 'bg-cyan-400'}`} />
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <BottomNav active="dashboard" />

      {/* Day Detail Modal */}
      {modalOpen && selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-gray-700 bg-gray-800 p-5"
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
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-white"
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
                        <h5 className="text-base font-semibold text-white">{peptide?.name}</h5>
                        <span className="rounded bg-cyan-500 px-2 py-0.5 text-xs font-medium text-white">
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

            {selectedDayFoodLoading ? (
              <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
                <h4 className="mb-2 text-sm font-semibold text-white">Food</h4>
                <p className="text-xs text-gray-400">Loading food summary...</p>
              </div>
            ) : selectedDayFood.logs.length > 0 && selectedDayFood.totals ? (
              <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Food</h4>
                  <span className="text-xs text-cyan-400">{Math.round(selectedDayFood.totals.calories || 0)} kcal</span>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3 text-center text-xs">
                  <div className="rounded-lg bg-gray-800 px-2 py-2">
                    <div className="font-semibold text-white">{Math.round(selectedDayFood.totals.calories || 0)}</div>
                    <div className="text-gray-500">kcal</div>
                  </div>
                  <div className="rounded-lg bg-gray-800 px-2 py-2">
                    <div className="font-semibold text-cyan-400">{Math.round((selectedDayFood.totals.protein || 0) * 10) / 10}g</div>
                    <div className="text-gray-500">Protein</div>
                  </div>
                  <div className="rounded-lg bg-gray-800 px-2 py-2">
                    <div className="font-semibold text-cyan-400">{Math.round((selectedDayFood.totals.carbs || 0) * 10) / 10}g</div>
                    <div className="text-gray-500">Carbs</div>
                  </div>
                  <div className="rounded-lg bg-gray-800 px-2 py-2">
                    <div className="font-semibold text-cyan-400">{Math.round((selectedDayFood.totals.fat || 0) * 10) / 10}g</div>
                    <div className="text-gray-500">Fat</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {Object.entries(getFoodSummaryByMeal(selectedDayFood.logs)).map(([mealType, mealSummary]) => (
                    <div key={mealType} className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-xs">
                      <span className="capitalize text-white">{mealType}</span>
                      <span className="text-gray-400">
                        {mealSummary.count} item{mealSummary.count === 1 ? '' : 's'} • {Math.round(mealSummary.calories)} kcal
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={closeQuickAdd}
        >
          <div
            className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-gray-700 bg-gray-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Quick Add Food</h3>
              <button
                onClick={closeQuickAdd}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-400">
                  Food Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="food_name"
                  value={quickAddForm.food_name}
                  onChange={handleQuickAddChange}
                  placeholder="e.g., Protein Shake"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-400">
                  Calories <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  name="calories"
                  value={quickAddForm.calories}
                  onChange={handleQuickAddChange}
                  placeholder="e.g., 250"
                  min="0"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-400">Meal Type</label>
                <select
                  name="meal_type"
                  value={quickAddForm.meal_type}
                  onChange={handleQuickAddChange}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-base text-white transition-colors focus:border-cyan-500 focus:outline-none"
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
