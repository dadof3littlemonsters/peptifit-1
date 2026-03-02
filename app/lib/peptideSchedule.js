const MONDAY_FIRST_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(value) {
  const date = toDate(value)
  if (!date) return null
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function startOfWeek(value) {
  const date = startOfDay(value)
  if (!date) return null
  const result = new Date(date)
  result.setDate(date.getDate() - date.getDay())
  return result
}

export function getMondayBasedDayIndex(value) {
  const date = toDate(value)
  if (!date) return 0
  const day = date.getDay()
  return day === 0 ? 6 : day - 1
}

export function formatPeptideDayList(customDays = []) {
  return customDays
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
    .map((day) => MONDAY_FIRST_DAY_NAMES[day])
    .join(', ')
}

export function formatPeptideFrequencyLabel(config = {}) {
  const frequency = config.frequency || 'daily'
  const customDays = Array.isArray(config.custom_days) ? config.custom_days : []
  const weeklyDay = customDays.length > 0 ? customDays[0] : 0

  switch (frequency) {
    case 'daily':
      return 'Daily'
    case 'bid':
      return 'Twice daily'
    case 'tid':
      return 'Three times daily'
    case 'weekly':
      return `Weekly on ${formatPeptideDayList([weeklyDay])}`
    case 'custom-weekly':
      return customDays.length > 0
        ? `On ${formatPeptideDayList(customDays)}`
        : 'Custom weekly'
    case 'every-x-days':
      return `Every ${config.every_x_days || 'X'} days`
    case 'cycling':
      if (config.cycle_config?.days_on && config.cycle_config?.days_off) {
        return `${config.cycle_config.days_on} on / ${config.cycle_config.days_off} off`
      }
      return 'Cycling'
    case 'as-needed':
      return 'As needed'
    default:
      return frequency
  }
}

export function formatPeptideDoseSummary(config = {}) {
  const doses = Array.isArray(config.doses)
    ? config.doses.filter((dose) => dose?.amount)
    : []

  if (doses.length === 0) return 'Dose not set'

  const primary = doses[0]
  const primaryLabel = `${primary.amount} ${primary.unit || ''}`.trim()

  return doses.length > 1 ? `${primaryLabel} +${doses.length - 1} more` : primaryLabel
}

export function isPrnPeptideConfig(config = {}) {
  return (config.frequency || 'daily') === 'as-needed'
}

function doseMatchesConfig(config = {}, dose = {}) {
  if (!config.peptide_id) return false

  if (config.id && dose.config_id) {
    return dose.config_id === config.id
  }

  return dose.peptide_id === config.peptide_id
}

export function isPeptideTakenOnDate(config = {}, doses = [], value = new Date()) {
  const targetDay = startOfDay(value)
  if (!config.peptide_id || !targetDay) return false

  return doses.some((dose) => {
    if (!doseMatchesConfig(config, dose)) return false
    const doseDay = startOfDay(dose.administration_time)
    return doseDay?.getTime() === targetDay.getTime()
  })
}

function getAnchorDate(config) {
  return startOfDay(config.created_at || config.updated_at || new Date())
}

export function isPeptideScheduledOnDate(config = {}, value = new Date()) {
  const date = startOfDay(value)
  if (!date) return false

  const frequency = config.frequency || 'daily'
  const customDays = Array.isArray(config.custom_days) ? config.custom_days : []
  const weeklyDay = customDays.length > 0 ? customDays[0] : 0
  const mondayDay = getMondayBasedDayIndex(date)

  switch (frequency) {
    case 'daily':
    case 'bid':
    case 'tid':
      return true
    case 'weekly':
      return weeklyDay === mondayDay
    case 'custom-weekly':
      return customDays.includes(mondayDay)
    case 'every-x-days': {
      const intervalDays = Number(config.every_x_days) || 1
      const anchor = getAnchorDate(config)
      const diffDays = Math.floor((date - anchor) / (1000 * 60 * 60 * 24))
      return diffDays >= 0 && diffDays % intervalDays === 0
    }
    case 'cycling': {
      const daysOn = Number(config.cycle_config?.days_on) || 0
      const daysOff = Number(config.cycle_config?.days_off) || 0
      if (!daysOn || !daysOff) return true
      const anchor = getAnchorDate(config)
      const diffDays = Math.max(0, Math.floor((date - anchor) / (1000 * 60 * 60 * 24)))
      const cycleLength = daysOn + daysOff
      return diffDays % cycleLength < daysOn
    }
    case 'as-needed':
      return false
    default:
      return true
  }
}

export function isPeptideConfigDueOnDate(config = {}, doses = [], value = new Date()) {
  if (!isPeptideScheduledOnDate(config, value)) return false
  return !isPeptideTakenOnDate(config, doses, value)
}

export function getPeptideWeeklyStats(config = {}, doses = [], value = new Date()) {
  const weekStart = startOfWeek(value)
  if (!weekStart) return { taken: 0, scheduled: 0, adherence: 0 }

  let scheduled = 0
  let taken = 0

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const currentDay = new Date(weekStart)
    currentDay.setDate(weekStart.getDate() + dayIndex)

    if (isPeptideScheduledOnDate(config, currentDay)) {
      scheduled += 1
      if (isPeptideTakenOnDate(config, doses, currentDay)) {
        taken += 1
      }
    }
  }

  return {
    taken,
    scheduled,
    adherence: scheduled > 0 ? Math.round((taken / scheduled) * 100) : 0
  }
}

export function groupDosesByDate(doses = []) {
  return doses.reduce((groups, dose) => {
    const date = toDate(dose.administration_time)
    if (!date) return groups

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const key = `${year}-${month}-${day}`
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(dose)
    return groups
  }, {})
}
