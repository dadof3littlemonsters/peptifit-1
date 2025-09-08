import { useState, useEffect } from 'react'
import { auth, doses, peptides } from '../lib/api'
import Link from 'next/link'
import { 
  BeakerIcon, 
  ClockIcon, 
  UserIcon,
  CalendarDaysIcon,
  PlusIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

// Pharmacokinetic data for GLP-1 peptides
const PK_DATA = {
  tirzepatide: {
    halfLife: 120, // 5 days in hours
    peakTime: 8, // hours to peak concentration
    bioavailability: 0.8
  },
  retatrutide: {
    halfLife: 96, // 4 days in hours  
    peakTime: 12, // hours to peak concentration
    bioavailability: 0.75
  }
}

// Calculate estimated current medication level
const calculateCurrentLevel = (lastDose, peptideName) => {
  if (!lastDose) return 0
  
  const pkData = PK_DATA[peptideName.toLowerCase()]
  if (!pkData) return 0
  
  const hoursSinceDose = (Date.now() - new Date(lastDose.administration_time).getTime()) / (1000 * 60 * 60)
  const decayConstant = Math.log(2) / pkData.halfLife
  const currentLevel = lastDose.dose_amount * Math.exp(-decayConstant * hoursSinceDose)
  
  return Math.max(0, currentLevel)
}

// Generate SVG path for PK curve
const generatePKCurve = (lastDose, peptideName) => {
  if (!lastDose) return "M0,50 L300,50"
  
  const pkData = PK_DATA[peptideName.toLowerCase()]
  if (!pkData) return "M0,50 L300,50"
  
  const hoursSinceDose = (Date.now() - new Date(lastDose.administration_time).getTime()) / (1000 * 60 * 60)
  const points = []
  
  for (let i = 0; i <= 300; i += 10) {
    const timePoint = (i / 300) * (pkData.halfLife * 2) // Show 2 half-lives
    let level
    
    if (timePoint < pkData.peakTime) {
      // Rising phase
      level = (timePoint / pkData.peakTime) * lastDose.dose_amount * pkData.bioavailability
    } else {
      // Decay phase
      const decayConstant = Math.log(2) / pkData.halfLife
      level = lastDose.dose_amount * pkData.bioavailability * Math.exp(-decayConstant * (timePoint - pkData.peakTime))
    }
    
    const y = 50 - (level / lastDose.dose_amount) * 40 // Scale to SVG height
    points.push(`${i},${Math.max(10, Math.min(50, y))}`)
  }
  
  return `M${points.join(' L')}`
}

// Calculate time until next dose
const calculateNextDose = (lastDose, frequency) => {
  if (!lastDose) return "Ready for dose"
  
  const lastDoseTime = new Date(lastDose.administration_time)
  let nextDoseTime
  
  if (frequency.toLowerCase().includes('weekly')) {
    nextDoseTime = new Date(lastDoseTime.getTime() + (7 * 24 * 60 * 60 * 1000))
  } else if (frequency.toLowerCase().includes('daily')) {
    nextDoseTime = new Date(lastDoseTime.getTime() + (24 * 60 * 60 * 1000))
  } else {
    // Default to weekly for GLP-1s
    nextDoseTime = new Date(lastDoseTime.getTime() + (7 * 24 * 60 * 60 * 1000))
  }
  
  const timeUntilNext = nextDoseTime.getTime() - Date.now()
  
  if (timeUntilNext <= 0) return "Ready for dose"
  
  const days = Math.floor(timeUntilNext / (24 * 60 * 60 * 1000))
  const hours = Math.floor((timeUntilNext % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

// PK Graph Component
const PKGraph = ({ peptide, lastDose }) => {
  const currentLevel = calculateCurrentLevel(lastDose, peptide.name)
  const pkCurve = generatePKCurve(lastDose, peptide.name)
  const hoursSinceDose = lastDose ? 
    Math.floor((Date.now() - new Date(lastDose.administration_time).getTime()) / (1000 * 60 * 60)) : 0
  
  return (
    <div className="h-32 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl mb-4 relative overflow-hidden border border-gray-700">
      <div className="absolute top-4 left-5 right-5 flex justify-between items-center">
        <div className="text-cyan-400 text-sm font-semibold">
          Current: {currentLevel.toFixed(1)}mg
        </div>
        <div className="text-gray-400 text-xs">
          {hoursSinceDose}h since dose
        </div>
      </div>
      <div className="absolute bottom-5 left-5 right-5 h-16">
        <svg viewBox="0 0 300 60" className="w-full h-full">
          <defs>
            <linearGradient id="pkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="1" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path 
            d={pkCurve}
            stroke="url(#pkGradient)" 
            strokeWidth="3" 
            fill="none"
            className="drop-shadow-sm"
          />
          {lastDose && (
            <circle 
              cx={hoursSinceDose * 2} 
              cy={50 - (currentLevel / lastDose.dose_amount) * 40} 
              r="4" 
              fill="#00d4ff"
              className="drop-shadow-sm"
            />
          )}
        </svg>
      </div>
    </div>
  )
}

// Dose Timer Component
const DoseTimer = ({ lastDose, frequency }) => {
  const timeUntilNext = calculateNextDose(lastDose, frequency)
  const isReady = timeUntilNext === "Ready for dose"
  
  return (
    <div className="flex items-center justify-center mb-4">
      <div className="w-28 h-28 relative">
        <div className={`w-full h-full rounded-full p-1 ${
          isReady 
            ? 'bg-gradient-to-r from-green-500 to-emerald-500'
            : 'bg-gradient-to-r from-orange-500 via-yellow-500 to-cyan-500'
        }`}>
          <div className="w-full h-full bg-gray-800 rounded-full flex flex-col items-center justify-center text-center">
            <div className="text-xs text-gray-400 mb-1">
              {isReady ? "Ready!" : "Next dose in"}
            </div>
            <div className="text-sm font-semibold text-white">
              {timeUntilNext}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// GLP-1 Peptide Card with PK visualization
const GLPPeptideCard = ({ peptide, recentDoses }) => {
  const lastDose = recentDoses.find(dose => dose.peptide_id === peptide.id)
  const totalShots = recentDoses.filter(dose => dose.peptide_id === peptide.id).length
  
  return (
    <div className="bg-gray-800 rounded-2xl p-5 mb-4 border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white">{peptide.name}</h3>
        <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-medium">
          GLP-1
        </span>
      </div>
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="text-gray-400 text-xs mb-1">Last dose</div>
          <div className="text-white font-semibold">
            {lastDose ? `${lastDose.dose_amount}${lastDose.dose_unit}` : 'None'}
          </div>
        </div>
        <div>
          <div className="text-gray-400 text-xs mb-1">Injection site</div>
          <div className="text-white font-semibold">
            {lastDose?.injection_site || 'N/A'}
          </div>
        </div>
        <div>
          <div className="text-gray-400 text-xs mb-1">Total shots</div>
          <div className="text-white font-semibold">{totalShots}</div>
        </div>
      </div>
      
      <PKGraph peptide={peptide} lastDose={lastDose} />
      <DoseTimer lastDose={lastDose} frequency={peptide.frequency} />
      
      <div className="flex gap-3">
        <Link 
          href={`/log-dose?peptide=${peptide.id}`}
          className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 px-4 rounded-xl text-center transition-colors"
        >
          Log Dose
        </Link>
        <Link 
          href={`/peptides/${peptide.id}`}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-xl text-center transition-colors border border-gray-600"
        >
          View History
        </Link>
      </div>
    </div>
  )
}

// Simple Peptide Card for non-GLP-1s
const SimplePeptideCard = ({ peptide, recentDoses }) => {
  const peptideDoses = recentDoses.filter(dose => dose.peptide_id === peptide.id)
  const lastDose = peptideDoses[0]
  const totalShots = peptideDoses.length
  const thisWeekShots = peptideDoses.filter(dose => {
    const doseDate = new Date(dose.administration_time)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    return doseDate > weekAgo
  }).length
  
  const getPeptideColor = (name) => {
    if (name.toLowerCase().includes('mots')) return 'emerald'
    if (name.toLowerCase().includes('selank')) return 'blue'
    return 'indigo'
  }
  
  const colorClass = getPeptideColor(peptide.name)
  
  return (
    <div className="bg-gray-800 rounded-2xl p-5 mb-4 border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">{peptide.name}</h3>
        <span className={`bg-${colorClass}-600 text-white px-3 py-1 rounded-full text-xs font-medium`}>
          {peptide.name.includes('MOTS') ? 'Mitochondrial' : 'Nootropic'}
        </span>
      </div>
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="text-gray-400 text-xs mb-1">Last dose</div>
          <div className="text-white font-semibold">
            {lastDose ? `${lastDose.dose_amount}${lastDose.dose_unit}` : 'None'}
          </div>
        </div>
        <div>
          <div className="text-gray-400 text-xs mb-1">Total shots</div>
          <div className="text-white font-semibold">{totalShots}</div>
        </div>
        <div>
          <div className="text-gray-400 text-xs mb-1">This week</div>
          <div className="text-white font-semibold">{thisWeekShots}</div>
        </div>
      </div>
      
      <div className="flex gap-3">
        <Link 
          href={`/log-dose?peptide=${peptide.id}`}
          className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 px-4 rounded-xl text-center transition-colors"
        >
          Log Dose
        </Link>
        <Link 
          href={`/peptides/${peptide.id}`}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-xl text-center transition-colors border border-gray-600"
        >
          View History
        </Link>
      </div>
    </div>
  )
}

export default function Dashboard({ user }) {
  const [recentDoses, setRecentDoses] = useState([])
  const [availablePeptides, setAvailablePeptides] = useState([])
  const [loading, setLoading] = useState(true)

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

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      month: 'long', 
      day: 'numeric'
    })
  }

  // Calculate summary statistics
  const totalShots = recentDoses.length
  const lastDose = recentDoses[0]
  const recentGLPDoses = recentDoses.filter(dose => {
    const peptide = availablePeptides.find(p => p.id === dose.peptide_id)
    return peptide && (peptide.name.toLowerCase().includes('tirzepatide') || 
                      peptide.name.toLowerCase().includes('retatrutide'))
  })
  const avgLevel = recentGLPDoses.length > 0 ? 
    recentGLPDoses.reduce((sum, dose) => {
      const peptide = availablePeptides.find(p => p.id === dose.peptide_id)
      return sum + calculateCurrentLevel(dose, peptide?.name || '')
    }, 0) / recentGLPDoses.length : 0

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
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-black border-b border-gray-800">
        <div className="max-w-md mx-auto px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">PeptiFit</h1>
              <p className="text-gray-400 text-sm">{formatDate(new Date())}</p>
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

      {/* Summary Cards */}
      <div className="max-w-md mx-auto px-5 py-5">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-800 rounded-xl p-4 text-center border border-gray-700">
            <div className="text-cyan-400 text-sm mb-2">💉</div>
            <div className="text-xl font-semibold text-white">{totalShots}</div>
            <div className="text-gray-400 text-xs">Shots taken</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center border border-gray-700">
            <div className="text-cyan-400 text-sm mb-2">⏱️</div>
            <div className="text-xl font-semibold text-white">
              {lastDose ? `${lastDose.dose_amount}${lastDose.dose_unit}` : '0mg'}
            </div>
            <div className="text-gray-400 text-xs">Last dose</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center border border-gray-700">
            <div className="text-cyan-400 text-sm mb-2">📊</div>
            <div className="text-xl font-semibold text-white">{avgLevel.toFixed(1)}mg</div>
            <div className="text-gray-400 text-xs">Est. level</div>
          </div>
        </div>

        {/* Peptide Cards */}
        <div className="space-y-4">
          {availablePeptides.map((peptide) => {
            const isGLP1 = peptide.name.toLowerCase().includes('tirzepatide') || 
                          peptide.name.toLowerCase().includes('retatrutide')
            
            return isGLP1 ? (
              <GLPPeptideCard 
                key={peptide.id} 
                peptide={peptide} 
                recentDoses={recentDoses} 
              />
            ) : (
              <SimplePeptideCard 
                key={peptide.id} 
                peptide={peptide} 
                recentDoses={recentDoses} 
              />
            )
          })}
        </div>

        {availablePeptides.length === 0 && (
          <div className="text-center py-12">
            <BeakerIcon className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No peptides available</p>
            <Link href="/peptides" className="text-cyan-400 text-sm font-medium mt-2 inline-block">
              Explore peptide library
            </Link>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800">
        <div className="max-w-md mx-auto">
          <div className="grid grid-cols-5 py-2">
            <Link href="/" className="flex flex-col items-center py-2 text-cyan-400">
              <ChartBarIcon className="h-6 w-6 mb-1" />
              <span className="text-xs">Summary</span>
            </Link>
            <Link href="/log-dose" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
              <PlusIcon className="h-6 w-6 mb-1" />
              <span className="text-xs">Log Dose</span>
            </Link>
            <Link href="/doses" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
              <BeakerIcon className="h-6 w-6 mb-1" />
              <span className="text-xs">History</span>
            </Link>
            <Link href="/peptides" className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors">
              <CalendarDaysIcon className="h-6 w-6 mb-1" />
              <span className="text-xs">Peptides</span>
            </Link>
            <button 
              onClick={auth.logout}
              className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
            >
              <UserIcon className="h-6 w-6 mb-1" />
              <span className="text-xs">Profile</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add padding to account for fixed bottom nav */}
      <div className="h-20"></div>
    </div>
  )
}