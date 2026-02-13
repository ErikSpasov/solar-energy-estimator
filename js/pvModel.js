// ============================================================================
// PV MODEL - Calculates solar energy output from weather data
// ============================================================================
// This file estimates how much electricity a solar panel system will produce
// based on weather data and system configuration (panel angle, size, etc.)
// ============================================================================

const MJ_TO_KWH = 0.2777777778; // Conversion factor: 1 megajoule = 0.278 kilowatt-hours

/**
 * Main function: Estimate energy production
 * 
 * Takes weather data and system settings, returns estimated electricity output
 * 
 * @param {Object} dataset - Historical weather data (sunshine, temperature)
 * @param {Object} cfg - System configuration (panel size, angle, location)
 * @returns {Object} - Energy estimates (daily, monthly, annual)
 */
export function estimateEnergy(dataset, cfg) {
  // Calculate energy for user's current configuration
  const currentConfig = calculateEnergyWithAngles(
    dataset,
    cfg,
    Number(cfg.tiltDeg),
    Number(cfg.azimuthDeg)
  );

  // TASK 2: Find optimal tilt and azimuth angles
  const advisory = findOptimalAngles(dataset, cfg);

  // Return results including advisory
  return {
    dailyKWh: currentConfig.dailyKWh,
    monthlyKWh: currentConfig.monthlyKWh,
    annualKWh: currentConfig.annualKWh,
    avgDaily: currentConfig.avgDaily,
    avgMonthly: currentConfig.avgMonthly,
    advisory
  };
}

// ============================================================================
// TASK 2: ADVISORY OPTIMIZATION - Find best panel angles
// ============================================================================
// Tests many different angle combinations to find which produces most energy
// This tells users if they could get more electricity by adjusting their panels
// ============================================================================

/**
 * Find optimal tilt and azimuth angles
 * 
 * Tests 121 different angle combinations (11 tilts × 11 azimuths)
 * to find which configuration produces the most energy
 * 
 * @param {Object} dataset - Weather data
 * @param {Object} cfg - System configuration
 * @returns {Object} - Optimal angles and potential energy
 */
function findOptimalAngles(dataset, cfg) {
  const latitude = Number(cfg.latitude);
  
  // Test these tilt angles (0° to 60°)
  const tiltTests = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
  
  // Test these azimuth angles (-90° to +90°)
  const azimuthTests = [-90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90];
  
  let maxEnergy = 0;
  let optimalTiltDeg = Math.round(Math.abs(latitude)); // Default: latitude rule of thumb
  let optimalAzimuthDeg = 0; // Default: south/north facing
  
  // Test every combination of tilt and azimuth
  for (const tilt of tiltTests) {
    for (const azimuth of azimuthTests) {
      
      // Calculate annual energy for this angle combination
      const result = calculateEnergyWithAngles(dataset, cfg, tilt, azimuth);
      
      // Is this better than our current best?
      if (result.annualKWh > maxEnergy) {
        maxEnergy = result.annualKWh;
        optimalTiltDeg = tilt;
        optimalAzimuthDeg = azimuth;
      }
    }
  }
  
  // Return the best angles we found
  return {
    optimalTiltDeg,
    optimalAzimuthDeg,
    potentialAnnualKWh: round2(maxEnergy)
  };
}

/**
 * Calculate energy for specific tilt/azimuth angles
 * 
 * This is the same calculation as the main function,
 * but lets us test different angles without changing user's config
 * 
 * @param {Object} dataset - Weather data
 * @param {Object} cfg - System configuration
 * @param {number} tilt - Panel angle to test
 * @param {number} azimuth - Panel direction to test
 * @returns {Object} - Energy results for this configuration
 */
function calculateEnergyWithAngles(dataset, cfg, tilt, azimuth) {
  const latitude = Number(cfg.latitude);
  const dailyKWh = {};

  // Process each day of weather data
  for (const p of dataset.points) {
    
    // STEP 1: Get sunshine data from weather service
    const G_horizontal = (Number(p.shortwaveRadiationMJm2) || 0) * MJ_TO_KWH;
    
    // STEP 2: Adjust for panel angle (using the angles we're testing)
    const tiltFactor = calculateTiltFactor(latitude, tilt, azimuth, p.dateTime);
    const G_tilted = G_horizontal * tiltFactor;
    
    // STEP 3: Calculate electricity produced
    const E_day =
      G_tilted *
      Number(cfg.systemCapacityKwp) *
      Number(cfg.performanceRatio);

    dailyKWh[p.dateTime] = round2(E_day);
  }

  // Aggregate into monthly and annual totals
  const monthlyKWh = aggregateMonthly(dailyKWh);
  const annualKWh = round2(Object.values(monthlyKWh).reduce((a, b) => a + b, 0));
  const avgDaily = round2(avg(Object.values(dailyKWh)));
  const avgMonthly = round2(avg(Object.values(monthlyKWh)));

  return { dailyKWh, monthlyKWh, annualKWh, avgDaily, avgMonthly };
}

// ============================================================================
// TILT CORRECTION - Adjusts for panel angle
// ============================================================================
// Solar panels at different angles receive different amounts of sunlight
// This function calculates how much more (or less) a tilted panel receives
// compared to a flat horizontal surface
// ============================================================================

/**
 * Calculate tilt correction factor
 * 
 * Determines how panel angle affects the amount of sunlight received.
 * A factor of 1.0 means same as horizontal, 1.2 means 20% more, 0.8 means 20% less.
 * 
 * @param {number} latitude - Location north/south position
 * @param {number} tilt - Panel angle (0° = flat, 90° = vertical)
 * @param {number} azimuth - Panel direction (0° = south, -90° = east, 90° = west)
 * @param {string} dateStr - Date in format "YYYY-MM-DD"
 * @returns {number} Correction factor (typically 0.3 to 1.5)
 */
function calculateTiltFactor(latitude, tilt, azimuth, dateStr) {
  
  // Special case: flat panels don't need correction
  if (tilt === 0) return 1.0;
  
  const date = new Date(dateStr);
  const dayOfYear = getDayOfYear(date); // 1-365
  
  // STEP 1: Calculate sun's position in the sky
  // The sun moves north and south throughout the year (seasons)
  // Declination = how far north/south the sun is (-23.45° to +23.45°)
  const declination = 23.45 * Math.sin(toRadians((360 / 365) * (dayOfYear - 81)));
  
  // STEP 2: Calculate how high the sun gets at noon (solar elevation)
  // Higher latitude = lower sun angle
  const latRad = toRadians(latitude);
  const decRad = toRadians(declination);
  
  const solarElevation = toDegrees(
    Math.asin(
      Math.sin(latRad) * Math.sin(decRad) +  // Latitude effect
      Math.cos(latRad) * Math.cos(decRad)    // Seasonal effect
    )
  );
  
  // If sun is below horizon (nighttime), minimal radiation only
  if (solarElevation <= 0) return 0.1;
  
  // STEP 3: Determine sun's direction at noon
  // Northern hemisphere: sun is in the south
  // Southern hemisphere: sun is in the north
  const solarAzimuth = latitude >= 0 ? 0 : 180;
  
  // STEP 4: Calculate angle between sun rays and panel surface
  // This determines how directly sunlight hits the panel
  const tiltRad = toRadians(tilt);
  const solarElevRad = toRadians(solarElevation);
  const azimuthDiff = toRadians(Math.abs(solarAzimuth - azimuth));
  
  // Angle of incidence (using spherical trigonometry)
  const cosIncidence = 
    Math.sin(solarElevRad) * Math.cos(tiltRad) +           // Elevation contribution
    Math.cos(solarElevRad) * Math.sin(tiltRad) * Math.cos(azimuthDiff); // Direction contribution
  
  // Prevent calculation errors
  const boundedCos = Math.max(-1, Math.min(1, cosIncidence));
  const incidenceAngle = toDegrees(Math.acos(boundedCos));
  
  // STEP 5: Check if sun is behind the panel
  if (incidenceAngle > 90) {
    // Panel facing away from sun - only gets indirect (diffuse) light
    // Diffuse radiation comes from all directions (clouds, sky reflection)
    return 0.5 * (1 + Math.cos(tiltRad)); // Reduced factor for diffuse light only
  }
  
  // STEP 6: Calculate the tilt correction factor
  // Formula: Factor = cos(incidence) / cos(zenith)
  // This gives the ratio of tilted surface radiation to horizontal radiation
  const zenithAngle = 90 - solarElevation;
  const zenithRad = toRadians(zenithAngle);
  const cosZenith = Math.max(0.01, Math.cos(zenithRad)); // Avoid division by zero
  
  const tiltFactor = Math.cos(toRadians(incidenceAngle)) / cosZenith;
  
  // STEP 7: Keep factor within realistic bounds
  // Even poorly oriented panels get some light: minimum 0.3
  // Perfectly oriented panels can't exceed physical limits: maximum 1.5
  return Math.max(0.3, Math.min(1.5, tiltFactor));
}

// ============================================================================
// HELPER FUNCTIONS - Supporting calculations
// ============================================================================

/**
 * Get day number of the year (1-365)
 * Example: January 1 = 1, December 31 = 365
 */
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Convert degrees to radians
 * (Math functions use radians, but humans think in degrees)
 */
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

/**
 * Aggregate daily energy into monthly totals
 * Groups days by month and sums their energy output
 */
function aggregateMonthly(dailyMap) {
  const monthly = {};
  
  for (const [dateStr, val] of Object.entries(dailyMap)) {
    const month = dateStr.slice(0, 7); // Extract "YYYY-MM" from "YYYY-MM-DD"
    
    // Add this day's energy to the monthly total
    monthly[month] = round2((monthly[month] || 0) + (Number(val) || 0));
  }
  
  return monthly;
}

/**
 * Calculate average of an array of numbers
 */
function avg(arr) {
  if (!arr.length) return 0;
  const sum = arr.reduce((a, b) => a + (Number(b) || 0), 0);
  return sum / arr.length;
}

/**
 * Round number to 2 decimal places
 * Example: 123.456789 → 123.46
 */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}