import { useState, useEffect, useMemo } from 'react'
import { auth, meals as mealsApi } from '../lib/api'
import Link from 'next/link'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  XMarkIcon,
  TrashIcon,
  ClockIcon,
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

export default function Meals({ user }) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [calorieGoal, setCalorieGoal] = useState(DEFAULT_CALORIE_GOAL)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMealType, setSelectedMealType] = useState('breakfast')
  const [searchQuery, setSearchQuery] = useState('')
  
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
      alert('Failed to save meal. Please try again.')
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

    await addMeal(newMeal)
    closeModal()
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
    <div className="min-h-screen bg-[#0f172a] text-white pb-24">
      {/* Header */}
      <header className="bg-[#0f172a] border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={goToPreviousDay}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">Food Diary</h1>
              <p className="text-cyan-400 text-sm font-medium">
                {formatDate(selectedDate)}
              </p>
            </div>
            
            <button
              onClick={goToNextDay}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              disabled={isToday()}
            >
              <ChevronRightIcon className={`h-6 w-6 ${isToday() ? 'opacity-30' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4">
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
            
            return (
              <div
                key={mealType.id}
                className="bg-gray-800/30 rounded-2xl border border-gray-700/50 overflow-hidden"
              >
                {/* Section Header */}
                <div className="px-4 py-3 bg-gray-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{mealType.icon}</span>
                    <div>
                      <h3 className="font-semibold text-white">{mealType.label}</h3>
                      {typeCalories > 0 && (
                        <p className="text-gray-400 text-xs">{typeCalories} kcal</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openModal(mealType.id)}
                    className="p-2 text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                  >
                    <PlusIcon className="h-5 w-5" />
                  </button>
                </div>
                
                {/* Food Items */}
                {typeMeals.length > 0 ? (
                  <div className="divide-y divide-gray-700/50">
                    {typeMeals.map((meal) => (
                      <div
                        key={meal.id}
                        className="px-4 py-3 flex items-center justify-between group hover:bg-gray-800/30 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">{meal.food_name}</p>
                          {(meal.protein || meal.carbs || meal.fat) && (
                            <p className="text-gray-400 text-xs mt-0.5">
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
                            className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
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
                
                {/* Add Food Button */}
                <button
                  onClick={() => openModal(mealType.id)}
                  className="w-full px-4 py-3 text-cyan-400 text-sm font-medium hover:bg-cyan-500/5 transition-colors flex items-center justify-center gap-2"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Food
                </button>
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

      {/* Add Food Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            className="bg-gray-800 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-hidden"
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
                className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors"
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
                      className={`py-2 px-1 rounded-xl text-sm font-medium transition-colors ${
                        selectedMealType === type.id
                          ? 'bg-cyan-500 text-black'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <span className="block text-lg mb-0.5">{type.icon}</span>
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
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
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
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
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
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
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
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors text-center text-sm"
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
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors text-center text-sm"
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
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors text-center text-sm"
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

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800">
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
            <Link href="/meals" className="flex flex-col items-center py-2 text-cyan-400">
              <span className="text-xl mb-1">🍽️</span>
              <span className="text-xs">Meals</span>
            </Link>
            <Link href="/vitals" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
              <span className="text-xl mb-1">📊</span>
              <span className="text-xs">Vitals</span>
            </Link>
            <Link href="/blood-results" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
              <span className="text-xl mb-1">🧪</span>
              <span className="text-xs">Blood Results</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
