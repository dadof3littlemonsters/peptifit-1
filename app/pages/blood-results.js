import { useState, useEffect } from 'react'
import { bloodResults, auth } from '../lib/api'
import Link from 'next/link'
import { 
  ArrowLeftIcon,
  PlusIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronRightIcon,
  DocumentArrowUpIcon,
  SparklesIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CalendarIcon,
  BuildingOfficeIcon,
  MagnifyingGlassIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

// Common blood markers for quick-add
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
  { name: 'Total Bilirubin', unit: 'mg/dL', rangeLow: 0.1, rangeHigh: 1.2, category: 'Liver' },
  { name: 'WBC', unit: 'K/uL', rangeLow: 4.0, rangeHigh: 11.0, category: 'CBC' },
  { name: 'RBC', unit: 'M/uL', rangeLow: 4.5, rangeHigh: 5.5, category: 'CBC' },
  { name: 'Hemoglobin', unit: 'g/dL', rangeLow: 13.5, rangeHigh: 17.5, category: 'CBC' },
  { name: 'Hematocrit', unit: '%', rangeLow: 38, rangeHigh: 50, category: 'CBC' },
  { name: 'Platelets', unit: 'K/uL', rangeLow: 150, rangeHigh: 450, category: 'CBC' },
  { name: 'Ferritin', unit: 'ng/mL', rangeLow: 20, rangeHigh: 300, category: 'Iron' },
  { name: 'Iron', unit: 'mcg/dL', rangeLow: 60, rangeHigh: 170, category: 'Iron' },
  { name: 'TIBC', unit: 'mcg/dL', rangeLow: 240, rangeHigh: 450, category: 'Iron' },
  { name: 'CRP', unit: 'mg/L', rangeLow: 0, rangeHigh: 3, category: 'Inflammation' },
  { name: 'Homocysteine', unit: 'umol/L', rangeLow: 4, rangeHigh: 15, category: 'Cardiac' },
  { name: 'Vitamin D', unit: 'ng/mL', rangeLow: 30, rangeHigh: 100, category: 'Vitamins' },
  { name: 'Vitamin B12', unit: 'pg/mL', rangeLow: 200, rangeHigh: 900, category: 'Vitamins' },
  { name: 'Folate', unit: 'ng/mL', rangeLow: 3, rangeHigh: 20, category: 'Vitamins' }
];

// Categories for organizing markers
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
  'Cardiac',
  'Vitamins',
  'Other'
];

// Status colors
const STATUS_COLORS = {
  normal: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', indicator: 'bg-green-500' },
  borderline: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', indicator: 'bg-yellow-500' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', indicator: 'bg-orange-500' },
  low: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', indicator: 'bg-orange-500' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', indicator: 'bg-red-500' }
};

export default function BloodResultsPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('list'); // 'list', 'add', 'detail'
  const [selectedResult, setSelectedResult] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    testDate: new Date().toISOString().split('T')[0],
    labName: '',
    markers: []
  });
  
  // Quick add search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    loadBloodResults();
  }, []);

  const loadBloodResults = async () => {
    try {
      setLoading(true);
      const data = await bloodResults.getAll();
      setResults(data);
    } catch (err) {
      setError('Failed to load blood results');
      console.error('Error loading blood results:', err);
      // Use mock data for development
      setResults([
        {
          id: 1,
          test_date: '2026-02-15',
          lab_name: 'LabCorp',
          markers: [
            { id: 1, name: 'Total Cholesterol', value: 185, unit: 'mg/dL', reference_range_low: 0, reference_range_high: 200, status: 'normal' },
            { id: 2, name: 'LDL Cholesterol', value: 95, unit: 'mg/dL', reference_range_low: 0, reference_range_high: 100, status: 'normal' },
            { id: 3, name: 'HDL Cholesterol', value: 55, unit: 'mg/dL', reference_range_low: 40, reference_range_high: 60, status: 'normal' },
            { id: 4, name: 'Triglycerides', value: 140, unit: 'mg/dL', reference_range_low: 0, reference_range_high: 150, status: 'borderline' },
            { id: 5, name: 'Total Testosterone', value: 850, unit: 'ng/dL', reference_range_low: 300, reference_range_high: 1000, status: 'normal' },
            { id: 6, name: 'Estradiol', value: 42, unit: 'pg/mL', reference_range_low: 10, reference_range_high: 40, status: 'high' }
          ]
        },
        {
          id: 2,
          test_date: '2025-12-10',
          lab_name: 'Quest Diagnostics',
          markers: [
            { id: 7, name: 'Total Cholesterol', value: 210, unit: 'mg/dL', reference_range_low: 0, reference_range_high: 200, status: 'high' },
            { id: 8, name: 'LDL Cholesterol', value: 115, unit: 'mg/dL', reference_range_low: 0, reference_range_high: 100, status: 'high' },
            { id: 9, name: 'Total Testosterone', value: 620, unit: 'ng/dL', reference_range_low: 300, reference_range_high: 1000, status: 'normal' },
            { id: 10, name: 'Glucose (Fasting)', value: 95, unit: 'mg/dL', reference_range_low: 70, reference_range_high: 100, status: 'normal' }
          ]
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate marker status based on value and reference range
  const getMarkerStatus = (value, rangeLow, rangeHigh) => {
    if (!rangeLow && !rangeHigh) return 'normal';
    
    const low = parseFloat(rangeLow);
    const high = parseFloat(rangeHigh);
    const val = parseFloat(value);
    
    if (isNaN(val)) return 'normal';
    
    // Critical thresholds (20% outside range)
    const criticalLow = low * 0.8;
    const criticalHigh = high * 1.2;
    
    // Borderline thresholds (10% outside range)
    const borderLow = low * 0.9;
    const borderHigh = high * 1.1;
    
    if (val < criticalLow || val > criticalHigh) return 'critical';
    if (val < borderLow || val > borderHigh) return val < low ? 'low' : 'high';
    if (val < low || val > high) return 'borderline';
    
    return 'normal';
  };

  // Get trend compared to previous result
  const getTrend = (markerName, currentValue, currentResultId) => {
    const currentIndex = results.findIndex(r => r.id === currentResultId);
    if (currentIndex >= results.length - 1) return null;
    
    const previousResult = results[currentIndex + 1];
    const previousMarker = previousResult?.markers?.find(m => m.name === markerName);
    
    if (!previousMarker) return null;
    
    const current = parseFloat(currentValue);
    const previous = parseFloat(previousMarker.value);
    
    if (isNaN(current) || isNaN(previous)) return null;
    
    const change = ((current - previous) / previous) * 100;
    
    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
      percentage: Math.abs(change).toFixed(1),
      previousValue: previous
    };
  };

  // Add marker to form
  const addMarker = (markerTemplate = null) => {
    const newMarker = markerTemplate ? {
      id: Date.now(),
      name: markerTemplate.name,
      value: '',
      unit: markerTemplate.unit,
      reference_range_low: markerTemplate.rangeLow,
      reference_range_high: markerTemplate.rangeHigh,
      status: 'normal'
    } : {
      id: Date.now(),
      name: '',
      value: '',
      unit: '',
      reference_range_low: '',
      reference_range_high: '',
      status: 'normal'
    };
    
    setFormData(prev => ({
      ...prev,
      markers: [...prev.markers, newMarker]
    }));
  };

  // Update marker in form
  const updateMarker = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      markers: prev.markers.map(m => {
        if (m.id !== id) return m;
        const updated = { ...m, [field]: value };
        // Recalculate status if value or range changes
        if (field === 'value' || field === 'reference_range_low' || field === 'reference_range_high') {
          updated.status = getMarkerStatus(
            field === 'value' ? value : updated.value,
            field === 'reference_range_low' ? value : updated.reference_range_low,
            field === 'reference_range_high' ? value : updated.reference_range_high
          );
        }
        return updated;
      })
    }));
  };

  // Remove marker from form
  const removeMarker = (id) => {
    setFormData(prev => ({
      ...prev,
      markers: prev.markers.filter(m => m.id !== id)
    }));
  };

  // Submit new blood result
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.markers.length === 0) {
      setError('Please add at least one marker');
      return;
    }
    
    try {
      await bloodResults.create({
        test_date: formData.testDate,
        lab_name: formData.labName,
        markers: formData.markers.map(m => ({
          name: m.name,
          value: parseFloat(m.value),
          unit: m.unit,
          reference_range_low: parseFloat(m.reference_range_low) || null,
          reference_range_high: parseFloat(m.reference_range_high) || null,
          status: m.status
        }))
      });
      
      // Reset form and reload
      setFormData({
        testDate: new Date().toISOString().split('T')[0],
        labName: '',
        markers: []
      });
      setView('list');
      loadBloodResults();
    } catch (err) {
      setError('Failed to save blood result');
      console.error('Error saving blood result:', err);
      // For development, just add to local state
      const newResult = {
        id: Date.now(),
        test_date: formData.testDate,
        lab_name: formData.labName || 'Unknown Lab',
        markers: formData.markers
      };
      setResults([newResult, ...results]);
      setView('list');
      setFormData({
        testDate: new Date().toISOString().split('T')[0],
        labName: '',
        markers: []
      });
    }
  };

  // View detail
  const viewDetail = async (result) => {
    try {
      const detail = await bloodResults.getById(result.id);
      setSelectedResult(detail);
    } catch (err) {
      // Use the result we already have
      setSelectedResult(result);
    }
    setView('detail');
    setAiAnalysis(null);
  };

  // Request AI analysis
  const requestAiAnalysis = async () => {
    if (!selectedResult) return;
    
    setAnalyzing(true);
    try {
      const analysis = await bloodResults.analyze(selectedResult.id);
      setAiAnalysis(analysis);
    } catch (err) {
      // Mock analysis for development
      setAiAnalysis({
        summary: 'Based on your blood panel from ' + selectedResult.lab_name + ', most markers are within normal ranges. There are a few items worth noting.',
        findings: [
          {
            marker: 'Estradiol',
            status: 'slightly_elevated',
            message: 'Slightly above optimal range. This could be related to your current TRT protocol.',
            recommendation: 'Consider discussing aromatase inhibitor options with your doctor if symptoms persist.'
          },
          {
            marker: 'Triglycerides',
            status: 'borderline',
            message: 'Borderline high. Associated with dietary carbohydrate intake.',
            recommendation: 'Reduce refined carbs and increase omega-3 intake.'
          },
          {
            marker: 'Total Testosterone',
            status: 'optimal',
            message: 'Excellent level, well within therapeutic range.',
            recommendation: 'Continue current protocol.'
          }
        ],
        correlations: [
          {
            peptide: 'BPC-157',
            marker: 'ALT/AST',
            note: 'Liver enzymes look good despite peptide use'
          }
        ],
        flags: [
          { severity: 'low', message: 'Estradiol slightly elevated' },
          { severity: 'low', message: 'Triglycerides borderline high' }
        ],
        overallAssessment: 'Good overall health markers. Minor adjustments to diet may help optimize lipids.'
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Get filtered common markers
  const getFilteredMarkers = () => {
    let filtered = COMMON_MARKERS;
    
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(m => m.category === selectedCategory);
    }
    
    if (searchQuery) {
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return filtered;
  };

  // Count abnormal markers
  const countAbnormalMarkers = (markers) => {
    return markers?.filter(m => m.status !== 'normal').length || 0;
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Group markers by category for detail view
  const groupMarkersByCategory = (markers) => {
    const grouped = {};
    markers?.forEach(marker => {
      const template = COMMON_MARKERS.find(m => m.name === marker.name);
      const category = template?.category || 'Other';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(marker);
    });
    return grouped;
  };

  if (loading && results.length === 0) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading blood results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Header */}
      <header className="bg-[#0f172a] border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {view !== 'list' && (
                <button 
                  onClick={() => {
                    setView('list');
                    setSelectedResult(null);
                    setAiAnalysis(null);
                  }}
                  className="mr-3"
                >
                  <ArrowLeftIcon className="h-6 w-6 text-gray-400 hover:text-white transition-colors" />
                </button>
              )}
              <div>
                <h1 className="text-xl font-semibold text-white">
                  {view === 'list' && 'Blood Results'}
                  {view === 'add' && 'Log Blood Panel'}
                  {view === 'detail' && 'Test Details'}
                </h1>
                {view === 'list' && (
                  <p className="text-gray-400 text-sm">{results.length} panels recorded</p>
                )}
              </div>
            </div>
            {view === 'list' && (
              <button
                onClick={() => setView('add')}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium p-2 rounded-xl transition-colors"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-5 py-5 pb-24">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl mb-6">
            {error}
          </div>
        )}

        {/* LIST VIEW */}
        {view === 'list' && (
          <div className="space-y-4">
            {results.length === 0 ? (
              <div className="text-center py-12 bg-gray-800/50 rounded-2xl border border-gray-700">
                <div className="text-4xl mb-3">🧪</div>
                <h3 className="text-white font-medium mb-2">No blood results yet</h3>
                <p className="text-gray-400 text-sm mb-4">Log your first blood panel to start tracking</p>
                <button
                  onClick={() => setView('add')}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  Log Blood Panel
                </button>
              </div>
            ) : (
              <>
                {/* Stats Summary */}
                {results.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700 text-center">
                      <div className="text-2xl font-bold text-white">{results.length}</div>
                      <div className="text-xs text-gray-400">Panels</div>
                    </div>
                    <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700 text-center">
                      <div className="text-2xl font-bold text-cyan-400">
                        {results[0]?.markers?.length || 0}
                      </div>
                      <div className="text-xs text-gray-400">Last Markers</div>
                    </div>
                    <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700 text-center">
                      <div className="text-2xl font-bold text-orange-400">
                        {countAbnormalMarkers(results[0]?.markers)}
                      </div>
                      <div className="text-xs text-gray-400">Flagged</div>
                    </div>
                  </div>
                )}

                {/* Results List */}
                <div className="space-y-3">
                  {results.map((result) => {
                    const abnormalCount = countAbnormalMarkers(result.markers);
                    return (
                      <button
                        key={result.id}
                        onClick={() => viewDetail(result)}
                        className="w-full bg-gray-800 rounded-2xl p-4 border border-gray-700 hover:border-gray-600 transition-all text-left"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CalendarIcon className="h-4 w-4 text-gray-400" />
                              <span className="text-white font-semibold">
                                {formatDate(result.test_date)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                              <BuildingOfficeIcon className="h-4 w-4" />
                              {result.lab_name}
                            </div>
                          </div>
                          <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                        </div>
                        
                        {/* Quick summary */}
                        <div className="mt-4 flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <BeakerIcon className="h-4 w-4 text-cyan-400" />
                            <span className="text-sm text-gray-300">
                              {result.markers?.length || 0} markers
                            </span>
                          </div>
                          {abnormalCount > 0 && (
                            <div className="flex items-center gap-2">
                              <ExclamationTriangleIcon className="h-4 w-4 text-orange-400" />
                              <span className="text-sm text-orange-400">
                                {abnormalCount} flagged
                              </span>
                            </div>
                          )}
                          {abnormalCount === 0 && (
                            <div className="flex items-center gap-2">
                              <CheckCircleIcon className="h-4 w-4 text-green-400" />
                              <span className="text-sm text-green-400">
                                All normal
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Preview of abnormal markers */}
                        {abnormalCount > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.markers
                              ?.filter(m => m.status !== 'normal')
                              .slice(0, 3)
                              .map((marker, idx) => (
                                <span 
                                  key={idx}
                                  className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[marker.status]?.bg} ${STATUS_COLORS[marker.status]?.text}`}
                                >
                                  {marker.name}
                                </span>
                              ))}
                            {abnormalCount > 3 && (
                              <span className="text-xs px-2 py-1 rounded-full bg-gray-700 text-gray-400">
                                +{abnormalCount - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ADD VIEW */}
        {view === 'add' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Test Info */}
            <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
              <h3 className="text-sm font-medium text-cyan-400 mb-4">📅 Test Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Test Date *</label>
                  <input
                    type="date"
                    value={formData.testDate}
                    onChange={(e) => setFormData({ ...formData, testDate: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Lab Name</label>
                  <input
                    type="text"
                    value={formData.labName}
                    onChange={(e) => setFormData({ ...formData, labName: e.target.value })}
                    placeholder="e.g., LabCorp, Quest Diagnostics"
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Quick Add Section */}
            <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
              <h3 className="text-sm font-medium text-cyan-400 mb-4">⚡ Quick Add Markers</h3>
              
              {/* Category filter */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedCategory === 'All'
                      ? 'bg-cyan-500 text-black'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  All
                </button>
                {MARKER_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-cyan-500 text-black'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search markers..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* Common markers grid */}
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {getFilteredMarkers().map((marker, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => addMarker(marker)}
                    className="text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded-xl p-3 transition-colors"
                  >
                    <div className="text-sm text-white font-medium truncate">{marker.name}</div>
                    <div className="text-xs text-gray-400">{marker.category}</div>
                  </button>
                ))}
              </div>

              {/* Add custom marker button */}
              <button
                type="button"
                onClick={() => addMarker()}
                className="w-full mt-3 bg-gray-700 hover:bg-gray-600 border border-dashed border-gray-600 rounded-xl p-3 text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <PlusIcon className="h-4 w-4" />
                Add Custom Marker
              </button>
            </div>

            {/* Added Markers */}
            {formData.markers.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-white">
                  Markers ({formData.markers.length})
                </h3>
                {formData.markers.map((marker) => (
                  <div key={marker.id} className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
                        <input
                          type="text"
                          value={marker.name}
                          onChange={(e) => updateMarker(marker.id, 'name', e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Value</label>
                        <input
                          type="number"
                          step="0.01"
                          value={marker.value}
                          onChange={(e) => updateMarker(marker.id, 'value', e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Unit</label>
                        <input
                          type="text"
                          value={marker.unit}
                          onChange={(e) => updateMarker(marker.id, 'unit', e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Ref Low</label>
                        <input
                          type="number"
                          step="0.01"
                          value={marker.reference_range_low}
                          onChange={(e) => updateMarker(marker.id, 'reference_range_low', e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Ref High</label>
                        <input
                          type="number"
                          step="0.01"
                          value={marker.reference_range_high}
                          onChange={(e) => updateMarker(marker.id, 'reference_range_high', e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                    {/* Status indicator */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Status:</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[marker.status]?.bg} ${STATUS_COLORS[marker.status]?.text}`}>
                          {marker.status.charAt(0).toUpperCase() + marker.status.slice(1)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMarker(marker.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-semibold py-4 rounded-xl transition-colors"
            >
              Save Blood Panel
            </button>
          </form>
        )}

        {/* DETAIL VIEW */}
        {view === 'detail' && selectedResult && (
          <div className="space-y-5">
            {/* Header info */}
            <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-cyan-400" />
                  <span className="text-lg font-semibold text-white">
                    {formatDate(selectedResult.test_date)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <BuildingOfficeIcon className="h-4 w-4" />
                {selectedResult.lab_name}
              </div>
            </div>

            {/* AI Analysis Button */}
            {!aiAnalysis && (
              <button
                onClick={requestAiAnalysis}
                disabled={analyzing}
                className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {analyzing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-5 w-5" />
                    Analyze with AI
                  </>
                )}
              </button>
            )}

            {/* AI Analysis Results */}
            {aiAnalysis && (
              <div className="bg-gradient-to-br from-purple-900/30 to-violet-900/30 rounded-2xl p-4 border border-purple-500/30">
                <div className="flex items-center gap-2 mb-4">
                  <SparklesIcon className="h-5 w-5 text-purple-400" />
                  <h3 className="text-lg font-semibold text-white">AI Analysis</h3>
                </div>
                
                <p className="text-gray-300 text-sm mb-4">{aiAnalysis.summary}</p>
                
                {/* Findings */}
                <div className="space-y-3 mb-4">
                  {aiAnalysis.findings?.map((finding, idx) => (
                    <div key={idx} className="bg-gray-900/50 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          finding.status === 'optimal' ? 'bg-green-500/20 text-green-400' :
                          finding.status === 'slightly_elevated' ? 'bg-yellow-500/20 text-yellow-400' :
                          finding.status === 'borderline' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {finding.marker}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 mb-1">{finding.message}</p>
                      <p className="text-xs text-cyan-400">💡 {finding.recommendation}</p>
                    </div>
                  ))}
                </div>

                {/* Flags */}
                {aiAnalysis.flags?.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Flags</h4>
                    <div className="space-y-2">
                      {aiAnalysis.flags.map((flag, idx) => (
                        <div 
                          key={idx} 
                          className={`flex items-center gap-2 text-sm ${
                            flag.severity === 'high' ? 'text-red-400' :
                            flag.severity === 'medium' ? 'text-orange-400' :
                            'text-yellow-400'
                          }`}
                        >
                          <ExclamationTriangleIcon className="h-4 w-4" />
                          {flag.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Correlations */}
                {aiAnalysis.correlations?.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Correlations</h4>
                    <div className="space-y-2">
                      {aiAnalysis.correlations.map((corr, idx) => (
                        <div key={idx} className="text-sm text-gray-300 bg-gray-900/50 rounded-xl p-3">
                          <span className="text-purple-400 font-medium">{corr.peptide}</span> →{' '}
                          <span className="text-cyan-400">{corr.marker}</span>
                          <p className="text-xs text-gray-400 mt-1">{corr.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Overall Assessment */}
                <div className="bg-gray-900/50 rounded-xl p-3">
                  <h4 className="text-sm font-medium text-gray-400 mb-1">Overall Assessment</h4>
                  <p className="text-sm text-white">{aiAnalysis.overallAssessment}</p>
                </div>
              </div>
            )}

            {/* Markers by Category */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Test Results</h3>
              {Object.entries(groupMarkersByCategory(selectedResult.markers)).map(([category, markers]) => (
                <div key={category} className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
                  <h4 className="text-sm font-medium text-cyan-400 mb-4">{category}</h4>
                  <div className="space-y-3">
                    {markers.map((marker, idx) => {
                      const trend = getTrend(marker.name, marker.value, selectedResult.id);
                      const colors = STATUS_COLORS[marker.status] || STATUS_COLORS.normal;
                      
                      return (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">{marker.name}</span>
                              {trend && (
                                <span className={`flex items-center gap-1 text-xs ${
                                  trend.direction === 'up' ? 'text-green-400' : 
                                  trend.direction === 'down' ? 'text-orange-400' : 'text-gray-400'
                                }`}>
                                  {trend.direction === 'up' ? (
                                    <ArrowTrendingUpIcon className="h-3 w-3" />
                                  ) : trend.direction === 'down' ? (
                                    <ArrowTrendingDownIcon className="h-3 w-3" />
                                  ) : (
                                    <MinusIcon className="h-3 w-3" />
                                  )}
                                  {trend.percentage}%
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              Ref: {marker.reference_range_low}-{marker.reference_range_high} {marker.unit}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-bold ${colors.text}`}>
                              {marker.value}
                            </div>
                            <div className="text-xs text-gray-500">{marker.unit}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="bg-gray-800/50 rounded-2xl p-4 border border-gray-700">
              <h4 className="text-sm font-medium text-gray-400 mb-3">Status Legend</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-300">Normal</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-sm text-gray-300">Borderline</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="text-sm text-gray-300">High/Low</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-300">Critical</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0f172a] border-t border-gray-800">
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
            <Link 
              href="/meals"
              className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-xl mb-1">🍽️</span>
              <span className="text-xs">Meals</span>
            </Link>
            <Link 
              href="/vitals"
              className="flex flex-col items-center py-2 text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-xl mb-1">📊</span>
              <span className="text-xs">Vitals</span>
            </Link>
            <div className="flex flex-col items-center py-2 text-cyan-400">
              <span className="text-xl mb-1">🧪</span>
              <span className="text-xs">Blood Results</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
