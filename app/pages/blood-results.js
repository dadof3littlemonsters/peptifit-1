import { useEffect, useMemo, useRef, useState } from 'react';
import { bloodResults } from '../lib/api';
import BottomNav from '../components/BottomNav';
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  BeakerIcon,
  CalendarIcon,
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentArrowUpIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  ShareIcon,
  SparklesIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

const COMMON_MARKERS = [
  { name: 'Total Cholesterol', unit: 'mg/dL', rangeLow: 0, rangeHigh: 200, category: 'Lipid Panel' },
  { name: 'LDL Cholesterol', unit: 'mg/dL', rangeLow: 0, rangeHigh: 100, category: 'Lipid Panel' },
  { name: 'HDL Cholesterol', unit: 'mg/dL', rangeLow: 40, rangeHigh: 60, category: 'Lipid Panel' },
  { name: 'Triglycerides', unit: 'mg/dL', rangeLow: 0, rangeHigh: 150, category: 'Lipid Panel' },
  { name: 'Glucose (Fasting)', unit: 'mg/dL', rangeLow: 70, rangeHigh: 100, category: 'Metabolic' },
  { name: 'HbA1c', unit: '%', rangeLow: 4.0, rangeHigh: 5.7, category: 'Metabolic' },
  { name: 'Total Testosterone', unit: 'ng/dL', rangeLow: 300, rangeHigh: 1000, category: 'Hormones' },
  { name: 'Free Testosterone', unit: 'pg/mL', rangeLow: 5, rangeHigh: 25, category: 'Hormones' },
  { name: 'Estradiol', unit: 'pg/mL', rangeLow: 10, rangeHigh: 40, category: 'Hormones' },
  { name: 'SHBG', unit: 'nmol/L', rangeLow: 10, rangeHigh: 50, category: 'Hormones' },
  { name: 'PSA', unit: 'ng/mL', rangeLow: 0, rangeHigh: 4, category: 'Hormones' },
  { name: 'Cortisol', unit: 'mcg/dL', rangeLow: 6, rangeHigh: 23, category: 'Hormones' },
  { name: 'TSH', unit: 'mIU/L', rangeLow: 0.4, rangeHigh: 4.0, category: 'Thyroid' },
  { name: 'Free T3', unit: 'pg/mL', rangeLow: 2.3, rangeHigh: 4.2, category: 'Thyroid' },
  { name: 'Free T4', unit: 'ng/dL', rangeLow: 0.8, rangeHigh: 1.8, category: 'Thyroid' },
  { name: 'Creatinine', unit: 'mg/dL', rangeLow: 0.7, rangeHigh: 1.3, category: 'Kidney' },
  { name: 'BUN', unit: 'mg/dL', rangeLow: 7, rangeHigh: 20, category: 'Kidney' },
  { name: 'eGFR', unit: 'mL/min', rangeLow: 90, rangeHigh: 120, category: 'Kidney' },
  { name: 'ALT', unit: 'U/L', rangeLow: 0, rangeHigh: 40, category: 'Liver' },
  { name: 'AST', unit: 'U/L', rangeLow: 0, rangeHigh: 40, category: 'Liver' },
  { name: 'GGT', unit: 'U/L', rangeLow: 0, rangeHigh: 55, category: 'Liver' },
  { name: 'Albumin', unit: 'g/dL', rangeLow: 3.5, rangeHigh: 5.0, category: 'Liver' },
  { name: 'WBC', unit: 'K/uL', rangeLow: 4.0, rangeHigh: 11.0, category: 'CBC' },
  { name: 'RBC', unit: 'M/uL', rangeLow: 4.5, rangeHigh: 5.5, category: 'CBC' },
  { name: 'Hemoglobin', unit: 'g/dL', rangeLow: 13.5, rangeHigh: 17.5, category: 'CBC' },
  { name: 'Hematocrit', unit: '%', rangeLow: 38, rangeHigh: 50, category: 'CBC' },
  { name: 'Platelets', unit: 'K/uL', rangeLow: 150, rangeHigh: 450, category: 'CBC' },
  { name: 'Ferritin', unit: 'ng/mL', rangeLow: 20, rangeHigh: 300, category: 'Iron' },
  { name: 'Iron', unit: 'mcg/dL', rangeLow: 60, rangeHigh: 170, category: 'Iron' },
  { name: 'CRP', unit: 'mg/L', rangeLow: 0, rangeHigh: 3, category: 'Inflammation' },
  { name: 'Vitamin D', unit: 'ng/mL', rangeLow: 30, rangeHigh: 100, category: 'Vitamins' },
  { name: 'Vitamin B12', unit: 'pg/mL', rangeLow: 200, rangeHigh: 900, category: 'Vitamins' }
];

const MARKER_CATEGORIES = [
  'Lipid Panel',
  'Metabolic',
  'Hormones',
  'Thyroid',
  'Kidney',
  'Liver',
  'CBC',
  'Iron',
  'Inflammation',
  'Vitamins',
  'Other'
];

const MARKER_ALIASES = {
  totalcholesterol: 'Total Cholesterol',
  cholesterol: 'Total Cholesterol',
  totalcholesterolhdlratio: 'Total Cholesterol/HDL Ratio',
  ldl: 'LDL Cholesterol',
  ldlcholesterol: 'LDL Cholesterol',
  hdl: 'HDL Cholesterol',
  hdlcholesterol: 'HDL Cholesterol',
  hdlhighdensitylipoprotein: 'HDL Cholesterol',
  triglyceride: 'Triglycerides',
  triglycerides: 'Triglycerides',
  hba1c: 'HbA1c',
  hba1cifcc: 'HbA1c',
  testosterone: 'Total Testosterone',
  totaltestosterone: 'Total Testosterone',
  freetestosterone: 'Free Testosterone',
  freetestosteronecalc: 'Free Testosterone',
  calculatedfreetestosterone: 'Free Testosterone',
  estradiol: 'Estradiol',
  oestradiol: 'Estradiol',
  tsh: 'TSH',
  thyroidfunctiontsh: 'TSH',
  freet3: 'Free T3',
  freet4: 'Free T4',
  creatinine: 'Creatinine',
  egfr: 'eGFR',
  egfrcaucasianonly: 'eGFR',
  estimatedglomerularfiltrationrate: 'eGFR',
  alt: 'ALT',
  ast: 'AST',
  ggt: 'GGT',
  alp: 'ALP',
  alkalinephosphatasealp: 'ALP',
  wbc: 'WBC',
  whitebloodcells: 'WBC',
  rbc: 'RBC',
  redbloodcells: 'RBC',
  haemoglobin: 'Hemoglobin',
  hemoglobin: 'Hemoglobin',
  haematocrit: 'Hematocrit',
  hematocrit: 'Hematocrit',
  platelet: 'Platelets',
  platelets: 'Platelets',
  mcv: 'Mean Cell Volume',
  meancellvolume: 'Mean Cell Volume',
  mch: 'Mean Cell Haemoglobin',
  meancellhaemoglobin: 'Mean Cell Haemoglobin',
  mchc: 'MCHC',
  psa: 'PSA',
  psanonsymptomatic: 'PSA',
  prostatespecificantigenpsa: 'PSA',
  ferritin: 'Ferritin',
  fsh: 'FSH',
  folliclestimulatinghormone: 'FSH',
  lh: 'LH',
  luteinisinghormone: 'LH',
  crp: 'CRP',
  shbg: 'SHBG',
  sexhormonebindingglobulinshbg: 'SHBG',
  bilirubin: 'Total Bilirubin',
  totalbilirubin: 'Total Bilirubin',
  vitamind: 'Vitamin D',
  vitaminb12: 'Vitamin B12'
};

const STATUS_COLORS = {
  normal: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-400' },
  optimal: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-400' },
  borderline: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-400' },
  low: { bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-400' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
  calculated: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', dot: 'bg-cyan-400' }
};

const DEFAULT_UPLOAD_META = {
  testName: '',
  testDate: new Date().toISOString().split('T')[0],
  timing: 'Trough',
  notes: ''
};

const DEFAULT_FORM_DATA = {
  testDate: new Date().toISOString().split('T')[0],
  labName: '',
  notes: '',
  markers: []
};

const getMockResults = () => [
  {
    id: 'mock-1',
    test_date: '2026-02-15',
    lab_name: 'LabCorp',
    notes: 'Morning fasted panel',
    markers: [
      { id: 1, name: 'Total Testosterone', value: 850, unit: 'ng/dL', reference_range_low: 300, reference_range_high: 1000, status: 'normal' },
      { id: 2, name: 'Estradiol', value: 42, unit: 'pg/mL', reference_range_low: 10, reference_range_high: 40, status: 'high' },
      { id: 3, name: 'Triglycerides', value: 140, unit: 'mg/dL', reference_range_low: 0, reference_range_high: 150, status: 'borderline' },
      { id: 4, name: 'HDL Cholesterol', value: 55, unit: 'mg/dL', reference_range_low: 40, reference_range_high: 60, status: 'normal' }
    ]
  },
  {
    id: 'mock-2',
    test_date: '2025-12-10',
    lab_name: 'Quest Diagnostics',
    notes: 'Random panel',
    markers: [
      { id: 5, name: 'Total Cholesterol', value: 210, unit: 'mg/dL', reference_range_low: 0, reference_range_high: 200, status: 'high' },
      { id: 6, name: 'LDL Cholesterol', value: 115, unit: 'mg/dL', reference_range_low: 0, reference_range_high: 100, status: 'high' },
      { id: 7, name: 'Glucose (Fasting)', value: 95, unit: 'mg/dL', reference_range_low: 70, reference_range_high: 100, status: 'normal' }
    ]
  }
];

function normalizeMarkerKey(markerName) {
  return String(markerName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function toTitleCaseMarkerName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function getCanonicalMarkerName(markerName) {
  const rawName = String(markerName || '').trim();
  if (!rawName) return '';

  const normalizedKey = normalizeMarkerKey(rawName);
  const aliasMatch = MARKER_ALIASES[normalizedKey];
  if (aliasMatch) return aliasMatch;

  const commonMatch = COMMON_MARKERS.find((marker) => normalizeMarkerKey(marker.name) === normalizedKey);
  if (commonMatch) return commonMatch.name;

  return toTitleCaseMarkerName(rawName);
}

function getMarkerTemplate(markerName) {
  const canonical = getCanonicalMarkerName(markerName);
  return COMMON_MARKERS.find((marker) => marker.name === canonical || normalizeMarkerKey(marker.name) === normalizeMarkerKey(canonical));
}

function buildCanonicalMarkerMap(markers = []) {
  const map = new Map();

  markers.forEach((marker) => {
    const canonicalName = getCanonicalMarkerName(marker.name);
    if (!canonicalName) return;

    const nextMarker = {
      ...marker,
      name: canonicalName
    };

    if (!map.has(canonicalName)) {
      map.set(canonicalName, nextMarker);
      return;
    }

    const existing = map.get(canonicalName);
    const existingCompleteness = Number(existing?.unit ? 1 : 0)
      + Number(existing?.reference_range_low !== null && existing?.reference_range_low !== undefined && existing?.reference_range_low !== '')
      + Number(existing?.reference_range_high !== null && existing?.reference_range_high !== undefined && existing?.reference_range_high !== '');
    const nextCompleteness = Number(nextMarker?.unit ? 1 : 0)
      + Number(nextMarker?.reference_range_low !== null && nextMarker?.reference_range_low !== undefined && nextMarker?.reference_range_low !== '')
      + Number(nextMarker?.reference_range_high !== null && nextMarker?.reference_range_high !== undefined && nextMarker?.reference_range_high !== '');

    if (nextCompleteness > existingCompleteness) {
      map.set(canonicalName, nextMarker);
    }
  });

  return map;
}

function getMarkerStatus(value, rangeLow, rangeHigh) {
  const val = parseFloat(value);
  const low = parseFloat(rangeLow);
  const high = parseFloat(rangeHigh);

  if (Number.isNaN(val)) return 'normal';
  if (Number.isNaN(low) || Number.isNaN(high) || low === high) return 'normal';

  const criticalLow = low * 0.8;
  const criticalHigh = high * 1.2;
  const borderLow = low * 0.9;
  const borderHigh = high * 1.1;

  if (val < criticalLow || val > criticalHigh) return 'critical';
  if (val < low) return val < borderLow ? 'low' : 'borderline';
  if (val > high) return val > borderHigh ? 'high' : 'borderline';

  return 'normal';
}

function countFlaggedMarkers(markers = []) {
  return markers.filter((marker) => marker.status && marker.status !== 'normal').length;
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown date';
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function groupMarkersByCategory(markers = []) {
  return markers.reduce((groups, marker) => {
    const category = getMarkerTemplate(getCanonicalMarkerName(marker.name))?.category || 'Other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(marker);
    return groups;
  }, {});
}

function getMarkerPosition(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return 50;
  }

  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function normalizeAnalysisResponse(payload, selectedResult) {
  if (!payload) return null;

  if (typeof payload === 'string') {
    return {
      summary: payload,
      concerns: [],
      recommendations: ['Review these results with your clinician before changing medication or dosing.']
    };
  }

  if (payload.summary || payload.concerns || payload.recommendations) {
    return payload;
  }

  if (payload.analysis) {
    return {
      summary: payload.analysis,
      concerns: selectedResult?.markers
        ?.filter((marker) => marker.status !== 'normal')
        .slice(0, 3)
        .map((marker) => ({
          marker: marker.name,
          message: `${marker.value} ${marker.unit} sits outside the reference range.`
        })) || [],
      recommendations: ['Track your next panel against these flagged markers.']
    };
  }

  return null;
}

function toMarkerInputValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  return String(value);
}

function normalizeExtractedMarker(marker) {
  const value = toMarkerInputValue(marker?.value);
  const low = toMarkerInputValue(marker?.reference_range_low);
  const high = toMarkerInputValue(marker?.reference_range_high);

  return {
    id: marker?.id || Date.now() + Math.random(),
    name: marker?.name || '',
    value,
    unit: marker?.unit || '',
    reference_range_low: low,
    reference_range_high: high,
    status: marker?.status || getMarkerStatus(value, low, high),
    panel: marker?.panel || ''
  };
}

function formatNumeric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (Math.abs(numeric) >= 100) return numeric.toFixed(1);
  if (Math.abs(numeric) >= 10) return numeric.toFixed(2);
  return numeric.toFixed(digits);
}

function formatDelta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return '0';
  return `${numeric > 0 ? '+' : ''}${formatNumeric(numeric)}`;
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) === Infinity) return '—';
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}%`;
}

function inferMarkerCategory(markerName) {
  return getMarkerTemplate(getCanonicalMarkerName(markerName))?.category || 'Other';
}

function getSeverityScore(marker = {}) {
  const value = Number(marker?.value);
  const low = Number(marker?.reference_range_low);
  const high = Number(marker?.reference_range_high);

  if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high) || low === high) {
    return 0;
  }

  if (value < low) {
    return (low - value) / Math.max(Math.abs(low), 1);
  }

  if (value > high) {
    return (value - high) / Math.max(Math.abs(high), 1);
  }

  return 0;
}

function getHeatmapTone(marker) {
  const status = marker?.status || 'normal';
  const severity = getSeverityScore(marker);

  if (status === 'critical') return 'bg-red-600 text-white';
  if (status === 'high' || status === 'low') return severity > 0.25 ? 'bg-red-500/90 text-white' : 'bg-red-500/60 text-white';
  if (status === 'borderline') return 'bg-yellow-500/70 text-black';
  return severity > 0.15 ? 'bg-emerald-500/60 text-black' : 'bg-emerald-500/30 text-emerald-100';
}

function buildMarkerSeries(results = []) {
  const map = new Map();

  results.forEach((result) => {
    (result.markers || []).forEach((marker) => {
      const key = getCanonicalMarkerName(marker.name);
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, {
          markerName: key,
          category: inferMarkerCategory(key),
          unit: marker.unit || '',
          points: []
        });
      }

      const series = map.get(key);
      if (!series.unit && marker.unit) {
        series.unit = marker.unit;
      }

      series.points.push({
        ...marker,
        name: key,
        test_id: result.id,
        test_date: result.test_date,
        lab_name: result.lab_name || '',
        notes: result.notes || ''
      });
    });
  });

  return Array.from(map.values())
    .map((series) => ({
      ...series,
      points: Array.from(
        [...series.points].reduce((pointMap, point) => {
          const pointKey = String(point.test_id || `${point.test_date}|${point.lab_name || ''}`);
          const existing = pointMap.get(pointKey);

          if (!existing) {
            pointMap.set(pointKey, point);
            return pointMap;
          }

          const existingCompleteness = Number(existing?.unit ? 1 : 0)
            + Number(existing?.reference_range_low !== null && existing?.reference_range_low !== undefined && existing?.reference_range_low !== '')
            + Number(existing?.reference_range_high !== null && existing?.reference_range_high !== undefined && existing?.reference_range_high !== '');
          const nextCompleteness = Number(point?.unit ? 1 : 0)
            + Number(point?.reference_range_low !== null && point?.reference_range_low !== undefined && point?.reference_range_low !== '')
            + Number(point?.reference_range_high !== null && point?.reference_range_high !== undefined && point?.reference_range_high !== '');

          if (nextCompleteness >= existingCompleteness) {
            pointMap.set(pointKey, point);
          }

          return pointMap;
        }, new Map()).values()
      ).sort((left, right) => new Date(left.test_date) - new Date(right.test_date))
    }))
    .sort((left, right) => left.markerName.localeCompare(right.markerName));
}

function getStatusTransitionLabel(leftStatus, rightStatus) {
  const left = leftStatus || 'missing';
  const right = rightStatus || 'missing';

  if (left === right) {
    return left === 'normal' ? 'Stable' : `${left} persists`;
  }

  if (left === 'normal' && right !== 'normal') {
    return `Newly ${right}`;
  }

  if (left !== 'normal' && right === 'normal') {
    return 'Back in range';
  }

  return `${left} -> ${right}`;
}

function buildCompareRows(leftPanel, rightPanel) {
  if (!leftPanel || !rightPanel) return [];

  const leftMap = buildCanonicalMarkerMap(leftPanel.markers || []);
  const rightMap = buildCanonicalMarkerMap(rightPanel.markers || []);
  const markerNames = [...new Set([...leftMap.keys(), ...rightMap.keys()])];

  return markerNames.map((name) => {
    const leftMarker = leftMap.get(name) || null;
    const rightMarker = rightMap.get(name) || null;
    const leftValue = Number(leftMarker?.value);
    const rightValue = Number(rightMarker?.value);
    const delta = Number.isFinite(leftValue) && Number.isFinite(rightValue) ? rightValue - leftValue : null;
    const percentDelta = Number.isFinite(delta) && Number.isFinite(leftValue) && leftValue !== 0
      ? (delta / Math.abs(leftValue)) * 100
      : null;

    return {
      markerName: name,
      category: inferMarkerCategory(name),
      unit: rightMarker?.unit || leftMarker?.unit || '',
      left: leftMarker,
      right: rightMarker,
      delta,
      percentDelta,
      transition: getStatusTransitionLabel(leftMarker?.status, rightMarker?.status),
      changed: Boolean(
        !leftMarker
        || !rightMarker
        || delta !== 0
        || (leftMarker?.status || 'normal') !== (rightMarker?.status || 'normal')
      )
    };
  }).sort((left, right) => {
    const leftMagnitude = Math.abs(left.delta || 0);
    const rightMagnitude = Math.abs(right.delta || 0);
    if (rightMagnitude !== leftMagnitude) return rightMagnitude - leftMagnitude;
    return left.markerName.localeCompare(right.markerName);
  });
}

function buildChangeSummary(compareRows = []) {
  const withDelta = compareRows.filter((row) => Number.isFinite(row.delta));
  return {
    biggestIncreases: [...withDelta].sort((left, right) => (right.delta || 0) - (left.delta || 0)).filter((row) => (row.delta || 0) > 0).slice(0, 6),
    biggestDecreases: [...withDelta].sort((left, right) => (left.delta || 0) - (right.delta || 0)).filter((row) => (row.delta || 0) < 0).slice(0, 6),
    newlyAbnormal: compareRows.filter((row) => row.left?.status === 'normal' && row.right?.status && row.right.status !== 'normal').slice(0, 6),
    backInRange: compareRows.filter((row) => row.left?.status && row.left.status !== 'normal' && row.right?.status === 'normal').slice(0, 6),
    persistentAbnormal: compareRows.filter((row) => row.left?.status && row.left.status !== 'normal' && row.right?.status && row.right.status !== 'normal').slice(0, 6)
  };
}

function buildHeatmapRows(results = [], markerSeries = []) {
  return markerSeries.map((series) => {
    const pointMap = new Map(series.points.map((point) => [point.test_id, point]));
    const cells = results.map((result) => pointMap.get(result.id) || null);

    return {
      markerName: series.markerName,
      category: series.category,
      cells,
      latestSeverity: getSeverityScore(series.points[series.points.length - 1]),
      abnormalCount: cells.filter((cell) => cell?.status && cell.status !== 'normal').length
    };
  });
}

function buildCoachMessages(context) {
  if (!context) return [];

  const { title, summary, promptSuggestions = [] } = context;
  const assistantIntro = [title, summary].filter(Boolean).join('\n\n');

  return [{
    role: 'assistant',
    content: assistantIntro || 'Tell me what you want to understand about these results.'
  }, ...promptSuggestions.slice(0, 3).map((prompt) => ({
    role: 'suggestion',
    content: prompt
  }))];
}

function getMarkerHistorySummary(points = []) {
  return points.slice(-4).map((point) => ({
    date: point.test_date,
    value: point.value,
    unit: point.unit,
    status: point.status,
    low: point.reference_range_low,
    high: point.reference_range_high
  }));
}

function RangeBar({ value, low, high, min, max }) {
  const normalizedMin = Number.isFinite(min) ? min : Math.min(0, Number(low) || 0);
  const normalizedMax = Number.isFinite(max)
    ? max
    : Math.max(Number(high) || 0, Number(value) || 0) * 1.25 || 100;
  const safeLow = Number(low) || normalizedMin;
  const safeHigh = Number(high) || normalizedMax;
  const lowStart = getMarkerPosition(safeLow, normalizedMin, normalizedMax);
  const highStart = getMarkerPosition(safeHigh, normalizedMin, normalizedMax);
  const position = getMarkerPosition(Number(value), normalizedMin, normalizedMax);

  return (
    <div className="relative pt-1">
      <div className="h-2 overflow-hidden rounded-full bg-gray-700">
        <div className="flex h-full">
          <div className="bg-red-500/60" style={{ width: `${lowStart}%` }} />
          <div className="bg-green-500/70" style={{ width: `${Math.max(highStart - lowStart, 4)}%` }} />
          <div className="flex-1 bg-red-500/60" />
        </div>
      </div>
      <div
        className="absolute top-1.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-gray-900 bg-white shadow-lg"
        style={{ left: `${position}%` }}
      />
    </div>
  );
}

function StatusBadge({ status, label }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.normal;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}>
      {label || status}
    </span>
  );
}

function MiniStatCard({ label, value, accent = 'text-white' }) {
  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-center">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}

function TrendChart({ series }) {
  const points = series?.points || [];

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-sm text-gray-400">
        No trend data yet for this marker.
      </div>
    );
  }

  const values = points.map((point) => Number(point.value)).filter(Number.isFinite);
  const lows = points.map((point) => Number(point.reference_range_low)).filter(Number.isFinite);
  const highs = points.map((point) => Number(point.reference_range_high)).filter(Number.isFinite);
  const latestLow = lows.length ? lows[lows.length - 1] : Math.min(...values);
  const latestHigh = highs.length ? highs[highs.length - 1] : Math.max(...values);
  const chartMin = Math.min(...values, ...(lows.length ? lows : values)) * 0.92;
  const chartMax = Math.max(...values, ...(highs.length ? highs : values)) * 1.08;
  const width = 320;
  const height = 180;
  const padX = 18;
  const padY = 18;
  const safeMin = Number.isFinite(chartMin) ? chartMin : 0;
  const safeMax = Number.isFinite(chartMax) && chartMax !== safeMin ? chartMax : safeMin + 1;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const toX = (index) => padX + (points.length === 1 ? innerWidth / 2 : (innerWidth / (points.length - 1)) * index);
  const toY = (value) => padY + innerHeight - ((value - safeMin) / (safeMax - safeMin)) * innerHeight;
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index)} ${toY(Number(point.value))}`).join(' ');
  const bandY = toY(latestHigh);
  const bandHeight = Math.max(8, toY(latestLow) - toY(latestHigh));

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{series.markerName}</h3>
          <p className="text-xs text-gray-400">{series.points.length} tests tracked</p>
        </div>
        <StatusBadge status={series.points[series.points.length - 1]?.status || 'normal'} label="latest" />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
        <rect x={padX} y={bandY} width={innerWidth} height={bandHeight} rx="10" fill="rgba(16,185,129,0.18)" />
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
        <path d={linePath} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          <g key={`${point.test_id}-${point.test_date}`}>
            <circle
              cx={toX(index)}
              cy={toY(Number(point.value))}
              r="4.5"
              fill={point.status && point.status !== 'normal' ? '#f97316' : '#f8fafc'}
              stroke="#111827"
              strokeWidth="2"
            />
            <text x={toX(index)} y={height - 2} textAnchor="middle" fontSize="10" fill="rgba(203,213,225,0.8)">
              {new Date(point.test_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-3 flex justify-between text-[11px] text-gray-400">
        <span>Range {formatNumeric(latestLow)} - {formatNumeric(latestHigh)}</span>
        <span>{series.unit || 'unitless'}</span>
      </div>
    </div>
  );
}

export default function BloodResultsPage() {
  const fileInputRef = useRef(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('list');
  const [selectedResult, setSelectedResult] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [sortField, setSortField] = useState('test_date');
  const [sortDir, setSortDir] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [addMode, setAddMode] = useState('manual');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [processingUpload, setProcessingUpload] = useState(false);
  const [extractedMarkers, setExtractedMarkers] = useState([]);
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploadMeta, setUploadMeta] = useState(DEFAULT_UPLOAD_META);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [compareLeftId, setCompareLeftId] = useState('');
  const [compareRightId, setCompareRightId] = useState('');
  const [compareCategory, setCompareCategory] = useState('All');
  const [compareMode, setCompareMode] = useState('changed');
  const [selectedTrendMarker, setSelectedTrendMarker] = useState('');
  const [trendCategory, setTrendCategory] = useState('All');
  const [trendSearch, setTrendSearch] = useState('');
  const [heatmapCategory, setHeatmapCategory] = useState('All');
  const [heatmapSort, setHeatmapSort] = useState('severity');
  const [heatmapMode, setHeatmapMode] = useState('all');
  const [changesCategory, setChangesCategory] = useState('All');
  const [coachContext, setCoachContext] = useState(null);
  const [coachMessages, setCoachMessages] = useState([]);
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);

  useEffect(() => {
    loadBloodResults();
  }, []);

  const sortedResults = useMemo(() => {
    const clone = [...results];
    clone.sort((a, b) => {
      if (sortField === 'flagged') {
        const diff = countFlaggedMarkers(a.markers) - countFlaggedMarkers(b.markers);
        return sortDir === 'asc' ? diff : -diff;
      }

      const aTime = new Date(a.test_date).getTime();
      const bTime = new Date(b.test_date).getTime();
      return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
    });
    return clone;
  }, [results, sortDir, sortField]);

  const chronologicalResults = useMemo(() => {
    return [...results].sort((left, right) => new Date(left.test_date) - new Date(right.test_date));
  }, [results]);

  const filteredMarkers = useMemo(() => {
    return COMMON_MARKERS.filter((marker) => {
      if (selectedCategory !== 'All' && marker.category !== selectedCategory) return false;
      if (searchQuery && !marker.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [searchQuery, selectedCategory]);

  const markerSeries = useMemo(() => buildMarkerSeries(results), [results]);

  const dynamicCategories = useMemo(() => {
    const categories = new Set(['All']);
    markerSeries.forEach((series) => categories.add(series.category));
    return Array.from(categories);
  }, [markerSeries]);

  const latestResult = sortedResults[0] || null;
  const previousResult = sortedResults[1] || null;

  useEffect(() => {
    if (sortedResults.length === 0) return;

    const ids = new Set(sortedResults.map((result) => String(result.id)));

    if (!compareRightId || !ids.has(String(compareRightId))) {
      setCompareRightId(String(sortedResults[0]?.id || ''));
    }

    if (!compareLeftId || !ids.has(String(compareLeftId))) {
      setCompareLeftId(String(sortedResults[1]?.id || sortedResults[0]?.id || ''));
    }
  }, [sortedResults, compareLeftId, compareRightId]);

  useEffect(() => {
    const availableSeries = markerSeries.filter((series) => {
      if (trendCategory !== 'All' && series.category !== trendCategory) return false;
      if (trendSearch && !series.markerName.toLowerCase().includes(trendSearch.toLowerCase())) return false;
      return true;
    });

    if (availableSeries.length === 0) {
      setSelectedTrendMarker('');
      return;
    }

    if (!availableSeries.some((series) => series.markerName === selectedTrendMarker)) {
      const abnormalFirst = availableSeries.find((series) => series.points.some((point) => point.status && point.status !== 'normal'));
      setSelectedTrendMarker(abnormalFirst?.markerName || availableSeries[0].markerName);
    }
  }, [markerSeries, selectedTrendMarker, trendCategory, trendSearch]);

  const compareLeft = useMemo(
    () => sortedResults.find((result) => String(result.id) === String(compareLeftId)) || null,
    [sortedResults, compareLeftId]
  );
  const compareRight = useMemo(
    () => sortedResults.find((result) => String(result.id) === String(compareRightId)) || null,
    [sortedResults, compareRightId]
  );

  const allCompareRows = useMemo(() => buildCompareRows(compareLeft, compareRight), [compareLeft, compareRight]);

  const compareRows = useMemo(() => {
    return allCompareRows.filter((row) => {
      if (compareCategory !== 'All' && row.category !== compareCategory) return false;
      if (compareMode === 'changed' && !row.changed) return false;
      if (compareMode === 'abnormal' && !((row.left?.status && row.left.status !== 'normal') || (row.right?.status && row.right.status !== 'normal'))) return false;
      return true;
    });
  }, [allCompareRows, compareCategory, compareMode]);

  const changeRows = useMemo(() => {
    return allCompareRows.filter((row) => {
      if (changesCategory !== 'All' && row.category !== changesCategory) return false;
      return true;
    });
  }, [allCompareRows, changesCategory]);

  const changeSummary = useMemo(() => buildChangeSummary(changeRows), [changeRows]);

  const trendSeriesOptions = useMemo(() => {
    return markerSeries.filter((series) => {
      if (trendCategory !== 'All' && series.category !== trendCategory) return false;
      if (trendSearch && !series.markerName.toLowerCase().includes(trendSearch.toLowerCase())) return false;
      return true;
    });
  }, [markerSeries, trendCategory, trendSearch]);

  const selectedSeries = useMemo(
    () => markerSeries.find((series) => series.markerName === selectedTrendMarker) || null,
    [markerSeries, selectedTrendMarker]
  );

  const heatmapRows = useMemo(() => {
    const rows = buildHeatmapRows(chronologicalResults, markerSeries).filter((row) => {
      if (heatmapCategory !== 'All' && row.category !== heatmapCategory) return false;
      if (heatmapMode === 'abnormal' && row.abnormalCount === 0) return false;
      return true;
    });

    rows.sort((left, right) => {
      if (heatmapSort === 'name') {
        return left.markerName.localeCompare(right.markerName);
      }

      if (heatmapSort === 'abnormal') {
        if (right.abnormalCount !== left.abnormalCount) return right.abnormalCount - left.abnormalCount;
        return right.latestSeverity - left.latestSeverity;
      }

      if (right.latestSeverity !== left.latestSeverity) return right.latestSeverity - left.latestSeverity;
      return left.markerName.localeCompare(right.markerName);
    });

    return rows;
  }, [chronologicalResults, markerSeries, heatmapCategory, heatmapMode, heatmapSort]);

  const latestFlaggedMarkers = (latestResult?.markers || []).filter((marker) => marker.status && marker.status !== 'normal');

  function resetFormState() {
    setFormData({
      ...DEFAULT_FORM_DATA,
      markers: [],
      testDate: new Date().toISOString().split('T')[0]
    });
    setUploadMeta({
      ...DEFAULT_UPLOAD_META,
      testDate: new Date().toISOString().split('T')[0]
    });
    setSelectedFile(null);
    setProcessingUpload(false);
    setExtractedMarkers([]);
    setUploadSummary('');
    setSearchQuery('');
    setSelectedCategory('All');
    setAddMode('manual');
  }

  async function loadBloodResults() {
    try {
      setLoading(true);
      const data = await bloodResults.getAll();
      setResults(Array.isArray(data) && data.length > 0 ? data : getMockResults());
      setError('');
    } catch (err) {
      console.error('Error loading blood results:', err);
      setResults(getMockResults());
      setError('Using saved demo data because blood results could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDir('desc');
  }

  function addMarker(template = null) {
    const marker = template
      ? {
          id: Date.now() + Math.random(),
          name: template.name,
          value: '',
          unit: template.unit,
          reference_range_low: template.rangeLow,
          reference_range_high: template.rangeHigh,
          status: 'normal'
        }
      : {
          id: Date.now() + Math.random(),
          name: '',
          value: '',
          unit: '',
          reference_range_low: '',
          reference_range_high: '',
          status: 'normal'
        };

    setFormData((current) => ({ ...current, markers: [...current.markers, marker] }));
  }

  function updateMarker(id, field, value) {
    setFormData((current) => ({
      ...current,
      markers: current.markers.map((marker) => {
        if (marker.id !== id) return marker;
        const nextMarker = { ...marker, [field]: value };
        nextMarker.status = getMarkerStatus(nextMarker.value, nextMarker.reference_range_low, nextMarker.reference_range_high);
        return nextMarker;
      })
    }));
  }

  function removeMarker(id) {
    setFormData((current) => ({
      ...current,
      markers: current.markers.filter((marker) => marker.id !== id)
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (formData.markers.length === 0) {
      setError('Please add at least one marker.');
      return;
    }

    const payload = {
      test_date: formData.testDate,
      lab_name: formData.labName,
      notes: formData.notes,
      markers: formData.markers.map((marker) => ({
        name: marker.name,
        value: parseFloat(marker.value),
        unit: marker.unit,
        reference_range_low: parseFloat(marker.reference_range_low) || null,
        reference_range_high: parseFloat(marker.reference_range_high) || null,
        status: getMarkerStatus(marker.value, marker.reference_range_low, marker.reference_range_high)
      }))
    };

    try {
      await bloodResults.create(payload);
      resetFormState();
      setView('list');
      await loadBloodResults();
    } catch (err) {
      console.error('Error saving blood result:', err);
      const fallbackResult = {
        id: Date.now(),
        test_date: payload.test_date,
        lab_name: payload.lab_name || 'Manual Entry',
        notes: payload.notes,
        markers: payload.markers
      };
      setResults((current) => [fallbackResult, ...current]);
      resetFormState();
      setView('list');
      setError('Saved locally because the API was unavailable.');
    }
  }

  async function handleUploadSave() {
    if (!selectedFile || extractedMarkers.length === 0) {
      setError('Process a PDF or image to generate extracted markers before saving.');
      return;
    }

    const payload = {
      test_date: uploadMeta.testDate,
      lab_name: uploadMeta.testName || selectedFile.name.replace(/\.pdf$/i, ''),
      notes: [uploadMeta.timing, uploadMeta.notes].filter(Boolean).join(' • '),
      markers: extractedMarkers.map((marker) => ({
        name: marker.name,
        value: parseFloat(marker.value),
        unit: marker.unit,
        reference_range_low: parseFloat(marker.reference_range_low) || null,
        reference_range_high: parseFloat(marker.reference_range_high) || null,
        status: marker.status || getMarkerStatus(marker.value, marker.reference_range_low, marker.reference_range_high)
      }))
    };

    try {
      await bloodResults.create(payload);
      resetFormState();
      setView('list');
      await loadBloodResults();
    } catch (err) {
      console.error('Error saving uploaded blood result:', err);
      setResults((current) => [
        {
          id: Date.now(),
          test_date: payload.test_date,
          lab_name: payload.lab_name,
          notes: payload.notes,
          markers: payload.markers
        },
        ...current
      ]);
      resetFormState();
      setView('list');
      setError('Saved the upload preview locally because the API was unavailable.');
    }
  }

  function addExtractedMarker(template = null) {
    const nextMarker = template
      ? {
          name: template.name,
          unit: template.unit,
          reference_range_low: template.rangeLow,
          reference_range_high: template.rangeHigh,
          status: 'normal'
        }
      : null;

    setExtractedMarkers((current) => [...current, normalizeExtractedMarker(nextMarker)]);
  }

  function updateExtractedMarker(id, field, value) {
    setExtractedMarkers((current) =>
      current.map((marker) => {
        if (marker.id !== id) {
          return marker;
        }

        const nextMarker = { ...marker, [field]: value };
        nextMarker.status = getMarkerStatus(nextMarker.value, nextMarker.reference_range_low, nextMarker.reference_range_high);
        return nextMarker;
      })
    );
  }

  function removeExtractedMarker(id) {
    setExtractedMarkers((current) => current.filter((marker) => marker.id !== id));
  }

  async function handleProcessUpload() {
    if (!selectedFile) {
      setError('Select a PDF or image first.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Please choose a file smaller than 10MB.');
      return;
    }

    try {
      setProcessingUpload(true);
      setError('');
      setUploadSummary('');

      const extracted = await bloodResults.extractDocument(selectedFile);
      const markers = Array.isArray(extracted?.markers) ? extracted.markers.map(normalizeExtractedMarker) : [];

      if (markers.length === 0) {
        throw new Error('No markers could be read from this document.');
      }

      setExtractedMarkers(markers);
      setUploadSummary(extracted?.notes || '');
      setUploadMeta((current) => ({
        ...current,
        testName: extracted?.lab_name || current.testName || selectedFile.name.replace(/\.(pdf|png|jpg|jpeg|webp)$/i, ''),
        testDate: extracted?.test_date || current.testDate
      }));
    } catch (err) {
      console.error('Error extracting blood panel:', err);
      setExtractedMarkers([]);
      setUploadSummary('');
      setError(err.response?.data?.error || err.message || 'Failed to process this document.');
    } finally {
      setProcessingUpload(false);
    }
  }

  async function openDetail(result) {
    try {
      const detail = await bloodResults.getById(result.id);
      setSelectedResult(detail);
      setAiAnalysis(normalizeAnalysisResponse(detail.analysis, detail));
    } catch (err) {
      setSelectedResult(result);
      setAiAnalysis(normalizeAnalysisResponse(result.analysis, result));
    }
    setInsightsOpen(true);
    setView('detail');
  }

  async function requestAiAnalysis() {
    if (!selectedResult) return;
    setAnalyzing(true);
    try {
      const response = await bloodResults.analyze(selectedResult.id);
      const analysis = normalizeAnalysisResponse(response, selectedResult);
      setAiAnalysis(
        analysis || {
          summary: 'Most markers are stable, with a few values that should be watched on the next panel.',
          concerns: selectedResult.markers
            ?.filter((marker) => marker.status !== 'normal')
            .map((marker) => ({
              marker: marker.name,
              message: `${marker.value} ${marker.unit} is outside the reference range.`
            })) || [],
          recommendations: ['Review the flagged markers alongside symptoms and recent protocol changes.']
        }
      );
    } catch (err) {
      console.error('Error requesting analysis:', err);
      setAiAnalysis({
        summary: `Based on your ${selectedResult.lab_name || 'recent'} panel, most biomarkers are stable with a few notable deviations.`,
        concerns: selectedResult.markers
          ?.filter((marker) => marker.status !== 'normal')
          .slice(0, 3)
          .map((marker) => ({
            marker: marker.name,
            message: `${marker.value} ${marker.unit} sits outside the stated reference range.`
          })) || [],
        recommendations: [
          'Repeat the flagged markers on your next scheduled panel.',
          'Review any protocol, diet, or recovery changes since the prior test.'
        ]
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDeleteResult(result, options = {}) {
    if (!result?.id) return;

    const label = result.lab_name || 'this blood panel';
    if (!window.confirm(`Delete ${label} from ${formatDate(result.test_date)}? This cannot be undone.`)) {
      return;
    }

    try {
      await bloodResults.delete(result.id);
      setResults((current) => current.filter((item) => item.id !== result.id));
      setError('');

      if (options.closeDetail) {
        setSelectedResult(null);
        setAiAnalysis(null);
        setView('list');
      }
    } catch (err) {
      console.error('Error deleting blood result:', err);
      setError(err.response?.data?.error || 'Failed to delete blood result.');
    }
  }

  function prepareEdit() {
    if (!selectedResult) return;
    setFormData({
      testDate: selectedResult.test_date,
      labName: selectedResult.lab_name || '',
      notes: selectedResult.notes || '',
      markers: (selectedResult.markers || []).map((marker) => ({
        ...marker,
        id: Date.now() + Math.random()
      }))
    });
    setAddMode('manual');
    setView('add');
  }

  async function handleShare() {
    if (!selectedResult) return;

    const text = [
      `${selectedResult.lab_name || 'Blood panel'} • ${formatDate(selectedResult.test_date)}`,
      `${selectedResult.markers?.length || 0} markers`,
      `${countFlaggedMarkers(selectedResult.markers)} flagged`
    ].join('\n');

    try {
      if (navigator.share) {
        await navigator.share({ title: 'PeptiFit Blood Results', text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  }

  function handleFileSelection(file) {
    if (!file) return;
    setSelectedFile(file);
    setUploadMeta((current) => ({
      ...current,
      testName: current.testName || file.name.replace(/\.(pdf|png|jpg|jpeg|webp)$/i, '')
    }));
    setExtractedMarkers([]);
    setUploadSummary('');
    setError('');
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileSelection(file);
  }

  function findPreviousPanel(result) {
    const index = sortedResults.findIndex((item) => String(item.id) === String(result?.id));
    if (index === -1) return null;
    return sortedResults[index + 1] || null;
  }

  function openCompare(left, right) {
    if (!left || !right) return;
    setCompareLeftId(String(left.id));
    setCompareRightId(String(right.id));
    setCompareMode('changed');
    setCompareCategory('All');
    setView('compare');
  }

  function openChanges(left, right) {
    if (!left || !right) return;
    setCompareLeftId(String(left.id));
    setCompareRightId(String(right.id));
    setChangesCategory('All');
    setView('changes');
  }

  function openTrend(markerName) {
    setSelectedTrendMarker(markerName);
    setView('trends');
  }

  function openCoach(context) {
    setCoachContext(context);
    setCoachMessages(buildCoachMessages(context));
    setCoachInput('');
    setView('coach');
  }

  function buildMarkerCoachContext(marker, panel) {
    const canonicalName = getCanonicalMarkerName(marker.name);
    const series = markerSeries.find((item) => item.markerName === canonicalName);
    const relatedMarkers = (panel?.markers || [])
      .filter((item) => inferMarkerCategory(item.name) === inferMarkerCategory(canonicalName) && getCanonicalMarkerName(item.name) !== canonicalName)
      .slice(0, 4)
      .map((item) => ({
        name: getCanonicalMarkerName(item.name),
        value: item.value,
        unit: item.unit,
        status: item.status
      }));

    return {
      title: `${canonicalName} on ${formatDate(panel?.test_date)}`,
      summary: `${marker.value} ${marker.unit} with a reference range of ${marker.reference_range_low ?? '—'} to ${marker.reference_range_high ?? '—'}. Status: ${marker.status || 'normal'}.`,
      promptSuggestions: [
        `Why might ${canonicalName} be ${marker.status || 'out of range'}?`,
        `What changed in the trend for ${canonicalName}?`,
        `What else should I track next time?`
      ],
      payload: {
        type: 'marker',
        marker_name: canonicalName,
        category: inferMarkerCategory(canonicalName),
        current_result: {
          value: marker.value,
          unit: marker.unit,
          status: marker.status,
          reference_range_low: marker.reference_range_low,
          reference_range_high: marker.reference_range_high
        },
        panel: panel ? {
          id: panel.id,
          test_date: panel.test_date,
          lab_name: panel.lab_name,
          notes: panel.notes
        } : null,
        history: getMarkerHistorySummary(series?.points || []),
        related_markers: relatedMarkers
      }
    };
  }

  function buildFlaggedCoachContext(panel) {
    const flagged = (panel?.markers || []).filter((marker) => marker.status && marker.status !== 'normal');

    return {
      title: `${flagged.length} flagged markers on ${formatDate(panel?.test_date)}`,
      summary: flagged.length
        ? flagged.map((marker) => `${marker.name}: ${marker.value} ${marker.unit} (${marker.status})`).join(' • ')
        : 'No flagged markers were found on this panel.',
      promptSuggestions: [
        'Which out-of-range results matter most here?',
        'How do these flagged markers fit together?',
        'What should I retest on the next panel?'
      ],
      payload: {
        type: 'panel',
        panel: panel ? {
          id: panel.id,
          test_date: panel.test_date,
          lab_name: panel.lab_name,
          notes: panel.notes
        } : null,
        flagged_markers: flagged.map((marker) => ({
          name: marker.name,
          value: marker.value,
          unit: marker.unit,
          status: marker.status,
          reference_range_low: marker.reference_range_low,
          reference_range_high: marker.reference_range_high
        }))
      }
    };
  }

  function buildCompareCoachContext(row) {
    return {
      title: `${row.markerName} changed ${row.transition.toLowerCase()}`,
      summary: `${formatDate(compareLeft?.test_date)}: ${row.left ? `${row.left.value} ${row.unit}` : 'missing'} • ${formatDate(compareRight?.test_date)}: ${row.right ? `${row.right.value} ${row.unit}` : 'missing'} • Delta ${formatDelta(row.delta)} (${formatPercent(row.percentDelta)}).`,
      promptSuggestions: [
        `What could explain the change in ${row.markerName}?`,
        `Is this shift meaningful or just noise?`,
        `Which related markers should I look at with ${row.markerName}?`
      ],
      payload: {
        type: 'compare',
        marker_name: row.markerName,
        category: row.category,
        left_panel: compareLeft ? { id: compareLeft.id, test_date: compareLeft.test_date, lab_name: compareLeft.lab_name } : null,
        right_panel: compareRight ? { id: compareRight.id, test_date: compareRight.test_date, lab_name: compareRight.lab_name } : null,
        left_result: row.left,
        right_result: row.right,
        delta: row.delta,
        percent_delta: row.percentDelta,
        transition: row.transition
      }
    };
  }

  async function sendCoachMessage(prefill) {
    const nextInput = String(prefill || coachInput).trim();
    if (!nextInput || !coachContext) return;

    const nextMessages = [
      ...coachMessages.filter((message) => message.role === 'assistant' || message.role === 'user'),
      { role: 'user', content: nextInput }
    ];

    setCoachMessages((current) => [...current, { role: 'user', content: nextInput }]);
    setCoachInput('');
    setCoachLoading(true);

    try {
      const response = await bloodResults.coach({
        context: coachContext.payload,
        messages: nextMessages.slice(-8)
      });

      const additions = [];
      if (response?.reply) {
        additions.push({ role: 'assistant', content: response.reply });
      }
      if (Array.isArray(response?.follow_ups)) {
        response.follow_ups.slice(0, 3).forEach((prompt) => {
          if (prompt) additions.push({ role: 'suggestion', content: prompt });
        });
      }

      setCoachMessages((current) => [...current, ...additions]);
    } catch (err) {
      console.error('Coach request failed:', err);
      setCoachMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: err.response?.data?.error || 'The AI coach could not respond just now. Try asking a narrower question about one marker.'
        }
      ]);
    } finally {
      setCoachLoading(false);
    }
  }

  function renderSectionRows(title, rows, emptyLabel) {
    return (
      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-white">{title}</h3>
          <span className="text-xs text-gray-500">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400">{emptyLabel}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={`${title}-${row.markerName}`} className="rounded-2xl border border-gray-700 bg-gray-900/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{row.markerName}</p>
                      {row.right?.status && <StatusBadge status={row.right.status} />}
                    </div>
                    <p className="mt-1 text-sm text-gray-400">
                      {row.left ? `${formatNumeric(row.left.value)} ${row.unit}` : '—'} {'->'} {row.right ? `${formatNumeric(row.right.value)} ${row.unit}` : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${(row.delta || 0) >= 0 ? 'text-cyan-300' : 'text-amber-300'}`}>
                      {formatDelta(row.delta)}
                    </p>
                    <p className="text-xs text-gray-500">{formatPercent(row.percentDelta)}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => openTrend(row.markerName)}
                    className="rounded-xl bg-gray-800 px-3 py-2 text-xs text-gray-300"
                  >
                    View trend
                  </button>
                  <button
                    onClick={() => openCoach(buildCompareCoachContext(row))}
                    className="rounded-xl bg-cyan-500/15 px-3 py-2 text-xs text-cyan-300"
                  >
                    Ask AI
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const headerTitle = {
    list: 'Blood Results',
    add: 'Add Blood Panel',
    detail: 'Test Details',
    compare: 'Compare',
    trends: 'Trends',
    heatmap: 'Heatmap',
    changes: 'What Changed',
    coach: 'AI Coach'
  }[view];

  const headerSubtitle = {
    list: `${results.length} panels recorded`,
    add: 'Manual entry or report upload',
    detail: selectedResult ? formatDate(selectedResult.test_date) : 'Review biomarker detail',
    compare: compareLeft && compareRight ? `${formatDate(compareLeft.test_date)} vs ${formatDate(compareRight.test_date)}` : 'Pick two tests',
    trends: selectedSeries ? selectedSeries.markerName : 'Marker history',
    heatmap: `${chronologicalResults.length} tests across time`,
    changes: compareLeft && compareRight ? `${formatDate(compareLeft.test_date)} to ${formatDate(compareRight.test_date)}` : 'Change summary',
    coach: coachContext?.title || 'Out-of-range result coaching'
  }[view];

  if (loading && results.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-500" />
          <p className="mt-4 text-sm text-gray-400">Loading blood results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-900 text-white">
      <header className="h-14 flex-shrink-0 border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-full w-full max-w-lg items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {view !== 'list' && (
              <button
                onClick={() => {
                  setView('list');
                  setSelectedResult(null);
                  setAiAnalysis(null);
                  setInsightsOpen(true);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:text-white"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
            )}
            <div>
              <h1 className="text-xl font-semibold">{headerTitle}</h1>
              <p className="text-xs text-gray-400">{headerSubtitle}</p>
            </div>
          </div>
          {view === 'list' && (
            <button
              onClick={() => {
                resetFormState();
                setView('add');
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500 text-black transition-colors hover:bg-cyan-400"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      <main className="page-content mx-auto flex-1 min-h-0 overflow-y-auto w-full max-w-lg px-4 py-4 pb-[calc(104px+env(safe-area-inset-bottom))]">
        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {view === 'list' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <MiniStatCard label="Panels" value={results.length} />
              <MiniStatCard label="Last Markers" value={latestResult?.markers?.length || 0} accent="text-cyan-400" />
              <MiniStatCard label="Flagged" value={countFlaggedMarkers(latestResult?.markers || [])} accent="text-orange-400" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => previousResult && latestResult && openCompare(previousResult, latestResult)}
                disabled={!previousResult}
                className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-left disabled:opacity-40"
              >
                <p className="text-sm font-semibold text-white">Compare</p>
                <p className="mt-1 text-xs text-gray-400">Latest vs previous panel</p>
              </button>
              <button
                onClick={() => setView('trends')}
                disabled={!markerSeries.length}
                className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-left disabled:opacity-40"
              >
                <p className="text-sm font-semibold text-white">Trends</p>
                <p className="mt-1 text-xs text-gray-400">Reference range charting</p>
              </button>
              <button
                onClick={() => setView('heatmap')}
                disabled={!results.length}
                className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-left disabled:opacity-40"
              >
                <p className="text-sm font-semibold text-white">Heatmap</p>
                <p className="mt-1 text-xs text-gray-400">Scan markers across all tests</p>
              </button>
              <button
                onClick={() => previousResult && latestResult && openChanges(previousResult, latestResult)}
                disabled={!previousResult}
                className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-left disabled:opacity-40"
              >
                <p className="text-sm font-semibold text-white">What Changed</p>
                <p className="mt-1 text-xs text-gray-400">Rank biggest movements fast</p>
              </button>
            </div>

            {latestFlaggedMarkers.length > 0 && (
              <button
                onClick={() => latestResult && openCoach(buildFlaggedCoachContext(latestResult))}
                className="w-full rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-cyan-300" />
                  <p className="font-semibold text-white">Ask AI Coach about flagged markers</p>
                </div>
                <p className="mt-1 text-sm text-gray-300">
                  {latestFlaggedMarkers.slice(0, 3).map((marker) => marker.name).join(', ')}
                  {latestFlaggedMarkers.length > 3 ? ` +${latestFlaggedMarkers.length - 3} more` : ''}
                </p>
              </button>
            )}

            <div className="flex items-center gap-3 overflow-x-auto pb-1 text-sm">
              <button onClick={() => toggleSort('test_date')} className="rounded-full bg-gray-800 px-3 py-2 text-gray-300">
                Date {sortField === 'test_date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button onClick={() => toggleSort('flagged')} className="rounded-full bg-gray-800 px-3 py-2 text-gray-300">
                Status {sortField === 'flagged' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
            </div>

            {sortedResults.length === 0 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-800/60 px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10">
                  <BeakerIcon className="h-7 w-7 text-cyan-400" />
                </div>
                <h2 className="text-lg font-semibold">No blood panels yet</h2>
                <p className="mt-1 text-sm text-gray-400">Log a panel manually or upload a PDF to start tracking.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedResults.map((result) => {
                  const flaggedCount = countFlaggedMarkers(result.markers || []);
                  const previousPanelForCard = findPreviousPanel(result);

                  return (
                    <div
                      key={result.id}
                      className="w-full rounded-2xl border border-gray-700 bg-gray-800 p-4 text-left transition-colors hover:border-gray-600"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <button onClick={() => openDetail(result)} className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-gray-500" />
                            <p className="font-semibold text-white">{formatDate(result.test_date)}</p>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-sm text-gray-400">
                            <BuildingOfficeIcon className="h-4 w-4" />
                            <span>{result.lab_name || 'Blood Panel'}</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteResult(result)}
                            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                            aria-label={`Delete ${result.lab_name || 'blood panel'}`}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => openDetail(result)} className="rounded-lg p-1 text-gray-500">
                            <ChevronRightIcon className="mt-1 h-5 w-5 text-gray-500" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-gray-300">
                          <BeakerIcon className="h-4 w-4 text-cyan-400" />
                          {result.markers?.length || 0} markers
                        </div>
                        {flaggedCount > 0 ? (
                          <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-semibold text-red-400">
                            {flaggedCount} out of range
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-semibold text-green-400">
                            All normal
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {previousPanelForCard && (
                          <>
                            <button
                              onClick={() => openCompare(previousPanelForCard, result)}
                              className="rounded-xl bg-gray-900 px-3 py-2 text-xs text-gray-300"
                            >
                              Compare
                            </button>
                            <button
                              onClick={() => openChanges(previousPanelForCard, result)}
                              className="rounded-xl bg-gray-900 px-3 py-2 text-xs text-gray-300"
                            >
                              What changed
                            </button>
                          </>
                        )}
                        {flaggedCount > 0 && (
                          <button
                            onClick={() => openCoach(buildFlaggedCoachContext(result))}
                            className="rounded-xl bg-cyan-500/15 px-3 py-2 text-xs text-cyan-300"
                          >
                            Ask AI
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'add' && (
          <div className="space-y-5">
            <div className="flex rounded-xl bg-gray-800 p-1">
              <button
                onClick={() => setAddMode('manual')}
                className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${addMode === 'manual' ? 'bg-cyan-500 text-black' : 'text-gray-400'}`}
              >
                Manual Entry
              </button>
              <button
                onClick={() => setAddMode('upload')}
                className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${addMode === 'upload' ? 'bg-cyan-500 text-black' : 'text-gray-400'}`}
              >
                Upload Report
              </button>
            </div>

            {addMode === 'manual' ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                  <h3 className="mb-4 text-sm font-medium text-cyan-400">Test Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm text-gray-400">Test Date</label>
                      <input
                        type="date"
                        value={formData.testDate}
                        onChange={(event) => setFormData((current) => ({ ...current, testDate: event.target.value }))}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none transition-colors focus:border-cyan-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-gray-400">Lab Name</label>
                      <input
                        type="text"
                        value={formData.labName}
                        onChange={(event) => setFormData((current) => ({ ...current, labName: event.target.value }))}
                        placeholder="LabCorp, Quest Diagnostics..."
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none transition-colors focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-gray-400">Notes</label>
                      <textarea
                        value={formData.notes}
                        onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))}
                        placeholder="Protocol changes, fasting state, symptoms..."
                        className="h-24 w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none transition-colors focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                  <h3 className="mb-4 text-sm font-medium text-cyan-400">Quick Add Markers</h3>

                  <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('All')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${selectedCategory === 'All' ? 'bg-cyan-500 text-black' : 'bg-gray-700 text-gray-300'}`}
                    >
                      All
                    </button>
                    {MARKER_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedCategory(category)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${selectedCategory === category ? 'bg-cyan-500 text-black' : 'bg-gray-700 text-gray-300'}`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>

                  <div className="relative mb-4">
                    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search markers..."
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 py-3 pl-10 pr-4 text-white outline-none transition-colors focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto">
                    {filteredMarkers.map((marker) => (
                      <button
                        key={marker.name}
                        type="button"
                        onClick={() => addMarker(marker)}
                        className="rounded-xl border border-gray-700 bg-gray-900 p-3 text-left transition-colors hover:bg-gray-700"
                      >
                        <div className="truncate text-sm font-medium text-white">{marker.name}</div>
                        <div className="text-xs text-gray-400">{marker.category}</div>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addMarker()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-600 bg-gray-700/60 p-3 text-sm text-gray-300 transition-colors hover:bg-gray-700"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Custom Marker
                  </button>
                </div>

                {formData.markers.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-white">Markers ({formData.markers.length})</h3>
                    {formData.markers.map((marker) => (
                      <div key={marker.id} className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                        <div className="mb-3 grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs text-gray-400">Name</label>
                            <input
                              type="text"
                              value={marker.name}
                              onChange={(event) => updateMarker(marker.id, 'name', event.target.value)}
                              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white outline-none focus:border-cyan-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-gray-400">Value</label>
                            <input
                              type="number"
                              step="0.01"
                              value={marker.value}
                              onChange={(event) => updateMarker(marker.id, 'value', event.target.value)}
                              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white outline-none focus:border-cyan-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-gray-400">Unit</label>
                            <input
                              type="text"
                              value={marker.unit}
                              onChange={(event) => updateMarker(marker.id, 'unit', event.target.value)}
                              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white outline-none focus:border-cyan-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-gray-400">Range Low</label>
                            <input
                              type="number"
                              step="0.01"
                              value={marker.reference_range_low}
                              onChange={(event) => updateMarker(marker.id, 'reference_range_low', event.target.value)}
                              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white outline-none focus:border-cyan-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-gray-400">Range High</label>
                            <input
                              type="number"
                              step="0.01"
                              value={marker.reference_range_high}
                              onChange={(event) => updateMarker(marker.id, 'reference_range_high', event.target.value)}
                              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-3 text-white outline-none focus:border-cyan-500"
                            />
                          </div>
                          <div className="flex items-end justify-between gap-2">
                            <StatusBadge status={marker.status || 'normal'} />
                            <button
                              type="button"
                              onClick={() => removeMarker(marker.id)}
                              className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 py-4 font-semibold text-black">
                  Save Blood Panel
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div
                  className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${isDragging ? 'border-cyan-500 bg-cyan-500/10' : 'border-gray-600 bg-gray-800/50'}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <DocumentArrowUpIcon className="mx-auto mb-3 h-12 w-12 text-gray-500" />
                  <p className="mb-1 font-medium text-white">{selectedFile ? selectedFile.name : 'Tap to select PDF or image'}</p>
                  <p className="text-sm text-gray-500">or drag and drop • PDF, JPG, PNG • Max 10MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf,image/*"
                    className="hidden"
                    onChange={(event) => handleFileSelection(event.target.files?.[0])}
                  />
                </div>

                <button
                  onClick={handleProcessUpload}
                  disabled={!selectedFile || processingUpload}
                  className="w-full rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-4 font-semibold text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingUpload ? 'Processing document...' : extractedMarkers.length > 0 ? 'Reprocess Document' : 'Process Document'}
                </button>

                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                  <h3 className="mb-4 font-semibold text-white">Test Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm text-gray-400">Test Name</label>
                      <input
                        type="text"
                        value={uploadMeta.testName}
                        onChange={(event) => setUploadMeta((current) => ({ ...current, testName: event.target.value }))}
                        className="w-full rounded-xl border border-gray-600 bg-gray-700 px-4 py-3 text-white outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-400">Test Date</label>
                      <input
                        type="date"
                        value={uploadMeta.testDate}
                        onChange={(event) => setUploadMeta((current) => ({ ...current, testDate: event.target.value }))}
                        className="w-full rounded-xl border border-gray-600 bg-gray-700 px-4 py-3 text-white outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-sm text-gray-400">Timing</label>
                    <select
                      value={uploadMeta.timing}
                      onChange={(event) => setUploadMeta((current) => ({ ...current, timing: event.target.value }))}
                      className="w-full rounded-xl border border-gray-600 bg-gray-700 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    >
                      <option>Trough</option>
                      <option>Random</option>
                      <option>Fasting</option>
                      <option>Post-meal</option>
                    </select>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-sm text-gray-400">Notes</label>
                    <textarea
                      value={uploadMeta.notes}
                      onChange={(event) => setUploadMeta((current) => ({ ...current, notes: event.target.value }))}
                      className="h-20 w-full resize-none rounded-xl border border-gray-600 bg-gray-700 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {uploadSummary && (
                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <h3 className="mb-2 font-semibold text-white">Extraction Notes</h3>
                    <p className="text-sm text-gray-300">{uploadSummary}</p>
                  </div>
                )}

                {extractedMarkers.length > 0 && (
                  <div className="rounded-2xl border border-cyan-500/30 bg-gray-800 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-white">Extracted Biomarkers ({extractedMarkers.length})</h3>
                      <button
                        onClick={() => addExtractedMarker()}
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-300"
                      >
                        Add Marker
                      </button>
                    </div>
                    <div className="space-y-3">
                      {extractedMarkers.map((marker) => (
                        <div key={marker.id} className="rounded-xl bg-gray-700/60 p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <StatusBadge status={marker.status} />
                            <button
                              onClick={() => removeExtractedMarker(marker.id)}
                              className="text-xs text-gray-400 hover:text-red-400"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={marker.name}
                              onChange={(event) => updateExtractedMarker(marker.id, 'name', event.target.value)}
                              placeholder="Marker name"
                              className="col-span-2 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-cyan-500"
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              value={marker.value}
                              onChange={(event) => updateExtractedMarker(marker.id, 'value', event.target.value)}
                              placeholder="Value"
                              className="rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-cyan-500"
                            />
                            <input
                              type="text"
                              value={marker.unit}
                              onChange={(event) => updateExtractedMarker(marker.id, 'unit', event.target.value)}
                              placeholder="Unit"
                              className="rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-cyan-500"
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              value={marker.reference_range_low}
                              onChange={(event) => updateExtractedMarker(marker.id, 'reference_range_low', event.target.value)}
                              placeholder="Ref low"
                              className="rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-cyan-500"
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              value={marker.reference_range_high}
                              onChange={(event) => updateExtractedMarker(marker.id, 'reference_range_high', event.target.value)}
                              placeholder="Ref high"
                              className="rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-white outline-none focus:border-cyan-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleUploadSave}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 py-4 font-semibold text-black"
                >
                  Save Blood Panel
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'detail' && selectedResult && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-xl bg-cyan-500/20 p-2">
                      <BeakerIcon className="h-5 w-5 text-cyan-400" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-white">{selectedResult.lab_name || 'Blood Panel'}</h2>
                      <p className="text-sm text-gray-400">{formatDate(selectedResult.test_date)}</p>
                    </div>
                  </div>
                  {selectedResult.notes && (
                    <p className="mt-3 text-sm leading-relaxed text-gray-300">{selectedResult.notes}</p>
                  )}
                </div>
                <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-300">
                  {selectedResult.markers?.length || 0} markers
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {findPreviousPanel(selectedResult) && (
                <>
                  <button
                    onClick={() => openCompare(findPreviousPanel(selectedResult), selectedResult)}
                    className="flex items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-300"
                  >
                    Compare
                  </button>
                  <button
                    onClick={() => openChanges(findPreviousPanel(selectedResult), selectedResult)}
                    className="flex items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-300"
                  >
                    What changed
                  </button>
                </>
              )}
              <button
                onClick={requestAiAnalysis}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-black"
              >
                <SparklesIcon className="h-4 w-4" />
                {analyzing ? 'Analyzing...' : aiAnalysis ? 'Regenerate' : 'AI Insights'}
              </button>
              {countFlaggedMarkers(selectedResult.markers || []) > 0 && (
                <button
                  onClick={() => openCoach(buildFlaggedCoachContext(selectedResult))}
                  className="flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-4 py-2.5 text-sm text-cyan-300"
                >
                  <SparklesIcon className="h-4 w-4" />
                  Ask AI
                </button>
              )}
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-300"
              >
                <ShareIcon className="h-4 w-4" />
                Share
              </button>
              <button
                onClick={prepareEdit}
                className="flex items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-300"
              >
                <PencilIcon className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={() => handleDeleteResult(selectedResult, { closeDetail: true })}
                className="flex items-center gap-1.5 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm text-red-300"
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </button>
              <button className="flex items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-300">
                <ArrowUpTrayIcon className="h-4 w-4" />
                Export
              </button>
            </div>

            {aiAnalysis && (
              <div className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-gray-800">
                <button
                  onClick={() => setInsightsOpen((current) => !current)}
                  className="flex w-full items-center justify-between px-4 py-4"
                >
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="h-5 w-5 text-cyan-400" />
                    <span className="font-semibold text-white">AI Insights</span>
                  </div>
                  <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform ${insightsOpen ? 'rotate-180' : ''}`} />
                </button>
                {insightsOpen && (
                  <div className="space-y-4 px-4 pb-4">
                    <p className="text-sm leading-relaxed text-gray-300">{aiAnalysis.summary}</p>

                    {aiAnalysis.concerns?.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-white">Concerns</p>
                        <div className="space-y-2">
                          {aiAnalysis.concerns.map((concern, index) => (
                            <div key={`${concern.marker}-${index}`} className="flex items-start gap-2">
                              <span className="mt-0.5 text-orange-400">•</span>
                              <p className="text-sm text-gray-300">
                                <span className="font-medium text-cyan-400">{concern.marker}</span>
                                {' - '}
                                {concern.message}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiAnalysis.recommendations?.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-white">Recommendations</p>
                        <div className="space-y-2">
                          {aiAnalysis.recommendations.map((item, index) => (
                            <div key={`${item}-${index}`} className="rounded-xl bg-gray-700/50 p-3 text-sm text-gray-200">
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              {Object.entries(groupMarkersByCategory(selectedResult.markers || [])).map(([category, markers]) => (
                <div key={category} className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-semibold text-white">{category}</h3>
                    <span className="text-xs text-gray-500">{markers.length} tracked</span>
                  </div>

                  {markers.map((marker) => (
                    <div key={`${category}-${marker.name}`} className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{marker.name}</span>
                          <StatusBadge status={marker.status || 'normal'} />
                          {marker.calculated && <StatusBadge status="calculated" label="calc" />}
                        </div>
                        <button className="text-gray-500 transition-colors hover:text-gray-300">
                          <InformationCircleIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mb-3 flex items-baseline justify-between gap-3">
                        <p className="text-2xl font-bold text-white">
                          {marker.value} <span className="text-sm font-normal text-gray-400">{marker.unit}</span>
                        </p>
                        <span className="text-xs text-gray-500">
                          Ref {marker.reference_range_low} - {marker.reference_range_high}
                        </span>
                      </div>

                      <RangeBar
                        value={Number(marker.value)}
                        low={Number(marker.reference_range_low)}
                        high={Number(marker.reference_range_high)}
                        min={0}
                        max={Math.max(Number(marker.reference_range_high) * 1.5 || 0, Number(marker.value) * 1.2 || 0, 100)}
                      />

                      <div className="mt-2 flex justify-between text-[10px] text-gray-500">
                        <span>0</span>
                        <span>{marker.reference_range_low ?? '-'}</span>
                        <span>Optimal</span>
                        <span>{marker.reference_range_high ?? '-'}</span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => openTrend(marker.name)}
                          className="rounded-xl bg-gray-900 px-3 py-2 text-xs text-gray-300"
                        >
                          View trend
                        </button>
                        {marker.status && marker.status !== 'normal' && (
                          <button
                            onClick={() => openCoach(buildMarkerCoachContext(marker, selectedResult))}
                            className="rounded-xl bg-cyan-500/15 px-3 py-2 text-xs text-cyan-300"
                          >
                            Ask AI
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-800/70 p-4">
              <h4 className="mb-3 text-sm font-medium text-gray-300">Status Legend</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                  Normal / Optimal
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  Borderline
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <div className="h-3 w-3 rounded-full bg-orange-400" />
                  High / Low
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  Critical
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'compare' && (
          <div className="space-y-4">
            {sortedResults.length < 2 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6 text-center text-sm text-gray-400">
                Add at least two panels to compare results.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Older panel</label>
                      <select
                        value={compareLeftId}
                        onChange={(event) => setCompareLeftId(event.target.value)}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                      >
                        {sortedResults.map((result) => (
                          <option key={`left-${result.id}`} value={result.id}>
                            {formatDate(result.test_date)} · {result.lab_name || 'Blood Panel'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Newer panel</label>
                      <select
                        value={compareRightId}
                        onChange={(event) => setCompareRightId(event.target.value)}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                      >
                        {sortedResults.map((result) => (
                          <option key={`right-${result.id}`} value={result.id}>
                            {formatDate(result.test_date)} · {result.lab_name || 'Blood Panel'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <select
                      value={compareCategory}
                      onChange={(event) => setCompareCategory(event.target.value)}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    >
                      {dynamicCategories.map((category) => (
                        <option key={`compare-category-${category}`} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <select
                      value={compareMode}
                      onChange={(event) => setCompareMode(event.target.value)}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    >
                      <option value="changed">Changed only</option>
                      <option value="abnormal">Out of range only</option>
                      <option value="all">All markers</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <MiniStatCard label="Rows" value={compareRows.length} />
                  <MiniStatCard label="Newly abnormal" value={changeSummary.newlyAbnormal.length} accent="text-orange-400" />
                  <MiniStatCard label="Back in range" value={changeSummary.backInRange.length} accent="text-green-400" />
                </div>

                <div className="space-y-3">
                  {compareRows.map((row) => (
                    <div key={`compare-${row.markerName}`} className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white">{row.markerName}</p>
                            <StatusBadge status={row.right?.status || row.left?.status || 'normal'} />
                          </div>
                          <p className="mt-1 text-xs text-gray-400">{row.category} · {row.transition}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${(row.delta || 0) >= 0 ? 'text-cyan-300' : 'text-amber-300'}`}>
                            {formatDelta(row.delta)}
                          </p>
                          <p className="text-xs text-gray-500">{formatPercent(row.percentDelta)}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-gray-900/70 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500">{compareLeft ? formatDate(compareLeft.test_date) : 'Older'}</p>
                          <p className="mt-1 text-lg font-semibold text-white">{row.left ? formatNumeric(row.left.value) : '—'}</p>
                          <p className="text-xs text-gray-400">{row.unit || 'unitless'}</p>
                        </div>
                        <div className="rounded-xl bg-gray-900/70 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500">{compareRight ? formatDate(compareRight.test_date) : 'Newer'}</p>
                          <p className="mt-1 text-lg font-semibold text-white">{row.right ? formatNumeric(row.right.value) : '—'}</p>
                          <p className="text-xs text-gray-400">{row.unit || 'unitless'}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => openTrend(row.markerName)}
                          className="rounded-xl bg-gray-900 px-3 py-2 text-xs text-gray-300"
                        >
                          View trend
                        </button>
                        <button
                          onClick={() => openCoach(buildCompareCoachContext(row))}
                          className="rounded-xl bg-cyan-500/15 px-3 py-2 text-xs text-cyan-300"
                        >
                          Ask AI
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {view === 'changes' && (
          <div className="space-y-4">
            {sortedResults.length < 2 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6 text-center text-sm text-gray-400">
                Add at least two panels to see what changed.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStatCard label="Changed" value={changeRows.filter((row) => row.changed).length} accent="text-cyan-400" />
                    <MiniStatCard label="Persistent abnormal" value={changeSummary.persistentAbnormal.length} accent="text-orange-400" />
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-gray-400">Category</label>
                    <select
                      value={changesCategory}
                      onChange={(event) => setChangesCategory(event.target.value)}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    >
                      {dynamicCategories.map((category) => (
                        <option key={`changes-category-${category}`} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {renderSectionRows('Biggest increases', changeSummary.biggestIncreases, 'No increases in this comparison.')}
                {renderSectionRows('Biggest decreases', changeSummary.biggestDecreases, 'No decreases in this comparison.')}
                {renderSectionRows('Newly abnormal', changeSummary.newlyAbnormal, 'Nothing new moved out of range.')}
                {renderSectionRows('Back in range', changeSummary.backInRange, 'Nothing came back into range.')}
                {renderSectionRows('Persistent abnormal', changeSummary.persistentAbnormal, 'No markers stayed abnormal across both panels.')}
              </>
            )}
          </div>
        )}

        {view === 'trends' && (
          <div className="space-y-4">
            {markerSeries.length === 0 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-6 text-center text-sm text-gray-400">
                Save a few blood panels first to see trends.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                  <div className="relative">
                    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={trendSearch}
                      onChange={(event) => setTrendSearch(event.target.value)}
                      placeholder="Search marker trends..."
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 py-3 pl-10 pr-4 text-white outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <select
                      value={trendCategory}
                      onChange={(event) => setTrendCategory(event.target.value)}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    >
                      {dynamicCategories.map((category) => (
                        <option key={`trend-category-${category}`} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedTrendMarker}
                      onChange={(event) => setSelectedTrendMarker(event.target.value)}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                    >
                      {trendSeriesOptions.map((series) => (
                        <option key={`trend-marker-${series.markerName}`} value={series.markerName}>
                          {series.markerName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedSeries && (
                  <>
                    <TrendChart series={selectedSeries} />
                    <div className="grid grid-cols-2 gap-3">
                      <MiniStatCard label="Latest" value={formatNumeric(selectedSeries.points[selectedSeries.points.length - 1]?.value)} accent="text-cyan-400" />
                      <MiniStatCard label="Average" value={formatNumeric(selectedSeries.points.reduce((sum, point) => sum + Number(point.value || 0), 0) / Math.max(selectedSeries.points.length, 1))} />
                      <MiniStatCard label="Highest" value={formatNumeric(Math.max(...selectedSeries.points.map((point) => Number(point.value)).filter(Number.isFinite)))} accent="text-orange-400" />
                      <MiniStatCard label="Lowest" value={formatNumeric(Math.min(...selectedSeries.points.map((point) => Number(point.value)).filter(Number.isFinite)))} accent="text-green-400" />
                    </div>

                    <button
                      onClick={() => openCoach(buildMarkerCoachContext(selectedSeries.points[selectedSeries.points.length - 1], {
                        id: selectedSeries.points[selectedSeries.points.length - 1]?.test_id,
                        test_date: selectedSeries.points[selectedSeries.points.length - 1]?.test_date,
                        lab_name: selectedSeries.points[selectedSeries.points.length - 1]?.lab_name,
                        notes: selectedSeries.points[selectedSeries.points.length - 1]?.notes,
                        markers: []
                      }))}
                      className="w-full rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <SparklesIcon className="h-5 w-5 text-cyan-300" />
                        <p className="font-semibold text-white">Ask AI about this trend</p>
                      </div>
                      <p className="mt-1 text-sm text-gray-300">Use the last few results and reference ranges as chat context.</p>
                    </button>

                    <div className="space-y-3">
                      {selectedSeries.points.slice().reverse().map((point) => (
                        <div key={`${point.test_id}-${point.test_date}-${point.value}`} className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-white">{formatDate(point.test_date)}</p>
                                <StatusBadge status={point.status || 'normal'} />
                              </div>
                              <p className="mt-1 text-sm text-gray-400">{point.lab_name || 'Blood panel'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold text-white">{formatNumeric(point.value)}</p>
                              <p className="text-xs text-gray-400">{point.unit || selectedSeries.unit}</p>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-gray-500">
                            Ref {point.reference_range_low ?? '—'} - {point.reference_range_high ?? '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {view === 'heatmap' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={heatmapCategory}
                  onChange={(event) => setHeatmapCategory(event.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                >
                  {dynamicCategories.map((category) => (
                    <option key={`heatmap-category-${category}`} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <select
                  value={heatmapSort}
                  onChange={(event) => setHeatmapSort(event.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
                >
                  <option value="severity">Most abnormal lately</option>
                  <option value="abnormal">Most abnormal overall</option>
                  <option value="name">Alphabetical</option>
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setHeatmapMode('all')}
                  className={`rounded-xl px-3 py-2 text-xs ${heatmapMode === 'all' ? 'bg-cyan-500 text-black' : 'bg-gray-900 text-gray-300'}`}
                >
                  All markers
                </button>
                <button
                  onClick={() => setHeatmapMode('abnormal')}
                  className={`rounded-xl px-3 py-2 text-xs ${heatmapMode === 'abnormal' ? 'bg-cyan-500 text-black' : 'bg-gray-900 text-gray-300'}`}
                >
                  Out of range only
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-700 bg-gray-800">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[180px_repeat(auto-fit,minmax(78px,1fr))] border-b border-gray-700 bg-gray-900/60">
                  <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Marker</div>
                  {chronologicalResults.map((result) => (
                    <div key={`heatmap-head-${result.id}`} className="px-2 py-3 text-center text-[11px] font-medium text-gray-400">
                      {new Date(result.test_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  ))}
                </div>

                {heatmapRows.map((row) => (
                  <div key={`heatmap-row-${row.markerName}`} className="grid grid-cols-[180px_repeat(auto-fit,minmax(78px,1fr))] border-b border-gray-800 last:border-b-0">
                    <button
                      onClick={() => openTrend(row.markerName)}
                      className="px-4 py-3 text-left"
                    >
                      <p className="font-medium text-white">{row.markerName}</p>
                      <p className="text-[11px] text-gray-500">{row.category}</p>
                    </button>
                    {row.cells.map((cell, index) => (
                      <button
                        key={`heatmap-cell-${row.markerName}-${chronologicalResults[index]?.id}`}
                        onClick={() => {
                          openTrend(row.markerName);
                          if (cell?.status && cell.status !== 'normal') {
                            const panel = chronologicalResults[index];
                            openCoach(buildMarkerCoachContext(cell, panel));
                          }
                        }}
                        className={`m-1 rounded-xl px-2 py-3 text-center text-[11px] font-semibold ${cell ? getHeatmapTone(cell) : 'bg-gray-900 text-gray-600'}`}
                      >
                        {cell ? formatNumeric(cell.value, 1) : '—'}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'coach' && (
          <div className="space-y-4">
            {coachContext && (
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-cyan-300" />
                  <p className="font-semibold text-white">{coachContext.title}</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-gray-200">{coachContext.summary}</p>
              </div>
            )}

            <div className="space-y-3">
              {coachMessages.map((message, index) => (
                <div
                  key={`coach-${message.role}-${index}`}
                  className={
                    message.role === 'user'
                      ? 'ml-10 rounded-2xl bg-cyan-500 px-4 py-3 text-sm text-black'
                      : message.role === 'suggestion'
                        ? 'rounded-2xl border border-cyan-500/20 bg-gray-800 p-3'
                        : 'mr-10 rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-200'
                  }
                >
                  {message.role === 'suggestion' ? (
                    <button
                      onClick={() => sendCoachMessage(message.content)}
                      className="text-left text-sm text-cyan-300"
                    >
                      {message.content}
                    </button>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              ))}

              {coachLoading && (
                <div className="mr-10 rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-300">
                  Thinking through the result context...
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
              <textarea
                value={coachInput}
                onChange={(event) => setCoachInput(event.target.value)}
                placeholder="Ask about the marker, trend, or what to watch next..."
                className="h-28 w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none focus:border-cyan-500"
              />
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => sendCoachMessage()}
                  disabled={!coachInput.trim() || coachLoading}
                  className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav active="more" />
    </div>
  );
}
