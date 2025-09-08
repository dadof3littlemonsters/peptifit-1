export class PharmacokineticCalculator {
  static TIRZEPATIDE_HALF_LIFE = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds
  static RETATRUTIDE_HALF_LIFE = 6 * 24 * 60 * 60 * 1000; // 6 days in milliseconds
  
  static MAX_WEEKLY_TIRZEPATIDE = 15; // mg
  static MAX_WEEKLY_RETATRUTIDE = 12; // mg

  // Calculate system levels for a single dose over time
  static calculateDoseLevel(doseAmount, administrationTime, currentTime, halfLife) {
    const timeSinceDose = currentTime - administrationTime;
    
    // Absorption phase: 0-24 hours
    if (timeSinceDose < 24 * 60 * 60 * 1000) {
      const absorptionProgress = timeSinceDose / (24 * 60 * 60 * 1000);
      return doseAmount * absorptionProgress * 0.8; // 80% of peak during absorption
    }
    
    // Peak phase: 24-48 hours
    if (timeSinceDose < 48 * 60 * 60 * 1000) {
      return doseAmount * 0.95; // 95% of dose at peak
    }
    
    // Exponential decay after peak
    const timeSincePeak = timeSinceDose - (48 * 60 * 60 * 1000);
    const decayConstant = Math.log(2) / halfLife;
    return doseAmount * 0.95 * Math.exp(-decayConstant * timeSincePeak);
  }

  // Calculate cumulative levels for multiple doses of a specific peptide
  static calculateCumulativeLevels(doses, currentTime, peptideType) {
    const halfLife = peptideType === 'tirzepatide' 
      ? this.TIRZEPATIDE_HALF_LIFE 
      : this.RETATRUTIDE_HALF_LIFE;
    
    return doses.reduce((total, dose) => {
      const level = this.calculateDoseLevel(
        dose.amount,
        new Date(dose.administration_time).getTime(),
        currentTime,
        halfLife
      );
      return total + level;
    }, 0);
  }

  // Generate time series data for graphing
  static generateTimeSeries(doses, peptideType, hours = 168) { // 7 days
    const halfLife = peptideType === 'tirzepatide' 
      ? this.TIRZEPATIDE_HALF_LIFE 
      : this.RETATRUTIDE_HALF_LIFE;
    
    const now = Date.now();
    const data = [];
    
    for (let i = 0; i <= hours; i++) {
      const time = now + (i * 60 * 60 * 1000);
      let totalLevel = 0;
      
      doses.forEach(dose => {
        const doseTime = new Date(dose.administration_time).getTime();
        if (time >= doseTime) {
          totalLevel += this.calculateDoseLevel(dose.amount, doseTime, time, halfLife);
        }
      });
      
      data.push({
        time: new Date(time),
        level: totalLevel,
        hour: i
      });
    }
    
    return data;
  }

  // Validate weekly dose totals
  static validateWeeklyTotal(doses, peptideType) {
    const weeklyLimit = peptideType === 'tirzepatide' 
      ? this.MAX_WEEKLY_TIRZEPATIDE 
      : this.MAX_WEEKLY_RETATRUTIDE;
    
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentDoses = doses.filter(dose => 
      new Date(dose.administration_time).getTime() >= sevenDaysAgo
    );
    
    const totalWeekly = recentDoses.reduce((sum, dose) => sum + dose.amount, 0);
    
    return {
      isValid: totalWeekly <= weeklyLimit,
      totalWeekly,
      weeklyLimit,
      remaining: weeklyLimit - totalWeekly
    };
  }

  // Calculate time until next recommended dose
  static getNextDoseRecommendation(doses, peptideType, targetLevel = 0.1) {
    const currentLevel = this.calculateCumulativeLevels(doses, Date.now(), peptideType);
    
    if (currentLevel > targetLevel) {
      return {
        recommended: false,
        message: 'System levels adequate - no dose needed',
        currentLevel
      };
    }
    
    // Find when level drops below target
    const halfLife = peptideType === 'tirzepatide' 
      ? this.TIRZEPATIDE_HALF_LIFE 
      : this.RETATRUTIDE_HALF_LIFE;
    
    const decayConstant = Math.log(2) / halfLife;
    const timeUntilTarget = Math.log(currentLevel / targetLevel) / -decayConstant;
    
    return {
      recommended: true,
      message: `Consider next dose in ${Math.ceil(timeUntilTarget / (60 * 60 * 1000))} hours`,
      hoursUntil: Math.ceil(timeUntilTarget / (60 * 60 * 1000)),
      currentLevel
    };
  }

  // Get peak and trough information
  static getPeakTroughInfo(doses, peptideType) {
    if (doses.length === 0) return null;
    
    const timeSeries = this.generateTimeSeries(doses, peptideType, 168);
    const levels = timeSeries.map(point => point.level);
    
    const peakLevel = Math.max(...levels);
    const troughLevel = Math.min(...levels);
    const peakTime = timeSeries.find(point => point.level === peakLevel)?.time;
    const troughTime = timeSeries.find(point => point.level === troughLevel)?.time;
    
    return {
      peakLevel: Math.round(peakLevel * 100) / 100,
      troughLevel: Math.round(troughLevel * 100) / 100,
      peakTime,
      troughTime,
      fluctuation: Math.round(((peakLevel - troughLevel) / peakLevel) * 100)
    };
  }
}