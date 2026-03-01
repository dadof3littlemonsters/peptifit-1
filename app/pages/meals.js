import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { meals as mealsApi, food as foodApi } from '../lib/api'
import BottomNav from '../components/BottomNav'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  XMarkIcon,
  TrashIcon,
  FireIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'

// Meal type definitions
const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅', color: '#f59e0b' },
  { id: 'lunch', label: 'Lunch', icon: '☀️', color: '#10b981' },
  { id: 'dinner', label: 'Dinner', icon: '🌙', color: '#8b5cf6' },
  { id: 'snack', label: 'Snack', icon: '🍿', color: '#ec4899' }
]

// Default calorie goal
const DEFAULT_CALORIE_GOAL = 2500

// Frequent foods mock data (would come from API)
const FREQUENT_FOODS = [
  { id: 1, name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: 2, name: 'Rice (white, cooked)', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: 3, name: 'Eggs (large)', calories: 70, protein: 6, carbs: 0.6, fat: 5 },
  { id: 4, name: 'Oats (dry)', calories: 389, protein: 16.9, carbs: 66, fat: 6.9 },
  { id: 5, name: 'Greek Yogurt', calories: 100, protein: 10, carbs: 6, fat: 0 },
  { id: 6, name: 'Banana', calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
  { id: 7, name: 'Almonds', calories: 579, protein: 21, carbs: 22, fat: 49 },
  { id: 8, name: 'Salmon', calories: 208, protein: 20, carbs: 0, fat: 13 }
]

const BarcodeScanner = dynamic(() => import('../components/BarcodeScanner'), {
  ssr: false
})

function roundValue(value) {
  return Math.round((Number(value) || 0) * 10) / 10
}

function formatMacro(value) {
  return `${roundValue(value)}g`
}

function buildMealFromFood(item, quantityG, mealType) {
  const quantity = Number(quantityG) || 0

  return {
    meal_type: mealType,
    food_name: item.name,
    calories: Math.round(((item.calories_per_100g || 0) / 100) * quantity),
    protein: roundValue(((item.protein_per_100g || 0) / 100) * quantity) || null,
    carbs: roundValue(((item.carbs_per_100g || 0) / 100) * quantity) || null,
    fat: roundValue(((item.fat_per_100g || 0) / 100) * quantity) || null,
    logged_at: new Date().toISOString()
  }
}

function PortionSelector({
  item,
  mealType,
  quantityG,
  onQuantityChange,
  onConfirm,
  onCancel,
  saving
}) {
  const mealDraft = useMemo(
    () => buildMealFromFood(item, quantityG, mealType),
    [item, quantityG, mealType]
  )

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-gray-900 p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-white">{item.name}</h3>
        <p className="text-sm text-gray-400">{item.brand || 'No brand listed'}</p>
      </div>

      <label className="mb-2 block text-sm font-medium text-gray-400">
        Portion Size (grams)
      </label>
      <input
        type="number"
        min="1"
        value={quantityG}
        onChange={(event) => onQuantityChange(event.target.value)}
        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
      />

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[50, 100, 150, 200].map((portion) => (
          <button
            key={portion}
            type="button"
            onClick={() => onQuantityChange(String(portion))}
            className={`min-h-[44px] rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
              Number(quantityG) === portion
                ? 'bg-cyan-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {portion}g
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-gray-800 p-3 text-center text-sm">
        <div>
          <div className="font-semibold text-white">{mealDraft.calories}</div>
          <div className="text-xs text-gray-400">kcal</div>
        </div>
        <div>
          <div className="font-semibold text-cyan-400">{formatMacro(mealDraft.protein)}</div>
          <div className="text-xs text-gray-400">Protein</div>
        </div>
        <div>
          <div className="font-semibold text-cyan-400">{formatMacro(mealDraft.carbs)}</div>
          <div className="text-xs text-gray-400">Carbs</div>
        </div>
        <div>
          <div className="font-semibold text-cyan-400">{formatMacro(mealDraft.fat)}</div>
          <div className="text-xs text-gray-400">Fat</div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-[56px] flex-1 items-center justify-center rounded-xl border border-gray-700 bg-gray-800 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onConfirm(mealDraft)}
          disabled={saving || !(Number(quantityG) > 0)}
          className="flex min-h-[56px] flex-1 items-center justify-center rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : `Log to ${MEAL_TYPES.find((meal) => meal.id === mealType)?.label}`}
        </button>
      </div>
    </div>
  )
}

export default function Meals({ user }) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [calorieGoal, setCalorieGoal] = useState(DEFAULT_CALORIE_GOAL)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMealType, setSelectedMealType] = useState('breakfast')
  const [searchQuery, setSearchQuery] = useState('')

  const [foodSearchOpen, setFoodSearchOpen] = useState(false)
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [scannerMode, setScannerMode] = useState('barcode')
  const [foodSearchQuery, setFoodSearchQuery] = useState('')
  const [foodSearchLoading, setFoodSearchLoading] = useState(false)
  const [foodSearchResults, setFoodSearchResults] = useState([])
  const [foodSearchError, setFoodSearchError] = useState('')
  const [scannerError, setScannerError] = useState('')
  const [scannerLookupLoading, setScannerLookupLoading] = useState(false)
  const [scannerNotFound, setScannerNotFound] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [selectedSource, setSelectedSource] = useState(null)
  const [quantityG, setQuantityG] = useState('100')
  const [savingFood, setSavingFood] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    food_name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: ''
  })

  // Load meals on mount and when date changes
  useEffect(() => {
    loadMeals()
    loadCalorieGoal()
  }, [selectedDate])

  useEffect(() => {
    if (!foodSearchOpen || selectedFood || foodSearchQuery.trim().length < 2) {
      if (!foodSearchQuery.trim()) {
        setFoodSearchResults([])
        setFoodSearchError('')
      }
      return undefined
    }

    const timeoutId = setTimeout(async () => {
      setFoodSearchLoading(true)
      setFoodSearchError('')

      try {
        const response = await foodApi.search(foodSearchQuery.trim())
        setFoodSearchResults(response.results || [])
      } catch (error) {
        setFoodSearchResults([])
        setFoodSearchError(error.response?.data?.error || 'Search failed')
      } finally {
        setFoodSearchLoading(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [foodSearchOpen, foodSearchQuery, selectedFood])

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

  const loadMeals = async () => {
    try {
      setLoading(true)
      const dateStr = selectedDate.toISOString().split('T')[0]
      
      const response = await mealsApi.getByDate(dateStr)
      // API returns grouped meals, flatten them into an array
      const groupedMeals = response.meals || {}
      const allMeals = [
        ...(groupedMeals.breakfast || []),
        ...(groupedMeals.lunch || []),
        ...(groupedMeals.dinner || []),
        ...(groupedMeals.snack || [])
      ]
      setMeals(allMeals)
    } catch (error) {
      console.error('Failed to load meals:', error)
      setMeals([])
    } finally {
      setLoading(false)
    }
  }

  const addMeal = async (mealData) => {
    try {
      await mealsApi.create(mealData)
      await loadMeals()
    } catch (error) {
      console.error('Failed to save meal:', error)
      throw error
    }
  }

  // Calculate daily totals
  const dailyTotals = useMemo(() => {
    return meals.reduce((acc, meal) => ({
      calories: acc.calories + (parseInt(meal.calories) || 0),
      protein: acc.protein + (parseFloat(meal.protein) || 0),
      carbs: acc.carbs + (parseFloat(meal.carbs) || 0),
      fat: acc.fat + (parseFloat(meal.fat) || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
  }, [meals])

  // Group meals by type
  const mealsByType = useMemo(() => {
    const grouped = {}
    MEAL_TYPES.forEach(type => {
      grouped[type.id] = meals.filter(meal => meal.meal_type === type.id)
    })
    return grouped
  }, [meals])

  // Calculate meal type totals
  const getMealTypeTotal = (mealType) => {
    return mealsByType[mealType]?.reduce((acc, meal) => 
      acc + (parseInt(meal.calories) || 0), 0
    ) || 0
  }

  // Date navigation
  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    setSelectedDate(newDate)
  }

  const goToNextDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    setSelectedDate(newDate)
  }

  const isToday = () => {
    const today = new Date()
    return selectedDate.toDateString() === today.toDateString()
  }

  // Modal handlers
  const openModal = (mealType) => {
    setSelectedMealType(mealType)
    setFormData({
      food_name: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: ''
    })
    setSearchQuery('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  const resetFoodSelection = () => {
    setSelectedFood(null)
    setSelectedSource(null)
    setQuantityG('100')
  }

  const openSearch = () => {
    closeModal()
    closeBarcodeScanner()
    setFoodSearchOpen(true)
  }

  const openBarcodeScanner = () => {
    closeModal()
    closeFoodSearch()
    setScannerMode('barcode')
    setSelectedSource('scanner')
    setBarcodeScannerOpen(true)
  }

  const openLabelScanner = () => {
    closeModal()
    closeFoodSearch()
    setScannerMode('label')
    setSelectedSource('scanner')
    setBarcodeScannerOpen(true)
  }

  const closeFoodSearch = () => {
    setFoodSearchOpen(false)
    setFoodSearchQuery('')
    setFoodSearchResults([])
    setFoodSearchError('')
    resetFoodSelection()
  }

  const closeBarcodeScanner = () => {
    setBarcodeScannerOpen(false)
    setScannerMode('barcode')
    setScannerError('')
    setScannerLookupLoading(false)
    setScannerNotFound(false)
    resetFoodSelection()
  }

  const handleFoodChoice = (item, source) => {
    setSelectedFood(item)
    setSelectedSource(source)
    setQuantityG(item.serving_size_g ? String(Math.round(item.serving_size_g)) : '100')
  }

  const handleLogSelectedFood = async (mealDraft) => {
    try {
      setSavingFood(true)
      await addMeal(mealDraft)

      if (selectedSource === 'scanner') {
        closeBarcodeScanner()
      } else {
        closeFoodSearch()
      }
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to save meal'
      if (selectedSource === 'scanner') {
        setScannerError(message)
      } else {
        setFoodSearchError(message)
      }
    } finally {
      setSavingFood(false)
    }
  }

  const handleBarcodeDetected = async (rawCode) => {
    const code = String(rawCode || '').trim()

    if (!code) {
      return
    }

    setScannerLookupLoading(true)
    setScannerError('')
    setScannerNotFound(false)

    try {
      const item = await foodApi.lookupBarcode(code)
      handleFoodChoice(item, 'scanner')
    } catch (error) {
      if (error.response?.status === 404) {
        setScannerNotFound(true)
        return
      }

      setScannerError(error.response?.data?.error || 'Barcode lookup failed')
    } finally {
      setScannerLookupLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const selectFrequentFood = (food) => {
    setFormData({
      food_name: food.name,
      calories: food.calories,
      protein: food.protein || '',
      carbs: food.carbs || '',
      fat: food.fat || ''
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.food_name || !formData.calories) {
      return
    }

    const newMeal = {
      meal_type: selectedMealType,
      food_name: formData.food_name,
      calories: parseInt(formData.calories, 10),
      protein: formData.protein ? parseFloat(formData.protein) : null,
      carbs: formData.carbs ? parseFloat(formData.carbs) : null,
      fat: formData.fat ? parseFloat(formData.fat) : null,
      logged_at: new Date().toISOString()
    }

    try {
      await addMeal(newMeal)
      closeModal()
    } catch (error) {
      console.error('Failed to save meal:', error)
      alert('Failed to save meal. Please try again.')
    }
  }

  const deleteMeal = async (mealId) => {
    try {
      await mealsApi.delete(mealId)
      await loadMeals()
    } catch (error) {
      console.error('Failed to delete meal:', error)
      alert('Failed to delete meal. Please try again.')
    }
  }

  const copyFromYesterday = async () => {
    const yesterday = new Date(selectedDate)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const todayStr = selectedDate.toISOString().split('T')[0]
    
    try {
      await mealsApi.copyFromDate(yesterdayStr, todayStr)
      await loadMeals()
    } catch (error) {
      console.error('Failed to copy meals:', error)
      alert('Failed to copy meals. Please try again.')
    }
  }

  // Filter frequent foods based on search
  const filteredFrequentFoods = useMemo(() => {
    if (!searchQuery) return FREQUENT_FOODS
    return FREQUENT_FOODS.filter(food =>
      food.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery])

  // Format date for display
  const formatDate = (date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    }
    
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  // Calculate progress percentage
  const calorieProgress = Math.min((dailyTotals.calories / calorieGoal) * 100, 100)
  const remainingCalories = calorieGoal - dailyTotals.calories

  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden text-white">
      {/* Header */}
      <header className="h-14 flex-shrink-0 border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-full max-w-md items-center px-4">
          <div className="flex w-full items-center justify-between">
            <button
              onClick={goToPreviousDay}
              className="flex h-11 w-11 items-center justify-center text-gray-400 transition-colors hover:text-white"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">Diary</h1>
              <p className="text-cyan-400 text-sm font-medium">
                {formatDate(selectedDate)}
              </p>
            </div>
            
            <button
              onClick={goToNextDay}
              className="flex h-11 w-11 items-center justify-center text-gray-400 transition-colors hover:text-white"
              disabled={isToday()}
            >
              <ChevronRightIcon className={`h-6 w-6 ${isToday() ? 'opacity-30' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="sticky top-14 z-20 border-b border-gray-800 bg-gray-900 px-4 py-2">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-2">
          {MEAL_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setSelectedMealType(type.id)}
              className={`min-h-[40px] rounded-xl px-2 py-1.5 text-sm font-medium transition-colors ${
                selectedMealType === type.id
                  ? 'bg-cyan-500 text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span className="block text-base mb-0.5">{type.icon}</span>
              <span className="text-xs">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="page-content pb-40">
      <div className="mx-auto max-w-md px-4">
        {/* Summary Bar */}
        <div className="mt-4 bg-gray-800/50 rounded-2xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FireIcon className="h-5 w-5 text-orange-500" />
              <span className="text-gray-300 text-sm">Calories</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-white">{dailyTotals.calories}</span>
              <span className="text-gray-400 text-sm"> / {calorieGoal}</span>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${calorieProgress}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className={`font-medium ${remainingCalories >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {remainingCalories >= 0 
                ? `${remainingCalories} remaining` 
                : `${Math.abs(remainingCalories)} over`}
            </span>
            <span className="text-gray-400">
              {Math.round(calorieProgress)}%
            </span>
          </div>
          
          {/* Macros */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-700">
            <div className="text-center">
              <div className="text-blue-400 font-bold text-lg">{Math.round(dailyTotals.protein)}g</div>
              <div className="text-gray-400 text-xs">Protein</div>
            </div>
            <div className="text-center">
              <div className="text-green-400 font-bold text-lg">{Math.round(dailyTotals.carbs)}g</div>
              <div className="text-gray-400 text-xs">Carbs</div>
            </div>
            <div className="text-center">
              <div className="text-yellow-400 font-bold text-lg">{Math.round(dailyTotals.fat)}g</div>
              <div className="text-gray-400 text-xs">Fat</div>
            </div>
          </div>
        </div>

        {/* Meal Sections */}
        <div className="mt-6 space-y-4">
          {MEAL_TYPES.map((mealType) => {
            const typeMeals = mealsByType[mealType.id] || []
            const typeCalories = getMealTypeTotal(mealType.id)
            const isActiveMeal = selectedMealType === mealType.id
            const isCollapsed = typeMeals.length === 0 && !isActiveMeal
            
            return (
              <div
                key={mealType.id}
                className={`overflow-hidden rounded-2xl border transition-colors ${
                  isActiveMeal
                    ? 'border-cyan-500/30 bg-gray-800/40'
                    : 'border-gray-700/50 bg-gray-800/30'
                }`}
              >
                {/* Section Header */}
                <div
                  className={`flex items-center justify-between bg-gray-800/50 px-4 ${
                    isCollapsed ? 'py-4' : 'py-3'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{mealType.icon}</span>
                    <div>
                      <h3 className="font-semibold text-white">{mealType.label}</h3>
                      {typeCalories > 0 ? (
                        <p className="text-gray-400 text-xs">{typeCalories} kcal</p>
                      ) : isCollapsed ? (
                        <p className="text-gray-500 text-xs">Tap to expand</p>
                      ) : (
                        <p className="text-gray-500 text-xs">No foods logged</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isCollapsed && (
                      <button
                        onClick={() => setSelectedMealType(mealType.id)}
                        className="rounded-lg px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700"
                      >
                        Open
                      </button>
                    )}
                    <button
                      onClick={() => openModal(mealType.id)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-cyan-400 transition-colors hover:bg-cyan-500/10"
                    >
                      <PlusIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    {typeMeals.length > 0 ? (
                      <div className="divide-y divide-gray-700/50">
                        {typeMeals.map((meal) => (
                          <div
                            key={meal.id}
                            className="group flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-800/30"
                          >
                            <div className="flex-1">
                              <p className="text-white font-medium text-sm">{meal.food_name}</p>
                              {(meal.protein || meal.carbs || meal.fat) && (
                                <p className="mt-0.5 text-xs text-gray-400">
                                  {meal.protein > 0 && `P: ${Math.round(meal.protein)}g `}
                                  {meal.carbs > 0 && `C: ${Math.round(meal.carbs)}g `}
                                  {meal.fat > 0 && `F: ${Math.round(meal.fat)}g`}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-cyan-400 font-medium text-sm">
                                {meal.calories}
                              </span>
                              <button
                                onClick={() => deleteMeal(meal.id)}
                                className="flex h-11 w-11 items-center justify-center text-gray-500 opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-center">
                        <p className="text-gray-500 text-sm">No foods logged</p>
                      </div>
                    )}

                    <button
                      onClick={() => openModal(mealType.id)}
                      className="flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-500/5"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add Food
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Copy from Yesterday */}
        {!isToday() && meals.length === 0 && (
          <button
            onClick={copyFromYesterday}
            className="mt-6 w-full bg-gray-800 hover:bg-gray-700 text-white py-3 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-gray-700"
          >
            <DocumentDuplicateIcon className="h-5 w-5 text-cyan-400" />
            Copy from Yesterday
          </button>
        )}
      </div>
      </main>

      <div className="fixed bottom-[calc(60px+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-gray-800 bg-gray-900/95 p-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            onClick={openSearch}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gray-800 px-3 py-2 text-sm font-medium text-white"
          >
            <span className="text-base">🔍</span>
            <span className="text-xs text-gray-300">Search</span>
          </button>
          <button
            onClick={openBarcodeScanner}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gray-800 px-3 py-2 text-sm font-medium text-white"
          >
            <span className="text-base">📷</span>
            <span className="text-xs text-gray-300">Barcode</span>
          </button>
          <button
            onClick={openLabelScanner}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gray-800 px-3 py-2 text-sm font-medium text-white"
          >
            <span className="text-base">📸</span>
            <span className="text-xs text-gray-300">Scan Label</span>
          </button>
        </div>
      </div>

      {foodSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={closeFoodSearch}
        >
          <div
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {selectedFood ? 'Choose Portion' : 'Search Food'}
                </h2>
                <p className="text-sm text-gray-400">
                  Log to {MEAL_TYPES.find((meal) => meal.id === selectedMealType)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFoodSearch}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {selectedFood ? (
              <PortionSelector
                item={selectedFood}
                mealType={selectedMealType}
                quantityG={quantityG}
                onQuantityChange={setQuantityG}
                onConfirm={handleLogSelectedFood}
                onCancel={resetFoodSelection}
                saving={savingFood}
              />
            ) : (
              <>
                <input
                  type="text"
                  value={foodSearchQuery}
                  onChange={(event) => setFoodSearchQuery(event.target.value)}
                  placeholder="Search chicken breast, yogurt, oats..."
                  className="mb-4 w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />

                {foodSearchLoading && <p className="text-sm text-gray-400">Searching...</p>}
                {foodSearchError && <p className="mb-3 text-sm text-red-400">{foodSearchError}</p>}

                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {foodSearchResults.map((item) => (
                    <button
                      key={`${item.source}-${item.id}`}
                      type="button"
                      onClick={() => handleFoodChoice(item, 'search')}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-left transition-colors hover:border-cyan-500/40 hover:bg-gray-800"
                    >
                      <div className="text-base font-semibold text-white">{item.name}</div>
                      <div className="mt-1 text-sm text-gray-400">{item.brand || 'No brand listed'}</div>
                      <div className="mt-2 text-xs text-cyan-400">
                        {item.calories_per_100g ?? 'N/A'} kcal / 100g
                      </div>
                    </button>
                  ))}
                  {!foodSearchLoading && foodSearchQuery.trim().length >= 2 && foodSearchResults.length === 0 && !foodSearchError && (
                    <p className="text-sm text-gray-400">No results found.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {barcodeScannerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={closeBarcodeScanner}
        >
          <div
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {selectedFood ? 'Confirm Portion' : scannerMode === 'label' ? 'Scan Label' : 'Scan Barcode'}
                </h2>
                <p className="text-sm text-gray-400">
                  Log to {MEAL_TYPES.find((meal) => meal.id === selectedMealType)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={closeBarcodeScanner}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {selectedFood ? (
              <PortionSelector
                item={selectedFood}
                mealType={selectedMealType}
                quantityG={quantityG}
                onQuantityChange={setQuantityG}
                onConfirm={handleLogSelectedFood}
                onCancel={resetFoodSelection}
                saving={savingFood}
              />
            ) : (
              <>
                <BarcodeScanner
                  active={barcodeScannerOpen && !selectedFood && !scannerLookupLoading}
                  onDetected={handleBarcodeDetected}
                  onError={() => setScannerError('Unable to access camera. Check browser permissions and HTTPS.')}
                />

                <p className="mt-3 text-sm text-gray-400">
                  {scannerMode === 'label'
                    ? 'Frame the product barcode or nutrition label clearly. If detection fails, switch to Search.'
                    : 'Point the camera at the product barcode.'}
                </p>

                {scannerLookupLoading && <p className="mt-3 text-sm text-gray-400">Looking up product...</p>}
                {scannerError && <p className="mt-3 text-sm text-red-400">{scannerError}</p>}
                {scannerNotFound && (
                  <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <p className="text-sm text-yellow-200">Product not found. Try searching by name instead.</p>
                    <button
                      type="button"
                      onClick={openSearch}
                      className="mt-3 min-h-[44px] rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-cyan-400"
                    >
                      Search by name
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Food Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={closeModal}
        >
          <div
            className="max-h-[85dvh] w-full max-w-md overflow-hidden rounded-t-3xl bg-gray-800 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Add Food</h2>
                <p className="text-gray-400 text-sm">
                  {MEAL_TYPES.find(t => t.id === selectedMealType)?.label}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-white"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Meal Type Selector */}
              <div className="px-5 py-4 border-b border-gray-700">
                <label className="text-gray-400 text-sm mb-2 block">Meal Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {MEAL_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setSelectedMealType(type.id)}
                      className={`min-h-12 rounded-xl px-1 py-2 text-sm font-medium transition-colors ${
                        selectedMealType === type.id
                          ? 'bg-cyan-500 text-black'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <span className="block text-base mb-0.5">{type.icon}</span>
                      <span className="text-xs">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Frequent Foods */}
              <div className="px-5 py-4 border-b border-gray-700">
                <div className="flex items-center gap-2 mb-3">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search frequent foods..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-base text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
                  {filteredFrequentFoods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => selectFrequentFood(food)}
                      className="flex-shrink-0 bg-gray-700/50 hover:bg-gray-700 px-3 py-2 rounded-xl text-left transition-colors"
                    >
                      <p className="text-white text-sm font-medium whitespace-nowrap">{food.name}</p>
                      <p className="text-cyan-400 text-xs">{food.calories} kcal</p>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Form */}
              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-1.5 block">
                    Food Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="food_name"
                    value={formData.food_name}
                    onChange={handleInputChange}
                    placeholder="e.g., Grilled Chicken Salad"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                    required
                  />
                </div>
                
                <div>
                  <label className="text-gray-400 text-sm mb-1.5 block">
                    Calories <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    name="calories"
                    value={formData.calories}
                    onChange={handleInputChange}
                    placeholder="e.g., 350"
                    min="0"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                    required
                  />
                </div>
                
                <div>
                  <label className="text-gray-400 text-sm mb-1.5 block">Macros (optional)</label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <input
                        type="number"
                        name="protein"
                        value={formData.protein}
                        onChange={handleInputChange}
                        placeholder="Protein"
                        min="0"
                        step="0.1"
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-center text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                      />
                      <span className="text-gray-500 text-xs block text-center mt-1">Protein (g)</span>
                    </div>
                    <div>
                      <input
                        type="number"
                        name="carbs"
                        value={formData.carbs}
                        onChange={handleInputChange}
                        placeholder="Carbs"
                        min="0"
                        step="0.1"
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-center text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                      />
                      <span className="text-gray-500 text-xs block text-center mt-1">Carbs (g)</span>
                    </div>
                    <div>
                      <input
                        type="number"
                        name="fat"
                        value={formData.fat}
                        onChange={handleInputChange}
                        placeholder="Fat"
                        min="0"
                        step="0.1"
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-3 text-center text-base text-white placeholder-gray-500 transition-colors focus:border-cyan-500 focus:outline-none"
                      />
                      <span className="text-gray-500 text-xs block text-center mt-1">Fat (g)</span>
                    </div>
                  </div>
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3.5 rounded-xl transition-colors mt-6"
                >
                  Save Food
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="meals" />
    </div>
  )
}
