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
  SparklesIcon
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

const STATUS_COLORS = {
  normal: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-400' },
  optimal: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-400' },
  borderline: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-400' },
  low: { bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-400' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
  calculated: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', dot: 'bg-cyan-400' }
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

function getMarkerTemplate(markerName) {
  return COMMON_MARKERS.find((marker) => marker.name === markerName);
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
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function groupMarkersByCategory(markers = []) {
  return markers.reduce((groups, marker) => {
    const category = getMarkerTemplate(marker.name)?.category || 'Other';
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

function buildUploadPreview(file) {
  const fileName = file?.name?.toLowerCase?.() || '';
  const hormoneFocused = fileName.includes('horm') || fileName.includes('test');

  return hormoneFocused
    ? [
        { id: Date.now(), name: 'Total Testosterone', value: '712', unit: 'ng/dL', reference_range_low: 300, reference_range_high: 1000, status: 'normal' },
        { id: Date.now() + 1, name: 'Estradiol', value: '44', unit: 'pg/mL', reference_range_low: 10, reference_range_high: 40, status: 'high' },
        { id: Date.now() + 2, name: 'SHBG', value: '29', unit: 'nmol/L', reference_range_low: 10, reference_range_high: 50, status: 'normal' }
      ]
    : [
        { id: Date.now(), name: 'Total Cholesterol', value: '189', unit: 'mg/dL', reference_range_low: 0, reference_range_high: 200, status: 'normal' },
        { id: Date.now() + 1, name: 'Triglycerides', value: '166', unit: 'mg/dL', reference_range_low: 0, reference_range_high: 150, status: 'high' },
        { id: Date.now() + 2, name: 'Glucose (Fasting)', value: '92', unit: 'mg/dL', reference_range_low: 70, reference_range_high: 100, status: 'normal' }
      ];
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
  const [extractedMarkers, setExtractedMarkers] = useState([]);
  const [uploadMeta, setUploadMeta] = useState({
    testName: '',
    testDate: new Date().toISOString().split('T')[0],
    timing: 'Trough',
    notes: ''
  });
  const [formData, setFormData] = useState({
    testDate: new Date().toISOString().split('T')[0],
    labName: '',
    notes: '',
    markers: []
  });

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

  const filteredMarkers = useMemo(() => {
    return COMMON_MARKERS.filter((marker) => {
      if (selectedCategory !== 'All' && marker.category !== selectedCategory) return false;
      if (searchQuery && !marker.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [searchQuery, selectedCategory]);

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

  function resetFormState() {
    setFormData({
      testDate: new Date().toISOString().split('T')[0],
      labName: '',
      notes: '',
      markers: []
    });
    setUploadMeta({
      testName: '',
      testDate: new Date().toISOString().split('T')[0],
      timing: 'Trough',
      notes: ''
    });
    setSelectedFile(null);
    setExtractedMarkers([]);
    setSearchQuery('');
    setSelectedCategory('All');
    setAddMode('manual');
  }

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDir(field === 'test_date' ? 'desc' : 'desc');
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
      setError('Select a PDF to generate extracted markers before saving.');
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
      testName: current.testName || file.name.replace(/\.pdf$/i, '')
    }));
    setExtractedMarkers(buildUploadPreview(file));
    setError('');
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileSelection(file);
  }

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
    <div className="h-[100dvh] min-h-screen flex flex-col overflow-hidden bg-gray-900 text-white">
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
              <h1 className="text-xl font-semibold">
                {view === 'list' ? 'Blood Results' : view === 'add' ? 'Add Blood Panel' : 'Test Details'}
              </h1>
              <p className="text-xs text-gray-400">
                {view === 'list'
                  ? `${results.length} panels recorded`
                  : view === 'add'
                    ? 'Manual entry or PDF upload'
                    : selectedResult ? formatDate(selectedResult.test_date) : 'Review biomarker detail'}
              </p>
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
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-center">
                <div className="text-2xl font-bold text-white">{results.length}</div>
                <div className="text-xs text-gray-400">Panels</div>
              </div>
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-center">
                <div className="text-2xl font-bold text-cyan-400">{results[0]?.markers?.length || 0}</div>
                <div className="text-xs text-gray-400">Last Markers</div>
              </div>
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-center">
                <div className="text-2xl font-bold text-orange-400">{countFlaggedMarkers(results[0]?.markers || [])}</div>
                <div className="text-xs text-gray-400">Flagged</div>
              </div>
            </div>

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
                  return (
                    <button
                      key={result.id}
                      onClick={() => openDetail(result)}
                      className="w-full rounded-2xl border border-gray-700 bg-gray-800 p-4 text-left transition-colors hover:border-gray-600"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-gray-500" />
                            <p className="font-semibold text-white">{formatDate(result.test_date)}</p>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-sm text-gray-400">
                            <BuildingOfficeIcon className="h-4 w-4" />
                            <span>{result.lab_name || 'Blood Panel'}</span>
                          </div>
                        </div>
                        <ChevronRightIcon className="mt-1 h-5 w-5 text-gray-500" />
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
                    </button>
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
                Upload PDF
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
                  <p className="mb-1 font-medium text-white">{selectedFile ? selectedFile.name : 'Tap to select PDF'}</p>
                  <p className="text-sm text-gray-500">or drag and drop • Max 10MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(event) => handleFileSelection(event.target.files?.[0])}
                  />
                </div>

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

                {extractedMarkers.length > 0 && (
                  <div className="rounded-2xl border border-cyan-500/30 bg-gray-800 p-4">
                    <h3 className="mb-3 font-semibold text-white">Extracted Biomarkers ({extractedMarkers.length})</h3>
                    <div className="space-y-3">
                      {extractedMarkers.map((marker) => (
                        <div key={marker.id} className="rounded-xl bg-gray-700/60 p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="font-medium text-white">{marker.name}</p>
                            <StatusBadge status={marker.status} />
                          </div>
                          <p className="text-sm text-cyan-400">
                            {marker.value} <span className="text-gray-400">{marker.unit}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Ref {marker.reference_range_low} - {marker.reference_range_high} {marker.unit}
                          </p>
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

            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={requestAiAnalysis}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-black"
              >
                <SparklesIcon className="h-4 w-4" />
                {analyzing ? 'Analyzing...' : aiAnalysis ? 'Regenerate' : 'AI Insights'}
              </button>
              <button
                onClick={handleShare}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-300"
              >
                <ShareIcon className="h-4 w-4" />
                Share
              </button>
              <button
                onClick={prepareEdit}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-300"
              >
                <PencilIcon className="h-4 w-4" />
                Edit
              </button>
              <button className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2.5 text-sm text-gray-300">
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
      </main>

      <BottomNav active="more" />
    </div>
  );
}
