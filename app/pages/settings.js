import { useState, useEffect } from 'react'
import { auth } from '../lib/api'
import Link from 'next/link'
import BottomNav from '../components/BottomNav'
import {
  ArrowLeftIcon,
  ArrowRightOnRectangleIcon,
  UserIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'

// ── Reusable toggle-group component ──────────────────────────────────────────
function UnitToggle({ value, onChange, options }) {
  return (
    <div className="flex gap-1 bg-gray-900 rounded-xl p-1">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-cyan-500 text-black'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Settings({ user }) {
  // ── Unit prefs ──
  const [weightUnit, setWeightUnit] = useState('kg')
  const [glucoseUnit, setGlucoseUnit] = useState('mg/dL')
  const [tempUnit, setTempUnit] = useState('C')

  // ── Body metrics ──
  const [heightUnit, setHeightUnit] = useState('cm')   // 'cm' | 'ft'
  const [heightCm, setHeightCm] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [targetWeight, setTargetWeight] = useState('')

  // ── Nutrition goals ──
  const [calorieGoal, setCalorieGoal] = useState(2500)
  const [proteinGoal, setProteinGoal] = useState('')

  // ── Adherence ──
  const [adherenceGoal, setAdherenceGoal] = useState(80)

  // ── UI state ──
  const [saved, setSaved] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  // ── Load from localStorage on mount ──────────────────────────────────────
  useEffect(() => {
    try {
      setWeightUnit(localStorage.getItem('peptifit_weight_unit') || 'kg')
      setGlucoseUnit(localStorage.getItem('peptifit_glucose_unit') || 'mg/dL')
      setTempUnit(localStorage.getItem('peptifit_temp_unit') || 'C')
      setHeightUnit(localStorage.getItem('peptifit_height_unit') || 'cm')
      setHeightCm(localStorage.getItem('peptifit_height_cm') || '')
      setHeightFt(localStorage.getItem('peptifit_height_ft') || '')
      setHeightIn(localStorage.getItem('peptifit_height_in') || '')
      setTargetWeight(localStorage.getItem('peptifit_target_weight') || '')
      setCalorieGoal(parseInt(localStorage.getItem('peptifit_calorie_goal')) || 2500)
      setProteinGoal(localStorage.getItem('peptifit_protein_goal') || '')
      setAdherenceGoal(parseInt(localStorage.getItem('peptifit_adherence_goal')) || 80)
    } catch (err) {
      console.error('Error loading settings:', err)
    }
  }, [])

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    try {
      localStorage.setItem('peptifit_weight_unit', weightUnit)
      localStorage.setItem('peptifit_glucose_unit', glucoseUnit)
      localStorage.setItem('peptifit_temp_unit', tempUnit)
      localStorage.setItem('peptifit_height_unit', heightUnit)
      localStorage.setItem('peptifit_height_cm', heightCm)
      localStorage.setItem('peptifit_height_ft', heightFt)
      localStorage.setItem('peptifit_height_in', heightIn)
      localStorage.setItem('peptifit_target_weight', targetWeight)
      localStorage.setItem('peptifit_calorie_goal', String(calorieGoal || 2500))
      localStorage.setItem('peptifit_protein_goal', proteinGoal)
      localStorage.setItem('peptifit_adherence_goal', String(adherenceGoal || 80))
    } catch (err) {
      console.error('Error saving settings:', err)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Enter your password to delete your account')
      return
    }

    if (!window.confirm('Delete your account and all associated data? This cannot be undone.')) {
      return
    }

    try {
      setDeletingAccount(true)
      setDeleteError('')
      await auth.deleteAccount(deletePassword)
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account')
      setDeletingAccount(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'U'

  const targetWeightLabel = weightUnit === 'kg' ? 'kg'
    : weightUnit === 'lbs' ? 'lbs'
    : 'stone'

  return (
    <div className="h-[100dvh] min-h-screen flex flex-col overflow-hidden bg-gray-900 text-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-14 flex-shrink-0 border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-full w-full max-w-lg items-center gap-3 px-4">
          <Link href="/" className="p-1 -ml-1 text-gray-400 hover:text-white transition-colors">
            <ArrowLeftIcon className="h-6 w-6" />
          </Link>
          <h1 className="text-xl font-semibold text-white">Settings</h1>
        </div>
      </header>

      <main className="page-content mx-auto flex-1 min-h-0 overflow-y-auto w-full max-w-lg px-4 py-6 space-y-6 pb-[calc(104px+env(safe-area-inset-bottom))]">

        {/* ── 1. Account ─────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Account
          </h2>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
            {/* User info row */}
            <div className="flex items-center gap-4 p-4">
              <div className="w-12 h-12 bg-cyan-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-cyan-400 font-bold text-base">{initials}</span>
              </div>
              <div className="min-w-0">
                <div className="text-white font-semibold truncate">
                  {user?.username || 'User'}
                </div>
                {user?.email && (
                  <div className="text-gray-400 text-sm truncate">{user.email}</div>
                )}
              </div>
            </div>

            {/* Log out */}
            <div className="border-t border-gray-700">
              <button
                onClick={auth.logout}
                className="w-full flex items-center gap-3 p-4 text-red-400 hover:bg-red-500/5 transition-colors"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5 flex-shrink-0" />
                <span className="font-medium">Log Out</span>
              </button>
            </div>
          </div>
        </section>

        {/* ── 2. Units & Measurements ────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Units & Measurements
          </h2>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 divide-y divide-gray-700">

            <div className="p-4">
              <div className="text-white text-sm font-medium mb-3">Weight</div>
              <UnitToggle
                value={weightUnit}
                onChange={setWeightUnit}
                options={[
                  { value: 'kg', label: 'kg' },
                  { value: 'lbs', label: 'lbs' },
                  { value: 'st', label: 'stone' }
                ]}
              />
            </div>

            <div className="p-4">
              <div className="text-white text-sm font-medium mb-3">Blood Glucose</div>
              <UnitToggle
                value={glucoseUnit}
                onChange={setGlucoseUnit}
                options={[
                  { value: 'mg/dL', label: 'mg/dL' },
                  { value: 'mmol/L', label: 'mmol/L' }
                ]}
              />
            </div>

            <div className="p-4">
              <div className="text-white text-sm font-medium mb-3">Temperature</div>
              <UnitToggle
                value={tempUnit}
                onChange={setTempUnit}
                options={[
                  { value: 'C', label: '°C' },
                  { value: 'F', label: '°F' }
                ]}
              />
            </div>

          </div>
        </section>

        {/* ── 3. Body Metrics ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Body Metrics
          </h2>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 divide-y divide-gray-700">

            {/* Height */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white text-sm font-medium">Height</div>
                <div className="flex gap-1 bg-gray-900 rounded-lg p-0.5">
                  {['cm', 'ft'].map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setHeightUnit(u)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        heightUnit === u ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {heightUnit === 'cm' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={heightCm}
                    onChange={e => setHeightCm(e.target.value)}
                    placeholder="175"
                    min="100"
                    max="250"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                  <span className="text-gray-400 text-sm w-8">cm</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={heightFt}
                    onChange={e => setHeightFt(e.target.value)}
                    placeholder="5"
                    min="3"
                    max="8"
                    className="w-20 bg-gray-900 border border-gray-700 rounded-xl px-3 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors text-center"
                  />
                  <span className="text-gray-400 text-sm">ft</span>
                  <input
                    type="number"
                    value={heightIn}
                    onChange={e => setHeightIn(e.target.value)}
                    placeholder="10"
                    min="0"
                    max="11"
                    className="w-20 bg-gray-900 border border-gray-700 rounded-xl px-3 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors text-center"
                  />
                  <span className="text-gray-400 text-sm">in</span>
                </div>
              )}
            </div>

            {/* Target weight */}
            <div className="p-4">
              <div className="text-white text-sm font-medium mb-3">
                Target Weight
                <span className="text-gray-500 font-normal ml-1">(optional)</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={targetWeight}
                  onChange={e => setTargetWeight(e.target.value)}
                  placeholder={weightUnit === 'kg' ? '80' : weightUnit === 'lbs' ? '176' : '12'}
                  min="20"
                  max="500"
                  step="0.1"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <span className="text-gray-400 text-sm w-10">{targetWeightLabel}</span>
              </div>
            </div>

          </div>
        </section>

        {/* ── 4. Nutrition Goals ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Nutrition Goals
          </h2>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 divide-y divide-gray-700">

            <div className="p-4">
              <label className="text-white text-sm font-medium block mb-3">
                Daily Calorie Goal
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={calorieGoal}
                  onChange={e => setCalorieGoal(parseInt(e.target.value) || 0)}
                  min="500"
                  max="10000"
                  step="50"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <span className="text-gray-400 text-sm w-10">kcal</span>
              </div>
              {/* Quick-select presets */}
              <div className="flex gap-2 mt-2">
                {[1500, 1800, 2000, 2200, 2500, 3000].map(cal => (
                  <button
                    key={cal}
                    type="button"
                    onClick={() => setCalorieGoal(cal)}
                    className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
                      calorieGoal === cal
                        ? 'bg-orange-500/30 text-orange-400 border border-orange-500/40'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {cal >= 1000 ? `${cal / 1000}k` : cal}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4">
              <label className="text-white text-sm font-medium block mb-3">
                Daily Protein Goal
                <span className="text-gray-500 font-normal ml-1">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={proteinGoal}
                  onChange={e => setProteinGoal(e.target.value)}
                  placeholder="e.g. 180"
                  min="0"
                  max="500"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <span className="text-gray-400 text-sm w-4">g</span>
              </div>
            </div>

          </div>
        </section>

        {/* ── 5. Adherence Goal ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Adherence Goals
          </h2>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white text-sm font-medium">Weekly Peptide Adherence Target</div>
              <div className="text-cyan-400 font-bold text-lg">{adherenceGoal}%</div>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              value={adherenceGoal}
              onChange={e => setAdherenceGoal(parseInt(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
            <p className="text-gray-400 text-xs mt-2">
              Shown as your target on the dashboard adherence stat.
            </p>
          </div>
        </section>

        {/* ── 6. Configuration Links ─────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Configuration
          </h2>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 divide-y divide-gray-700">

            <Link
              href="/configure-peptides"
              className="flex items-center gap-3 p-4 hover:bg-gray-700/40 transition-colors"
            >
              <div className="w-9 h-9 bg-cyan-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-lg">💉</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium">Configure Peptides</div>
                <div className="text-gray-400 text-xs mt-0.5">Manage your stack & dosing schedules</div>
              </div>
              <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            </Link>

            <Link
              href="/supplements"
              className="flex items-center gap-3 p-4 hover:bg-gray-700/40 transition-colors"
            >
              <div className="w-9 h-9 bg-cyan-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-lg">💊</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium">Manage Supplements</div>
                <div className="text-gray-400 text-xs mt-0.5">Add and track your supplement routine</div>
              </div>
              <ChevronRightIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
            </Link>

          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Danger Zone
          </h2>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="mb-3">
              <div className="text-sm font-medium text-red-300">Delete Account</div>
              <p className="mt-1 text-xs text-gray-400">
                Permanently removes your account and all stored doses, meals, vitals, supplements, food logs, and blood results.
              </p>
            </div>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Confirm with your password"
              className="w-full rounded-xl border border-red-500/20 bg-gray-900 px-4 py-3 text-base text-white placeholder-gray-500 transition-colors focus:border-red-400 focus:outline-none"
            />
            {deleteError && (
              <p className="mt-2 text-xs text-red-300">{deleteError}</p>
            )}
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deletingAccount}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingAccount ? 'Deleting Account...' : 'Delete Account'}
            </button>
          </div>
        </section>

        {/* ── Save button ────────────────────────────────────────────────── */}
        <button
          onClick={handleSave}
          className={`w-full py-4 rounded-2xl font-semibold text-base transition-all duration-200 ${
            saved
              ? 'bg-green-500 text-black'
              : 'bg-cyan-500 hover:bg-cyan-400 text-black'
          }`}
        >
          {saved ? '✓ Settings Saved' : 'Save Settings'}
        </button>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="text-center text-gray-600 text-xs pb-2">
          PeptiFit · trax.delboysden.uk
        </div>

      </main>

      {/* ── Bottom Navigation ──────────────────────────────────────────────── */}
      <BottomNav active="more" />

    </div>
  )
}
