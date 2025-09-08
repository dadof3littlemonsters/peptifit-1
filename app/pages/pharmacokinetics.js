import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { doses, peptides } from '../lib/api';
import PharmacokineticGraph from '../components/PharmacokineticGraph';
import DoseInputForm from '../components/DoseInputForm';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function Pharmacokinetics() {
  const [selectedPeptide, setSelectedPeptide] = useState('tirzepatide');
  const [availablePeptides, setAvailablePeptides] = useState([]);
  const [doseHistory, setDoseHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadPeptides();
    loadDoseHistory();
  }, []);

  const loadPeptides = async () => {
    try {
      const peptidesData = await peptides.getAll();
      setAvailablePeptides(peptidesData);
    } catch (error) {
      console.error('Failed to load peptides:', error);
      setError('Failed to load peptides');
    }
  };

  const loadDoseHistory = async () => {
    try {
      const dosesData = await doses.getAll();
      // Filter doses for the selected peptide type
      const filteredDoses = dosesData.filter(dose => 
        dose.peptide_name?.toLowerCase().includes(selectedPeptide) ||
        (selectedPeptide === 'tirzepatide' && dose.peptide_name?.toLowerCase().includes('tirze')) ||
        (selectedPeptide === 'retatrutide' && dose.peptide_name?.toLowerCase().includes('retat'))
      );
      setDoseHistory(filteredDoses);
    } catch (error) {
      console.error('Failed to load dose history:', error);
      setError('Failed to load dose history');
    } finally {
      setLoading(false);
    }
  };

  const handleDoseSubmit = async (newDoses) => {
    try {
      // Create dose entries for each submitted dose
      for (const dose of newDoses) {
        await doses.create({
          peptide_id: findPeptideId(selectedPeptide),
          dose_amount: dose.amount,
          dose_unit: 'mg',
          administration_time: dose.administration_time,
          injection_site: 'abdomen', // Default
          notes: `Pharmacokinetic modeling dose for ${selectedPeptide}`
        });
      }
      
      // Reload dose history
      await loadDoseHistory();
    } catch (error) {
      console.error('Failed to submit dose:', error);
      setError('Failed to submit dose');
    }
  };

  const findPeptideId = (peptideType) => {
    const peptide = availablePeptides.find(p => 
      p.name.toLowerCase().includes(peptideType) ||
      (peptideType === 'tirzepatide' && p.name.toLowerCase().includes('tirze')) ||
      (peptideType === 'retatrutide' && p.name.toLowerCase().includes('retat'))
    );
    return peptide?.id || '';
  };

  const handlePeptideChange = (peptideType) => {
    setSelectedPeptide(peptideType);
    loadDoseHistory();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading pharmacokinetic data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Link href="/" className="mr-4">
                <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">Pharmacokinetic Modeling</h1>
            </div>
            
            {/* Peptide Selector */}
            <div className="flex space-x-2">
              <button
                onClick={() => handlePeptideChange('tirzepatide')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedPeptide === 'tirzepatide'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Tirzepatide
              </button>
              <button
                onClick={() => handlePeptideChange('retatrutide')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedPeptide === 'retatrutide'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Retatrutide
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dose Input Form */}
          <div>
            <DoseInputForm
              peptideType={selectedPeptide}
              onDoseSubmit={handleDoseSubmit}
              existingDoses={doseHistory}
            />
            
            {/* Dose History */}
            <div className="bg-white rounded-lg p-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Dose History</h3>
              {doseHistory.length === 0 ? (
                <p className="text-gray-500 text-center">No doses recorded yet</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {doseHistory.map((dose, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">{dose.dose_amount} mg</p>
                        <p className="text-sm text-gray-600">
                          {new Date(dose.administration_time).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500">
                        {new Date(dose.administration_time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pharmacokinetic Graph */}
          <div>
            <PharmacokineticGraph
              doses={doseHistory}
              peptideType={selectedPeptide}
            />
          </div>
        </div>

        {/* Information Section */}
        <div className="bg-white rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">About Pharmacokinetic Modeling</h3>
          <div className="prose prose-sm text-gray-600">
            <p>
              This tool models the pharmacokinetics of {selectedPeptide} based on:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Absorption phase:</strong> 0-24 hours (linear increase to 80% of peak)</li>
              <li><strong>Peak phase:</strong> 24-48 hours (95% of administered dose)</li>
              <li><strong>Decay phase:</strong> Exponential decay with {selectedPeptide === 'tirzepatide' ? '5-day' : '6-day'} half-life</li>
              <li><strong>Weekly limits:</strong> {selectedPeptide === 'tirzepatide' ? '15mg' : '12mg'} maximum</li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              Note: This is a simplified model for educational purposes. Always consult with healthcare professionals for medical advice.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}