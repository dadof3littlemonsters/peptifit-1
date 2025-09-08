import { useState, useEffect } from 'react';
import { PharmacokineticCalculator } from '../lib/pharmacokinetics';

export default function DoseInputForm({ peptideType, onDoseSubmit, existingDoses = [] }) {
  const [formData, setFormData] = useState({
    dose1Amount: '',
    dose1Time: '',
    dose2Amount: '',
    dose2Time: '',
    splitDosing: false
  });
  
  const [validation, setValidation] = useState({
    isValid: true,
    message: '',
    weeklyTotal: 0,
    weeklyLimit: 0,
    remaining: 0
  });

  useEffect(() => {
    // Set current time as default
    const now = new Date();
    const localISOTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    
    setFormData(prev => ({
      ...prev,
      dose1Time: localISOTime,
      dose2Time: localISOTime
    }));
    
    validateWeeklyTotal();
  }, [existingDoses, peptideType]);

  const validateWeeklyTotal = (newDoses = []) => {
    const allDoses = [...existingDoses, ...newDoses];
    const validationResult = PharmacokineticCalculator.validateWeeklyTotal(allDoses, peptideType);
    
    setValidation({
      isValid: validationResult.isValid,
      message: validationResult.isValid 
        ? `Weekly total: ${validationResult.totalWeekly}mg / ${validationResult.weeklyLimit}mg`
        : `Weekly limit exceeded: ${validationResult.totalWeekly}mg / ${validationResult.weeklyLimit}mg`,
      weeklyTotal: validationResult.totalWeekly,
      weeklyLimit: validationResult.weeklyLimit,
      remaining: validationResult.remaining
    });
    
    return validationResult.isValid;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const dosesToSubmit = [];
    
    if (formData.dose1Amount && formData.dose1Time) {
      dosesToSubmit.push({
        amount: parseFloat(formData.dose1Amount),
        administration_time: new Date(formData.dose1Time).toISOString()
      });
    }
    
    if (formData.splitDosing && formData.dose2Amount && formData.dose2Time) {
      dosesToSubmit.push({
        amount: parseFloat(formData.dose2Amount),
        administration_time: new Date(formData.dose2Time).toISOString()
      });
    }
    
    if (dosesToSubmit.length === 0) {
      setValidation({
        isValid: false,
        message: 'Please enter at least one dose',
        weeklyTotal: 0,
        weeklyLimit: 0,
        remaining: 0
      });
      return;
    }
    
    if (!validateWeeklyTotal(dosesToSubmit)) {
      return;
    }
    
    onDoseSubmit(dosesToSubmit);
    
    // Reset form
    setFormData({
      dose1Amount: '',
      dose1Time: new Date().toISOString().slice(0, 16),
      dose2Amount: '',
      dose2Time: new Date().toISOString().slice(0, 16),
      splitDosing: false
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const getApprovedDoses = () => {
    const doses = peptideType === 'tirzepatide' 
      ? [2.5, 5, 7.5, 10, 12.5, 15]
      : [2, 4, 6, 8, 10, 12];
    
    return doses.map(dose => ({ value: dose, label: `${dose} mg` }));
  };

  const getDoseOptions = () => {
    const approvedDoses = getApprovedDoses();
    
    if (formData.splitDosing) {
      // For split dosing, show all doses up to remaining weekly amount
      const maxDose = validation.remaining;
      return approvedDoses.filter(dose => dose.value <= maxDose);
    }
    
    return approvedDoses;
  };

  return (
    <div className="bg-white rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {peptideType === 'tirzepatide' ? 'Tirzepatide' : 'Retatrutide'} Dosing
      </h2>
      
      {/* Weekly Total Validation */}
      <div className={`mb-4 p-3 rounded-lg ${
        validation.isValid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
      }`}>
        <p className="text-sm font-medium">
          {validation.message}
        </p>
        {validation.remaining > 0 && (
          <p className="text-xs mt-1">
            Remaining this week: {validation.remaining}mg
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Split Dosing Toggle */}
        {peptideType === 'tirzepatide' && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="splitDosing"
              name="splitDosing"
              checked={formData.splitDosing}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="splitDosing" className="ml-2 text-sm text-gray-700">
              Split weekly dose into multiple injections
            </label>
          </div>
        )}

        {/* Dose 1 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {formData.splitDosing ? 'First Dose Amount' : 'Dose Amount'} *
          </label>
          <select
            name="dose1Amount"
            value={formData.dose1Amount}
            onChange={handleChange}
            required
            className="input-field w-full"
          >
            <option value="">Select dose amount</option>
            {getDoseOptions().map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {formData.splitDosing ? 'First Dose Time' : 'Dose Time'} *
          </label>
          <input
            type="datetime-local"
            name="dose1Time"
            value={formData.dose1Time}
            onChange={handleChange}
            required
            className="input-field w-full"
          />
        </div>

        {/* Dose 2 (only for split dosing) */}
        {formData.splitDosing && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Second Dose Amount
              </label>
              <select
                name="dose2Amount"
                value={formData.dose2Amount}
                onChange={handleChange}
                className="input-field w-full"
              >
                <option value="">Select second dose (optional)</option>
                {getDoseOptions().map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Second Dose Time
              </label>
              <input
                type="datetime-local"
                name="dose2Time"
                value={formData.dose2Time}
                onChange={handleChange}
                className="input-field w-full"
              />
            </div>

            {formData.dose1Amount && formData.dose2Amount && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-800">
                  Total: {parseFloat(formData.dose1Amount) + parseFloat(formData.dose2Amount)}mg
                </p>
              </div>
            )}
          </>
        )}

        <button
          type="submit"
          className={`btn-primary w-full ${
            !validation.isValid ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={!validation.isValid}
        >
          Add Dose(s)
        </button>
      </form>
    </div>
  );
}