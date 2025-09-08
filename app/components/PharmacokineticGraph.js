import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const PharmacokineticGraph = ({ recentDoses, userStack, availablePeptides }) => {
  const [glp1Data, setGlp1Data] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [timeToNextDose, setTimeToNextDose] = useState('');
  const [peakTime, setPeakTime] = useState('');

  // GLP-1 pharmacokinetic parameters
  const HALF_LIFE_HOURS = 168; // 7 days in hours
  const PEAK_TIME_HOURS = 48; // Peak at ~48 hours
  const ABSORPTION_PHASE_HOURS = 24; // Absorption phase duration

  // Calculate pharmacokinetic curve
  const calculatePharmacokinetics = () => {
    if (!recentDoses || !userStack || !availablePeptides) return null;

    // Find GLP-1 peptides in user stack
    const glp1Peptides = userStack.filter(item => {
      const peptide = availablePeptides.find(p => p.id === item.peptide_id);
      return peptide && (peptide.name.includes('Tirzepatide') || 
                        peptide.name.includes('Retatrutide') ||
                        peptide.name.includes('GLP-1'));
    });

    if (glp1Peptides.length === 0) return null;

    // Get most recent GLP-1 dose
    const glp1Doses = recentDoses.filter(dose => 
      glp1Peptides.some(item => item.peptide_id === dose.peptide_id)
    );

    if (glp1Doses.length === 0) return null;

    const lastDose = glp1Doses.sort((a, b) => 
      new Date(b.administration_time) - new Date(a.administration_time)
    )[0];

    const doseTime = new Date(lastDose.administration_time);
    const currentTime = new Date();
    const hoursSinceDose = (currentTime - doseTime) / (1000 * 60 * 60);

    // Calculate next dose time (weekly schedule)
    const nextDoseTime = new Date(doseTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    const hoursToNextDose = (nextDoseTime - currentTime) / (1000 * 60 * 60);

    // Generate data points for the next 7 days
    const dataPoints = [];
    const labels = [];
    const maxHours = Math.min(168, hoursSinceDose + 168); // Show up to 7 days

    for (let hours = 0; hours <= maxHours; hours += 6) { // Every 6 hours
      const timeFromDose = hours;
      
      // Two-compartment model approximation
      let concentration = 0;
      
      if (timeFromDose <= ABSORPTION_PHASE_HOURS) {
        // Absorption phase - linear increase to peak
        concentration = (timeFromDose / ABSORPTION_PHASE_HOURS) * 100;
      } else {
        // Elimination phase - exponential decay
        const timeSincePeak = timeFromDose - ABSORPTION_PHASE_HOURS;
        concentration = 100 * Math.exp(-Math.log(2) * timeSincePeak / HALF_LIFE_HOURS);
      }
      
      dataPoints.push(Math.max(0, Math.min(100, concentration)));
      
      // Format labels
      if (hours % 24 === 0) {
        labels.push(`${hours / 24}d`);
      } else if (hours === 0) {
        labels.push('Dose');
      } else {
        labels.push('');
      }
    }

    // Calculate current level
    const currentConcentration = hoursSinceDose <= ABSORPTION_PHASE_HOURS
      ? (hoursSinceDose / ABSORPTION_PHASE_HOURS) * 100
      : 100 * Math.exp(-Math.log(2) * (hoursSinceDose - ABSORPTION_PHASE_HOURS) / HALF_LIFE_HOURS);

    // Format time to next dose
    const days = Math.floor(hoursToNextDose / 24);
    const hours = Math.floor(hoursToNextDose % 24);
    const timeUntilNext = days > 0 ? `${days}d ${hours}h` : `${hours}h`;

    setCurrentLevel(Math.round(currentConcentration));
    setTimeToNextDose(timeUntilNext);
    setPeakTime(PEAK_TIME_HOURS <= hoursSinceDose ? 'Reached' : `${Math.max(0, PEAK_TIME_HOURS - hoursSinceDose).toFixed(1)}h`);

    return {
      labels,
      datasets: [
        {
          label: 'System Level',
          data: dataPoints,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6
        }
      ]
    };
  };

  useEffect(() => {
    const data = calculatePharmacokinetics();
    setGlp1Data(data);
  }, [recentDoses, userStack, availablePeptides]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#d1d5db',
        borderColor: '#374151',
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            return `System Level: ${context.parsed.y.toFixed(1)}%`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(55, 65, 81, 0.3)',
          drawBorder: false
        },
        ticks: {
          color: '#9ca3af',
          font: {
            size: 10
          }
        }
      },
      y: {
        min: 0,
        max: 100,
        grid: {
          color: 'rgba(55, 65, 81, 0.3)',
          drawBorder: false
        },
        ticks: {
          color: '#9ca3af',
          font: {
            size: 10
          },
          callback: (value) => `${value}%`
        }
      }
    },
    interaction: {
      mode: 'index',
      intersect: false
    }
  };

  if (!glp1Data) {
    return (
      <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">System Levels</h2>
          <span className="text-cyan-400 text-sm">GLP-1 Analog</span>
        </div>
        
        <div className="bg-gray-900/50 rounded-xl p-4 mb-4 border border-gray-700">
          <div className="relative h-32 bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-2 opacity-60">💉</div>
              <p className="text-gray-400 text-sm">No GLP-1 peptides configured</p>
            </div>
          </div>
        </div>
        
        <div className="text-center p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <span className="text-cyan-400 text-xs">
            Configure Tirzepatide or Retatrutide to see pharmacokinetics
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">System Levels</h2>
        <span className="text-cyan-400 text-sm">GLP-1 Analog</span>
      </div>
      
      <div className="bg-gray-900/50 rounded-xl p-4 mb-4 border border-gray-700">
        <div className="relative h-32">
          <Line data={glp1Data} options={chartOptions} />
        </div>
        
        <div className="grid grid-cols-4 gap-2 text-xs text-gray-400 mt-2">
          <div>Dose</div>
          <div className="text-center">1d</div>
          <div className="text-center">3d</div>
          <div className="text-right">7d</div>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3 text-sm mb-4">
        <div className="text-center p-2 bg-gray-700/50 rounded-lg">
          <div className="text-cyan-400 font-semibold">{currentLevel}%</div>
          <div className="text-gray-400 text-xs">Current</div>
        </div>
        <div className="text-center p-2 bg-gray-700/50 rounded-lg">
          <div className="text-green-400 font-semibold">{peakTime}</div>
          <div className="text-gray-400 text-xs">To Peak</div>
        </div>
        <div className="text-center p-2 bg-gray-700/50 rounded-lg">
          <div className="text-orange-400 font-semibold">{timeToNextDose}</div>
          <div className="text-gray-400 text-xs">Next Dose</div>
        </div>
      </div>
      
      <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-sm">💡</span>
          <span className="text-cyan-400 text-xs">
            Based on last dose timing and 7-day half-life pharmacokinetics
          </span>
        </div>
      </div>
    </div>
  );
};

export default PharmacokineticGraph;