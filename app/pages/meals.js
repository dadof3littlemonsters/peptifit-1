import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { ai, meals as mealsApi, food as foodApi } from '../lib/api'
import BottomNav from '../components/BottomNav'
import CameraCapturePanel from '../components/CameraCapturePanel'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  XMarkIcon,
  TrashIcon,
  PencilSquareIcon,
  FireIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  Bars3BottomLeftIcon,
  CheckIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '☀️' },
  { id: 'dinner', label: 'Dinner', icon: '🌙' },
  { id: 'snack', label: 'Snacks', icon: '🍿' }
]

const SEARCH_TABS = [
  { id: 'all', label: 'All' },
  { id: 'my_meals', label: 'My Meals' },
  { id: 'my_recipes', label: 'My Recipes' },
  { id: 'my_foods', label: 'My Foods' }
]

const DEFAULT_CALORIE_GOAL = 2500
const DAILY_MACRO_GOALS = {
  carbs: 250,
  fat: 67,
  protein: 100
}

const BarcodeScanner = dynamic(() => import('../components/BarcodeScanner'), {
  ssr: false
})

function roundValue(value) {
  return Math.round((Number(value) || 0) * 10) / 10
}

function formatMacro(value) {
  return `${roundValue(value)}g`
}

function formatServingCount(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildMealFromFood(item, quantityG, mealType) {
  const quantity = Number(quantityG) || 0

  return {
    meal_type: mealType,
    food_name: item.name,
    calories: Math.round(((item.calories_per_100g || 0) / 100) * quantity),
    protein: roundValue(((item.protein_per_100g || 0) / 100) * quantity) || null,
    carbs: roundValue(((item.carbs_per_100g || 0) / 100) * quantity) || null,
    fat: roundValue(((item.fat_per_100g || 0) / 100) * quantity) || null
  }
}

function derivePer100FromAbsolute(value, quantityG) {
  const absoluteValue = parseNullableNumber(value)
  const quantity = parseNullableNumber(quantityG)

  if (absoluteValue === null || quantity === null || quantity <= 0) {
    return null
  }

  return roundValue((absoluteValue / quantity) * 100)
}

function buildAiScannedFood(scanResult) {
  const servingSize = parseNullableNumber(scanResult?.serving_size_g)
  const derivePer100g = (per100gValue, perServingValue) => {
    const directValue = parseNullableNumber(per100gValue)

    if (directValue !== null) {
      return directValue
    }

    const servingValue = parseNullableNumber(perServingValue)

    if (servingValue === null || servingSize === null || servingSize <= 0) {
      return null
    }

    return roundValue((servingValue / servingSize) * 100)
  }

  return {
    id: `ai-scan-${Date.now()}`,
    source: 'ai-scan',
    name: String(scanResult?.name || '').trim(),
    brand: scanResult?.brand ? String(scanResult.brand).trim() : null,
    calories_per_100g: derivePer100g(scanResult?.calories_per_100g, scanResult?.calories_per_serving),
    protein_per_100g: derivePer100g(scanResult?.protein_per_100g, scanResult?.protein_per_serving),
    carbs_per_100g: derivePer100g(scanResult?.carbs_per_100g, scanResult?.carbs_per_serving),
    fat_per_100g: derivePer100g(scanResult?.fat_per_100g, scanResult?.fat_per_serving),
    fibre_per_100g: derivePer100g(scanResult?.fibre_per_100g, scanResult?.fibre_per_serving),
    serving_size_g: servingSize
  }
}

function getAiScanErrorMessage(error, fallbackMessage) {
  if (error?.response?.status === 504) {
    return 'Label analysis timed out. Try a closer photo with just the nutrition panel.'
  }

  return error?.response?.data?.error || error?.message || fallbackMessage
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10)
}

function toIsoAtNoon(dateKey) {
  return `${dateKey}T12:00:00.000Z`
}

function nextDays(baseDate, count = 7) {
  const result = []
  for (let i = 0; i < count; i += 1) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + i)
    result.push({
      key: toDateKey(date),
      day: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      dateNumber: date.toLocaleDateString('en-GB', { day: '2-digit' })
    })
  }
  return result
}

export default function Meals() {
  const labelScanRequestIdRef = useRef(0)
  const foodSearchRequestIdRef = useRef(0)

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [calorieGoal, setCalorieGoal] = useState(DEFAULT_CALORIE_GOAL)

  const [selectedMealType, setSelectedMealType] = useState('breakfast')

  const [addFoodFlow, setAddFoodFlow] = useState('closed')
  const [foodSearchQuery, setFoodSearchQuery] = useState('')
  const [foodSearchLoading, setFoodSearchLoading] = useState(false)
  const [foodSearchResults, setFoodSearchResults] = useState([])
  const [foodSearchError, setFoodSearchError] = useState('')
  const [searchTab, setSearchTab] = useState('all')

  const [libraryFoods, setLibraryFoods] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [historyFoods, setHistoryFoods] = useState([])

  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [scannerLookupLoading, setScannerLookupLoading] = useState(false)
  const [scannerNotFound, setScannerNotFound] = useState(false)

  const [labelScannerOpen, setLabelScannerOpen] = useState(false)
  const [labelScannerError, setLabelScannerError] = useState('')
  const [labelScannerLoading, setLabelScannerLoading] = useState(false)
  const [labelScannerCaptured, setLabelScannerCaptured] = useState('')

  const [selectedFood, setSelectedFood] = useState(null)
  const [selectedSource, setSelectedSource] = useState(null)
  const [quantityG, setQuantityG] = useState('100')
  const [servingCount, setServingCount] = useState('1')
  const [savingFood, setSavingFood] = useState(false)

  const [showMealPicker, setShowMealPicker] = useState(false)
  const [showServingDialog, setShowServingDialog] = useState(false)
  const [servingDraft, setServingDraft] = useState('1')
  const [selectedDays, setSelectedDays] = useState([toDateKey(new Date())])
  const [saveToLibrary, setSaveToLibrary] = useState(true)

  const [mealEdit, setMealEdit] = useState({ calories: '', protein: '', carbs: '', fat: '' })

  const [editingLibraryFood, setEditingLibraryFood] = useState(null)
  const [libraryEditorSaving, setLibraryEditorSaving] = useState(false)
  const [libraryEditorData, setLibraryEditorData] = useState({
    id: '',
    name: '',
    brand: '',
    serving_size_g: '',
    calories_per_100g: '',
    protein_per_100g: '',
    carbs_per_100g: '',
    fat_per_100g: '',
    fibre_per_100g: ''
  })

  useEffect(() => {
    loadMeals()
    loadCalorieGoal()
    loadLibraryFoods()
    loadHistoryFoods()
  }, [selectedDate])

  useEffect(() => {
    if (addFoodFlow !== 'search') {
      setFoodSearchLoading(false)
      return undefined
    }

    const trimmedQuery = foodSearchQuery.trim()
    if (trimmedQuery.length < 3 || searchTab === 'my_foods' || searchTab === 'my_meals' || searchTab === 'my_recipes') {
      setFoodSearchLoading(false)
      setFoodSearchResults([])
      setFoodSearchError('')
      return undefined
    }

    const requestId = foodSearchRequestIdRef.current + 1
    foodSearchRequestIdRef.current = requestId
    const controller = new AbortController()

    const timeoutId = setTimeout(async () => {
      setFoodSearchLoading(true)
      setFoodSearchError('')

      try {
        const response = await foodApi.search(trimmedQuery, {
          signal: controller.signal
        })

        if (foodSearchRequestIdRef.current === requestId) {
          setFoodSearchResults(response.results || [])
        }
      } catch (error) {
        if (controller.signal.aborted || error.code === 'ERR_CANCELED') {
          return
        }

        if (foodSearchRequestIdRef.current === requestId) {
          setFoodSearchResults([])
          setFoodSearchError(error.response?.data?.error || 'Search failed')
        }
      } finally {
        if (foodSearchRequestIdRef.current === requestId) {
          setFoodSearchLoading(false)
        }
      }
    }, 350)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [addFoodFlow, foodSearchQuery, searchTab])

  useEffect(() => {
    if (!selectedFood || addFoodFlow !== 'detail') {
      return
    }

    const draft = buildMealFromFood(selectedFood, quantityG, selectedMealType)
    setMealEdit({
      calories: String(draft.calories || ''),
      protein: draft.protein === null ? '' : String(draft.protein),
      carbs: draft.carbs === null ? '' : String(draft.carbs),
      fat: draft.fat === null ? '' : String(draft.fat)
    })
  }, [selectedFood, quantityG, selectedMealType, addFoodFlow])

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

  const loadLibraryFoods = async () => {
    try {
      setLibraryLoading(true)
      const response = await foodApi.getLibrary(80)
      setLibraryFoods(response.foods || [])
    } catch (error) {
      console.error('Failed to load food library:', error)
      setLibraryFoods([])
    } finally {
      setLibraryLoading(false)
    }
  }

  const loadHistoryFoods = async () => {
    try {
      const foods = await mealsApi.getFrequentFoods(120)
      const sorted = [...(foods || [])].sort((a, b) => String(a.food_name || '').localeCompare(String(b.food_name || '')))
      setHistoryFoods(sorted)
    } catch (error) {
      console.error('Failed to load meal history:', error)
      setHistoryFoods([])
    }
  }

  const addMeal = async (mealData) => {
    await mealsApi.create(mealData)
  }

  const dailyTotals = useMemo(() => {
    return meals.reduce((acc, meal) => ({
      calories: acc.calories + (parseInt(meal.calories, 10) || 0),
      protein: acc.protein + (parseFloat(meal.protein) || 0),
      carbs: acc.carbs + (parseFloat(meal.carbs) || 0),
      fat: acc.fat + (parseFloat(meal.fat) || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
  }, [meals])

  const mealsByType = useMemo(() => {
    const grouped = {}
    MEAL_TYPES.forEach((type) => {
      grouped[type.id] = meals.filter((meal) => meal.meal_type === type.id)
    })
    return grouped
  }, [meals])

  const getMealTypeTotal = (mealType) => {
    return mealsByType[mealType]?.reduce((acc, meal) => acc + (parseInt(meal.calories, 10) || 0), 0) || 0
  }

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

  const openAddFood = (mealType = selectedMealType) => {
    setSelectedMealType(mealType)
    setSelectedFood(null)
    setSelectedSource(null)
    setQuantityG('100')
    setServingCount('1')
    setFoodSearchQuery('')
    setFoodSearchResults([])
    setFoodSearchError('')
    setSearchTab('all')
    setSelectedDays([toDateKey(selectedDate)])
    setSaveToLibrary(true)
    setAddFoodFlow('search')
  }

  const closeAddFood = () => {
    setAddFoodFlow('closed')
    setSelectedFood(null)
    setSelectedSource(null)
    setShowMealPicker(false)
    setShowServingDialog(false)
  }

  const openBarcodeScanner = () => {
    setBarcodeScannerOpen(true)
    setScannerError('')
    setScannerLookupLoading(false)
    setScannerNotFound(false)
  }

  const closeBarcodeScanner = () => {
    setBarcodeScannerOpen(false)
    setScannerError('')
    setScannerLookupLoading(false)
    setScannerNotFound(false)
  }

  const openLabelScanner = () => {
    setLabelScannerError('')
    setLabelScannerCaptured('')
    setLabelScannerLoading(false)
    setLabelScannerOpen(true)
  }

  const closeLabelScanner = () => {
    labelScanRequestIdRef.current += 1
    setLabelScannerOpen(false)
    setLabelScannerError('')
    setLabelScannerLoading(false)
    setLabelScannerCaptured('')
  }

  const handleFoodChoice = (item, source) => {
    const initialServing = Number(item?.serving_size_g) > 0 ? Number(item.serving_size_g) : 100
    const safeItem = {
      ...item,
      name: String(item?.name || item?.food_name || '').trim(),
      brand: item?.brand || null,
      calories_per_100g: parseNullableNumber(item?.calories_per_100g) ?? parseNullableNumber(item?.calories) ?? 0,
      protein_per_100g: parseNullableNumber(item?.protein_per_100g) ?? parseNullableNumber(item?.protein) ?? 0,
      carbs_per_100g: parseNullableNumber(item?.carbs_per_100g) ?? parseNullableNumber(item?.carbs) ?? 0,
      fat_per_100g: parseNullableNumber(item?.fat_per_100g) ?? parseNullableNumber(item?.fat) ?? 0,
      serving_size_g: parseNullableNumber(item?.serving_size_g) ?? 100
    }

    setSelectedFood(safeItem)
    setSelectedSource(source)
    setQuantityG(String(roundValue(initialServing)))
    setServingCount('1')
    setShowMealPicker(false)
    setAddFoodFlow('detail')
  }

  const handleSelectedFoodChange = (field, value) => {
    setSelectedFood((current) => {
      if (!current) {
        return current
      }

      const numericFields = new Set([
        'calories_per_100g',
        'protein_per_100g',
        'carbs_per_100g',
        'fat_per_100g',
        'fibre_per_100g',
        'serving_size_g'
      ])

      if (numericFields.has(field)) {
        return {
          ...current,
          [field]: value === '' ? '' : Number(value)
        }
      }

      return {
        ...current,
        [field]: value
      }
    })
  }

  const handleServingCountChange = (value) => {
    setServingCount(value)
    const servings = Number(value)
    const servingSize = Number(selectedFood?.serving_size_g)

    if (Number.isFinite(servings) && servings > 0 && Number.isFinite(servingSize) && servingSize > 0) {
      setQuantityG(String(roundValue(servings * servingSize)))
    }
  }

  const toggleDay = (dateKey) => {
    setSelectedDays((current) => {
      if (current.includes(dateKey)) {
        if (current.length === 1) {
          return current
        }
        return current.filter((key) => key !== dateKey)
      }
      return [...current, dateKey]
    })
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
      closeBarcodeScanner()
      handleFoodChoice(item, 'barcode')
    } catch (error) {
      if (error.response?.status === 404) {
        setScannerNotFound(true)
        return
      }

      setScannerError(error.response?.data?.error || 'Barcode lookup timed out. Search by name instead.')
    } finally {
      setScannerLookupLoading(false)
    }
  }

  const handleLabelCapture = async ({ base64Image, previewUrl }) => {
    const requestId = labelScanRequestIdRef.current + 1
    labelScanRequestIdRef.current = requestId
    setLabelScannerCaptured(previewUrl)
    setLabelScannerLoading(true)
    setLabelScannerError('')

    try {
      const scanResult = await ai.scanNutritionLabel(base64Image)
      if (labelScanRequestIdRef.current !== requestId) {
        return
      }

      const item = buildAiScannedFood(scanResult)

      if (!item.name) {
        throw new Error('The label scan did not return a product name.')
      }

      closeLabelScanner()
      handleFoodChoice(item, 'label')
    } catch (error) {
      if (labelScanRequestIdRef.current === requestId) {
        setLabelScannerError(getAiScanErrorMessage(error, 'Unable to analyze this label.'))
      }
    } finally {
      if (labelScanRequestIdRef.current === requestId) {
        setLabelScannerLoading(false)
      }
    }
  }

  const retryLabelScanner = () => {
    labelScanRequestIdRef.current += 1
    setLabelScannerCaptured('')
    setLabelScannerError('')
    setLabelScannerLoading(false)
  }

  const openLibraryEditor = (food) => {
    setEditingLibraryFood(food)
    setLibraryEditorData({
      id: food.id,
      name: food.name || '',
      brand: food.brand || '',
      serving_size_g: food.serving_size_g ? String(food.serving_size_g) : '',
      calories_per_100g: food.calories_per_100g ?? '',
      protein_per_100g: food.protein_per_100g ?? '',
      carbs_per_100g: food.carbs_per_100g ?? '',
      fat_per_100g: food.fat_per_100g ?? '',
      fibre_per_100g: food.fibre_per_100g ?? ''
    })
  }

  const closeLibraryEditor = () => {
    setEditingLibraryFood(null)
    setLibraryEditorSaving(false)
  }

  const handleLibraryEditorChange = (event) => {
    const { name, value } = event.target
    setLibraryEditorData((current) => ({ ...current, [name]: value }))
  }

  const handleSaveLibraryItem = async (event) => {
    event.preventDefault()

    try {
      setLibraryEditorSaving(true)
      await foodApi.updateLibraryItem(libraryEditorData.id, {
        source: 'local',
        name: libraryEditorData.name,
        brand: libraryEditorData.brand || null,
        serving_size_g: parseNullableNumber(libraryEditorData.serving_size_g),
        calories_per_100g: parseNullableNumber(libraryEditorData.calories_per_100g),
        protein_per_100g: parseNullableNumber(libraryEditorData.protein_per_100g),
        carbs_per_100g: parseNullableNumber(libraryEditorData.carbs_per_100g),
        fat_per_100g: parseNullableNumber(libraryEditorData.fat_per_100g),
        fibre_per_100g: parseNullableNumber(libraryEditorData.fibre_per_100g)
      })
      await loadLibraryFoods()
      closeLibraryEditor()
    } catch (error) {
      console.error('Failed to update library item:', error)
      alert('Failed to update My Food. Please try again.')
    } finally {
      setLibraryEditorSaving(false)
    }
  }

  const handleDeleteLibraryItem = async (food) => {
    if (!confirm(`Delete ${food.name} from My Foods?`)) {
      return
    }

    try {
      await foodApi.deleteLibraryItem(food.id)
      await loadLibraryFoods()
    } catch (error) {
      console.error('Failed to delete food item:', error)
      alert('Failed to delete My Food. Please try again.')
    }
  }

  const handleSaveFoodToMeals = async () => {
    if (!selectedFood?.name || selectedDays.length === 0) {
      return
    }

    const calories = parseNullableNumber(mealEdit.calories)
    if (calories === null) {
      alert('Calories are required before saving.')
      return
    }

    try {
      setSavingFood(true)

      const payloads = selectedDays.map((dateKey) => ({
        meal_type: selectedMealType,
        food_name: selectedFood.name,
        calories: Math.round(calories),
        protein: parseNullableNumber(mealEdit.protein),
        carbs: parseNullableNumber(mealEdit.carbs),
        fat: parseNullableNumber(mealEdit.fat),
        logged_at: toIsoAtNoon(dateKey)
      }))

      await Promise.all(payloads.map((payload) => addMeal(payload)))

      if (saveToLibrary && selectedFood?.name) {
        try {
          await foodApi.saveToLibrary({
            source: selectedFood.source || selectedSource || 'manual',
            name: selectedFood.name,
            brand: selectedFood.brand || null,
            calories_per_100g: derivePer100FromAbsolute(mealEdit.calories, quantityG),
            protein_per_100g: derivePer100FromAbsolute(mealEdit.protein, quantityG),
            carbs_per_100g: derivePer100FromAbsolute(mealEdit.carbs, quantityG),
            fat_per_100g: derivePer100FromAbsolute(mealEdit.fat, quantityG),
            fibre_per_100g: parseNullableNumber(selectedFood.fibre_per_100g),
            serving_size_g: parseNullableNumber(selectedFood.serving_size_g)
          })
        } catch (libraryError) {
          console.error('Failed to save food to library:', libraryError)
        }
      }

      await loadMeals()
      await loadLibraryFoods()
      await loadHistoryFoods()
      closeAddFood()
    } catch (error) {
      console.error('Failed to save meal:', error)
      alert(error.response?.data?.error || 'Failed to save meal. Please try again.')
    } finally {
      setSavingFood(false)
    }
  }

  const deleteMeal = async (mealId) => {
    try {
      await mealsApi.delete(mealId)
      await loadMeals()
      await loadHistoryFoods()
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
      await loadHistoryFoods()
    } catch (error) {
      console.error('Failed to copy meals:', error)
      alert('Failed to copy meals. Please try again.')
    }
  }

  const filteredLibraryFoods = useMemo(() => {
    const query = foodSearchQuery.trim().toLowerCase()
    if (!query) {
      return libraryFoods
    }

    return libraryFoods.filter((food) => (
      String(food.name || '').toLowerCase().includes(query)
      || String(food.brand || '').toLowerCase().includes(query)
    ))
  }, [foodSearchQuery, libraryFoods])

  const filteredHistoryFoods = useMemo(() => {
    const query = foodSearchQuery.trim().toLowerCase()
    if (!query) {
      return historyFoods
    }

    return historyFoods.filter((food) => String(food.food_name || '').toLowerCase().includes(query))
  }, [foodSearchQuery, historyFoods])

  const activeSearchResults = useMemo(() => {
    if (searchTab === 'my_foods') {
      return filteredLibraryFoods.map((food) => ({ ...food, __type: 'library' }))
    }

    if (searchTab === 'my_meals') {
      return filteredHistoryFoods.map((item) => ({
        id: `history-${item.food_name}`,
        source: 'history',
        name: item.food_name,
        brand: 'Meal History',
        calories_per_100g: parseNullableNumber(item.calories),
        protein_per_100g: parseNullableNumber(item.protein),
        carbs_per_100g: parseNullableNumber(item.carbs),
        fat_per_100g: parseNullableNumber(item.fat),
        serving_size_g: 100,
        __type: 'history'
      }))
    }

    if (searchTab === 'my_recipes') {
      return []
    }

    return foodSearchResults
  }, [searchTab, filteredLibraryFoods, filteredHistoryFoods, foodSearchResults])

  const formatDate = (date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    }

    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  const calorieProgress = Math.min((dailyTotals.calories / calorieGoal) * 100, 100)
  const remainingCalories = calorieGoal - dailyTotals.calories
  const mealDraftPreview = useMemo(() => ({
    calories: parseNullableNumber(mealEdit.calories) || 0,
    protein: parseNullableNumber(mealEdit.protein) || 0,
    carbs: parseNullableNumber(mealEdit.carbs) || 0,
    fat: parseNullableNumber(mealEdit.fat) || 0
  }), [mealEdit])

  const mealGoalPercentages = useMemo(() => ({
    calories: Math.max(0, Math.min(100, Math.round((mealDraftPreview.calories / calorieGoal) * 100))),
    carbs: Math.max(0, Math.min(100, Math.round((mealDraftPreview.carbs / DAILY_MACRO_GOALS.carbs) * 100))),
    fat: Math.max(0, Math.min(100, Math.round((mealDraftPreview.fat / DAILY_MACRO_GOALS.fat) * 100))),
    protein: Math.max(0, Math.min(100, Math.round((mealDraftPreview.protein / DAILY_MACRO_GOALS.protein) * 100)))
  }), [mealDraftPreview, calorieGoal])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-900 text-white">
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
              <p className="text-cyan-400 text-sm font-medium">{formatDate(selectedDate)}</p>
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

      <main className="page-content flex-1 min-h-0 overflow-y-auto pb-[calc(90px+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md px-4">
          <div className="mt-4 bg-gray-800/50 rounded-2xl border border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <FireIcon className="h-5 w-5 text-orange-500" />
                <span className="text-gray-300 text-sm">Calories</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-white">{dailyTotals.calories}</span>
                <span className="text-gray-400 text-sm"> / {calorieGoal}</span>
              </div>
            </div>

            <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-2.5">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${calorieProgress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className={`font-medium ${remainingCalories >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {remainingCalories >= 0 ? `${remainingCalories} remaining` : `${Math.abs(remainingCalories)} over`}
              </span>
              <span className="text-gray-400">{Math.round(calorieProgress)}%</span>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-700">
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
                  <div className={`flex items-center justify-between bg-gray-800/50 px-3 ${isCollapsed ? 'py-3' : 'py-2.5'}`}>
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
                        onClick={() => openAddFood(mealType.id)}
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
                              className="group flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-gray-800/30"
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
                                <span className="text-cyan-400 font-medium text-sm">{meal.calories}</span>
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
                        <div className="px-3 py-4 text-center">
                          <p className="text-gray-500 text-sm">No foods logged</p>
                        </div>
                      )}

                      <button
                        onClick={() => openAddFood(mealType.id)}
                        className="flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-500/5"
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

          {!isToday() && meals.length === 0 && (
            <button
              onClick={copyFromYesterday}
              className="mt-6 w-full bg-gray-800 hover:bg-gray-700 text-white py-3 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-gray-700"
            >
              <DocumentDuplicateIcon className="h-5 w-5 text-cyan-400" />
              Copy from Yesterday
            </button>
          )}

          {loading && <p className="mt-4 text-center text-sm text-gray-500">Loading meals...</p>}
        </div>
      </main>

      <BottomNav active="meals" />

      {addFoodFlow !== 'closed' && (
        <div className="fixed inset-0 z-50 bg-gray-900">
          {addFoodFlow === 'search' ? (
            <div className="mx-auto flex h-full w-full max-w-md flex-col">
              <div className="border-b border-gray-800 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={closeAddFood}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-semibold text-white">Add Food</h2>
                  <div className="w-11" />
                </div>

                <div className="rounded-2xl border border-gray-700 bg-gray-900 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-500" />
                    <input
                      type="text"
                      autoFocus
                      value={foodSearchQuery}
                      onChange={(event) => setFoodSearchQuery(event.target.value)}
                      placeholder="Search for a food"
                      className="w-full bg-transparent text-base text-white placeholder-gray-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 overflow-x-auto">
                  {SEARCH_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSearchTab(tab.id)}
                      className={`border-b-2 pb-1 text-sm ${
                        searchTab === tab.id ? 'border-cyan-400 text-white' : 'border-transparent text-gray-400'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4">
                <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-700 bg-gray-800/40 p-3">
                  <button
                    type="button"
                    onClick={openLabelScanner}
                    className="rounded-xl border border-gray-700 bg-gray-900 p-4 text-center transition-colors hover:border-cyan-500/40"
                  >
                    <span className="text-2xl">📸</span>
                    <p className="mt-2 text-sm text-cyan-300">Scan a Meal</p>
                  </button>
                  <button
                    type="button"
                    onClick={openBarcodeScanner}
                    className="rounded-xl border border-gray-700 bg-gray-900 p-4 text-center transition-colors hover:border-cyan-500/40"
                  >
                    <span className="text-2xl">📷</span>
                    <p className="mt-2 text-sm text-cyan-300">Scan a Barcode</p>
                  </button>
                </div>

                {searchTab === 'all' && (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-200">History</h3>
                      <div className="flex items-center gap-1 rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
                        <Bars3BottomLeftIcon className="h-3.5 w-3.5" />
                        A - Z
                      </div>
                    </div>
                    <div className="space-y-2">
                      {filteredHistoryFoods.slice(0, 20).map((item, index) => (
                        <button
                          key={`${item.food_name}-${index}`}
                          type="button"
                          onClick={() => handleFoodChoice({
                            source: 'history',
                            id: `history-${item.food_name}-${index}`,
                            name: item.food_name,
                            brand: 'Meal History',
                            calories_per_100g: parseNullableNumber(item.calories),
                            protein_per_100g: parseNullableNumber(item.protein),
                            carbs_per_100g: parseNullableNumber(item.carbs),
                            fat_per_100g: parseNullableNumber(item.fat),
                            serving_size_g: 100
                          }, 'history')}
                          className="flex w-full items-center justify-between rounded-xl border border-gray-800 bg-gray-900/70 px-3 py-3 text-left"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-100">{item.food_name}</p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              {parseInt(item.calories, 10) || 0} kcal, used {item.count || 1}x
                            </p>
                          </div>
                          <span className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400 transition-colors hover:bg-cyan-500/20">+</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(searchTab !== 'all' || foodSearchQuery.trim().length >= 3) && (
                  <div className="mt-5 space-y-2">
                    {libraryLoading && searchTab === 'my_foods' && <p className="text-sm text-gray-400">Loading My Foods...</p>}
                    {foodSearchLoading && searchTab === 'all' && <p className="text-sm text-gray-400">Searching...</p>}
                    {foodSearchError && <p className="text-sm text-red-400">{foodSearchError}</p>}
                    {searchTab === 'my_recipes' && (
                      <p className="rounded-xl border border-gray-800 bg-gray-900/70 p-3 text-sm text-gray-400">
                        Recipe support is not wired yet.
                      </p>
                    )}

                    {activeSearchResults.map((item) => (
                      <div
                        key={`${item.source || item.__type}-${item.id || item.name}`}
                        className="rounded-xl border border-gray-700 bg-gray-900 p-3"
                      >
                        <button
                          type="button"
                          onClick={() => handleFoodChoice(item, item.source || item.__type || 'search')}
                          className="w-full text-left"
                        >
                          <div className="text-base font-semibold text-white">{item.name}</div>
                          <div className="mt-1 text-sm text-gray-400">{item.brand || 'No brand listed'}</div>
                          <div className="mt-2 text-xs text-cyan-400">
                            {item.calories_per_100g ?? 'N/A'} kcal / 100g
                          </div>
                        </button>
                        {searchTab === 'my_foods' && (
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => openLibraryEditor(item)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLibraryItem(item)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {!foodSearchLoading && !libraryLoading && activeSearchResults.length === 0 && searchTab !== 'my_recipes' && (
                      <p className="text-sm text-gray-500">No results to show.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-full w-full max-w-md flex-col">
              <div className="border-b border-gray-800 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setAddFoodFlow('search')}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-semibold text-white">Add Food</h2>
                  <button
                    type="button"
                    onClick={handleSaveFoodToMeals}
                    disabled={savingFood}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-cyan-400 hover:bg-gray-800 disabled:opacity-50"
                  >
                    <CheckIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {selectedFood && (
                <div className="flex-1 overflow-y-auto px-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
                  <div className="border-b border-gray-800 py-4">
                    <h3 className="text-2xl font-semibold leading-tight text-white">{selectedFood.name}</h3>
                    {selectedFood.brand && <p className="mt-1 text-sm text-gray-400">{selectedFood.brand}</p>}
                  </div>

                  <div className="border-b border-gray-800 py-3">
                    <button
                      type="button"
                      onClick={() => setShowMealPicker((current) => !current)}
                      className="flex w-full items-center justify-between py-1"
                    >
                      <span className="text-lg text-gray-300">Meal</span>
                      <span className="flex items-center gap-1 text-lg text-cyan-400">
                        {MEAL_TYPES.find((m) => m.id === selectedMealType)?.label}
                        <ChevronDownIcon className="h-4 w-4" />
                      </span>
                    </button>
                    {showMealPicker && (
                      <div className="mt-3 rounded-xl bg-gray-700/60 p-1">
                        {MEAL_TYPES.map((meal) => (
                          <button
                            key={meal.id}
                            type="button"
                            onClick={() => {
                              setSelectedMealType(meal.id)
                              setShowMealPicker(false)
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${
                              selectedMealType === meal.id ? 'bg-gray-600 text-white' : 'text-gray-200'
                            }`}
                          >
                            <span>{meal.label}</span>
                            {selectedMealType === meal.id && <CheckIcon className="h-4 w-4" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-b border-gray-800 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setServingDraft(servingCount)
                        setShowServingDialog(true)
                      }}
                      className="flex w-full items-center justify-between py-1"
                    >
                      <span className="text-lg text-gray-300">Number of Servings</span>
                      <span className="text-2xl font-semibold text-cyan-400">{servingCount}</span>
                    </button>
                  </div>

                  <div className="border-b border-gray-800 py-3">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-lg text-gray-300">Serving Size</span>
                      <span className="text-lg text-cyan-400">{roundValue(selectedFood.serving_size_g)} g</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={selectedFood.serving_size_g ?? ''}
                      onChange={(event) => {
                        const nextServing = event.target.value
                        handleSelectedFoodChange('serving_size_g', nextServing)
                        const servings = Number(servingCount)
                        const parsedServing = Number(nextServing)
                        if (Number.isFinite(servings) && servings > 0 && Number.isFinite(parsedServing) && parsedServing > 0) {
                          setQuantityG(String(roundValue(servings * parsedServing)))
                        }
                      }}
                      className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-base text-white focus:border-cyan-500 focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Current amount: {formatServingCount(servingCount)} serving(s), {roundValue(quantityG)} g total
                    </p>
                  </div>

                  <div className="border-b border-gray-800 py-3">
                    <p className="text-lg text-gray-300">Add to Multiple Days</p>
                    <div className="mt-2 grid grid-cols-7 gap-1.5">
                      {nextDays(selectedDate).map((day) => {
                        const active = selectedDays.includes(day.key)
                        return (
                          <button
                            key={day.key}
                            type="button"
                            onClick={() => toggleDay(day.key)}
                            className={`rounded-xl px-1 py-2 text-center ${active ? 'bg-cyan-500 text-black' : 'bg-gray-900 text-gray-400'}`}
                          >
                            <div className="text-xs">{day.day}</div>
                            <div className="text-lg font-semibold">{day.dateNumber}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="py-4">
                    <div className="mb-4 rounded-2xl border border-gray-700 bg-gray-900 p-4">
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <div className="text-2xl font-semibold text-white">{Math.round(mealDraftPreview.calories)}</div>
                          <div className="text-xs text-gray-400">Cal</div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-cyan-400">{roundValue(mealDraftPreview.carbs)}g</div>
                          <div className="text-xs text-gray-400">Carbs</div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-cyan-400">{roundValue(mealDraftPreview.fat)}g</div>
                          <div className="text-xs text-gray-400">Fat</div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-cyan-400">{roundValue(mealDraftPreview.protein)}g</div>
                          <div className="text-xs text-gray-400">Protein</div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 rounded-2xl border border-gray-700 bg-gray-900 p-4">
                      <p className="text-sm font-medium text-gray-200">Percent of Your Daily Goals</p>
                      <div className="mt-3 space-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                            <span>Calories</span>
                            <span>{mealGoalPercentages.calories}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-800">
                            <div className="h-1.5 rounded-full bg-cyan-400" style={{ width: `${mealGoalPercentages.calories}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                            <span>Carbs</span>
                            <span>{mealGoalPercentages.carbs}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-800">
                            <div className="h-1.5 rounded-full bg-cyan-400" style={{ width: `${mealGoalPercentages.carbs}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                            <span>Fat</span>
                            <span>{mealGoalPercentages.fat}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-800">
                            <div className="h-1.5 rounded-full bg-cyan-400" style={{ width: `${mealGoalPercentages.fat}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                            <span>Protein</span>
                            <span>{mealGoalPercentages.protein}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-800">
                            <div className="h-1.5 rounded-full bg-cyan-400" style={{ width: `${mealGoalPercentages.protein}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-lg font-semibold text-gray-200">Edit Values Before Saving</p>
                    <p className="mt-1 text-sm text-gray-500">Adjust calories and macros if the search data is not accurate.</p>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="rounded-xl border border-gray-700 bg-gray-900 p-3">
                        <span className="text-xs text-gray-500">Calories</span>
                        <input
                          type="number"
                          value={mealEdit.calories}
                          onChange={(event) => setMealEdit((current) => ({ ...current, calories: event.target.value }))}
                          className="mt-1 w-full bg-transparent text-xl font-semibold text-white focus:outline-none"
                        />
                      </label>
                      <label className="rounded-xl border border-gray-700 bg-gray-900 p-3">
                        <span className="text-xs text-gray-500">Protein (g)</span>
                        <input
                          type="number"
                          step="0.1"
                          value={mealEdit.protein}
                          onChange={(event) => setMealEdit((current) => ({ ...current, protein: event.target.value }))}
                          className="mt-1 w-full bg-transparent text-xl font-semibold text-white focus:outline-none"
                        />
                      </label>
                      <label className="rounded-xl border border-gray-700 bg-gray-900 p-3">
                        <span className="text-xs text-gray-500">Carbs (g)</span>
                        <input
                          type="number"
                          step="0.1"
                          value={mealEdit.carbs}
                          onChange={(event) => setMealEdit((current) => ({ ...current, carbs: event.target.value }))}
                          className="mt-1 w-full bg-transparent text-xl font-semibold text-white focus:outline-none"
                        />
                      </label>
                      <label className="rounded-xl border border-gray-700 bg-gray-900 p-3">
                        <span className="text-xs text-gray-500">Fat (g)</span>
                        <input
                          type="number"
                          step="0.1"
                          value={mealEdit.fat}
                          onChange={(event) => setMealEdit((current) => ({ ...current, fat: event.target.value }))}
                          className="mt-1 w-full bg-transparent text-xl font-semibold text-white focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-4 rounded-2xl border border-gray-700 bg-gray-900/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">Save To My Foods</p>
                          <p className="text-xs text-gray-400">Store this edited item for future use.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSaveToLibrary((current) => !current)}
                          className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${saveToLibrary ? 'bg-cyan-500' : 'bg-gray-700'}`}
                        >
                          <span
                            className={`h-5 w-5 rounded-full bg-white transition-transform ${saveToLibrary ? 'translate-x-5' : 'translate-x-0'}`}
                          />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveFoodToMeals}
                      disabled={savingFood}
                      className="mt-4 w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
                    >
                      {savingFood ? 'Saving...' : 'Save Food'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showServingDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowServingDialog(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-gray-700 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-white">How Much?</h3>
            <div className="mt-4 rounded-xl bg-gray-800 px-3 py-2">
              <div className="flex items-center gap-2 text-2xl text-gray-100">
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={servingDraft}
                  onChange={(event) => setServingDraft(event.target.value)}
                  className="w-24 bg-transparent text-2xl text-white focus:outline-none"
                />
                <span className="text-lg text-gray-300">serving(s)</span>
              </div>
              <div className="mt-1 text-sm text-gray-400">{roundValue(selectedFood?.serving_size_g || 100)} g each</div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => setShowServingDialog(false)}
                className="text-cyan-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleServingCountChange(servingDraft)
                  setShowServingDialog(false)
                }}
                className="text-cyan-400"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {barcodeScannerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeBarcodeScanner}
        >
          <div
            className="my-auto max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4 sm:max-h-[85dvh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Scan Barcode</h2>
                <p className="text-sm text-gray-400">Point the camera at the product barcode.</p>
              </div>
              <button
                type="button"
                onClick={closeBarcodeScanner}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <BarcodeScanner
              active={barcodeScannerOpen && !scannerLookupLoading}
              onDetected={handleBarcodeDetected}
              onError={() => setScannerError('Unable to access camera. Check browser permissions and HTTPS.')}
            />

            {scannerLookupLoading && <p className="mt-3 text-sm text-gray-400">Looking up product...</p>}
            {scannerError && <p className="mt-3 text-sm text-red-400">{scannerError}</p>}
            {(scannerNotFound || scannerError) && (
              <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-sm text-yellow-200">
                  {scannerNotFound ? 'Product not found. Try searching by name instead.' : 'Search by name is available if barcode lookup is slow.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    closeBarcodeScanner()
                    setAddFoodFlow('search')
                  }}
                  className="mt-3 min-h-[44px] rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400"
                >
                  Search by name
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {labelScannerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeLabelScanner}
        >
          <div
            className="my-auto max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4 sm:max-h-[85dvh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Scan a Meal</h2>
                <p className="text-sm text-gray-400">Capture the nutrition label, then edit before saving.</p>
              </div>
              <button
                type="button"
                onClick={closeLabelScanner}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <CameraCapturePanel
              active={labelScannerOpen}
              capturedImage={labelScannerCaptured}
              error={labelScannerError}
              loading={labelScannerLoading}
              loadingText="Analyzing label..."
              captureLabel="Take Photo 📸"
              onCapture={handleLabelCapture}
              onRetry={retryLabelScanner}
              onFallback={() => {
                closeLabelScanner()
                setAddFoodFlow('search')
              }}
              fallbackLabel="Search Manually"
            />
          </div>
        </div>
      )}

      {editingLibraryFood && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 p-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeLibraryEditor}
        >
          <div
            className="my-auto w-full max-w-md rounded-2xl border border-gray-700 bg-gray-800 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Edit My Food</h2>
                <p className="text-sm text-gray-400">Update saved nutrition values</p>
              </div>
              <button
                type="button"
                onClick={closeLibraryEditor}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLibraryItem} className="space-y-4">
              <input
                type="text"
                name="name"
                value={libraryEditorData.name}
                onChange={handleLibraryEditorChange}
                placeholder="Food name"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
                required
              />
              <input
                type="text"
                name="brand"
                value={libraryEditorData.brand}
                onChange={handleLibraryEditorChange}
                placeholder="Brand"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
              />
              <input
                type="number"
                name="serving_size_g"
                value={libraryEditorData.serving_size_g}
                onChange={handleLibraryEditorChange}
                placeholder="Serving size (g)"
                min="1"
                step="0.1"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  name="calories_per_100g"
                  value={libraryEditorData.calories_per_100g}
                  onChange={handleLibraryEditorChange}
                  placeholder="kcal / 100g"
                  step="0.1"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
                />
                <input
                  type="number"
                  name="protein_per_100g"
                  value={libraryEditorData.protein_per_100g}
                  onChange={handleLibraryEditorChange}
                  placeholder="Protein / 100g"
                  step="0.1"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
                />
                <input
                  type="number"
                  name="carbs_per_100g"
                  value={libraryEditorData.carbs_per_100g}
                  onChange={handleLibraryEditorChange}
                  placeholder="Carbs / 100g"
                  step="0.1"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
                />
                <input
                  type="number"
                  name="fat_per_100g"
                  value={libraryEditorData.fat_per_100g}
                  onChange={handleLibraryEditorChange}
                  placeholder="Fat / 100g"
                  step="0.1"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeLibraryEditor}
                  className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={libraryEditorSaving}
                  className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
                >
                  {libraryEditorSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
