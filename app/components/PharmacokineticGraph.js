import { useState, useEffect } from 'react';
import { PharmacokineticCalculator } from '../lib/pharmacokinetics';

export default function PharmacokineticGraph({ doses, peptideType }) {
  const [graphData, setGraphData] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [peakTroughInfo, setPeakTroughInfo] = useState(null);
  const [doseRecommendation, setDoseRecommendation] = useState(null);

  useEffect(() => {
    if (doses.length > 0) {
      const data = PharmacokineticCalculator.generateTimeSeries(doses, peptideType);
      setGraphData(data);
      
      const current = PharmacokineticCalculator.calculateCumulativeLevels(doses, Date.now(), peptideType);
      setCurrentLevel(Math.round(current * 100) / 100);
      
      const peakTrough = PharmacokineticCalculator.getPeakTroughInfo(doses, peptideType);
      setPeakTroughInfo(peakTrough);
      
      const recommendation = PharmacokineticCalculator.getNextDoseRecommendation(doses, peptideType);
      setDoseRecommendation(recommendation);
    }
  }, [doses, peptideType]);

  const formatTime = (time) => {
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString();
  };

  // Simple SVG-based graph since we don't have recharts working
  const renderSimpleGraph = () => {
    if (graphData.length === 0) return null;
    
    const maxLevel = Math.max(...graphData.map(d => d.level));
    const minLevel = 0;
    const graphHeight = 200;
    const graphWidth = 600;
    
    const points = graphData.map((point, index) => {
      const x = (index / graphData.length) * graphWidth;
      const y = graphHeight - ((point.level - minLevel) / (maxLevel - minLevel)) * graphHeight;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <div className="mt-4">
        <svg width={graphWidth} height={graphHeight} className="border border-gray-200 rounded">
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={points}
          />
          {/* X-axis */}
          <line x1="0" y1={graphHeight} x2={graphWidth} y2={graphHeight} stroke="#ccc" />
          {/* Y-axis */}
          <line x1="0" y1="0" x2="0" y2={graphHeight} stroke="#ccc" />
        </svg>
        <div className="text-xs text-gray-600 mt-2 text-center">
          Time → (Max: {Math.round(maxLevel * 100) / 100} mg)
        </div>
      </div>
    );
  };

  if (doses.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 text-center">
        <p className="text-gray-500">No dose data available for graphing</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Current Level */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Current System Level</h3>
          <p className="text-2xl font-bold text-blue-600">{currentLevel} mg</p>
          <p className="text-xs text-blue-600 mt-1">as of {new Date().toLocaleTimeString()}</p>
        </div>

        {/* Peak/Trough Info */}
        {peakTroughInfo && (
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-800 mb-2">Peak/Trough</h3>
            <p className="text-sm text-green-600">
              Peak: {peakTroughInfo.peakLevel} mg<br />
              Trough: {peakTroughInfo.troughLevel} mg<br />
              Fluctuation: {peakTroughInfo.fluctuation}%
            </p>
          </div>
        )}

        {/* Dose Recommendation */}
        {doseRecommendation && (
          <div className={`rounded-lg p-4 ${
            doseRecommendation.recommended 
              ? 'bg-yellow-50 text-yellow-800' 
              : 'bg-green-50 text-green-800'
          }`}>
            <h3 className="text-sm font-semibold mb-2">Recommendation</h3>
            <p className="text-sm">{doseRecommendation.message}</p>
            {doseRecommendation.hoursUntil && (
              <p className="text-xs mt-1">
                {doseRecommendation.hoursUntil} hours until suggested dose
              </p>
            )}
          </div>
        )}
      </div>

      {/* Simple Graph */}
      {renderSimpleGraph()}

      {/* Injection Markers */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Injections</h4>
        <div className="space-y-2">
          {doses.slice(-5).map((dose, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {new Date(dose.administration_time).toLocaleDateString()}
              </span>
              <span className="font-semibold text-blue-600">
                {dose.amount} mg
              </span>
              <span className="text-gray-500 text-xs">
                {new Date(dose.administration_time).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
