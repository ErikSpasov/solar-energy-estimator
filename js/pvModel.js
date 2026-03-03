// ============================================================================
// PV MODEL - Calculates solar energy output from weather data
// ============================================================================
// This file estimates how much electricity a solar panel system will produce
// based on weather data and system configuration (panel angle, size, etc.)
// ============================================================================

const MJ_TO_KWH      = 0.2777777778; // Conversion factor: 1 megajoule = 0.278 kilowatt-hours
const SOLAR_CONSTANT = 1367;          // W/m² — extraterrestrial solar irradiance (solar constant)
const ALBEDO         = 0.2;           // Ground reflectance (typical for grass/soil)

// Faiman cell temperature model parameters (matching PVGIS defaults for free-standing arrays)
// Reference: Faiman (2008), Progress in Photovoltaics
const U0      = 25.0;   // W/m²/°C — constant heat loss (radiation + natural convection)
const U1      = 6.84;   // W/m²/°C per m/s — wind-driven convective heat loss
const GAMMA_T = -0.004; // /°C — temperature coefficient of power (crystalline Si: −0.4 %/°C)
const T_STC   = 25;     // °C — Standard Test Condition reference temperature

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

    // STEP 1: Get global horizontal irradiance from weather data (GHI)
    const GHI_kWh = (Number(p.shortwaveRadiationMJm2) || 0) * MJ_TO_KWH;

    // STEP 2: Transpose to plane-of-array using the Hay-Davies model.
    // This decomposes GHI → beam + diffuse (Erbs), then applies the
    // anisotropic sky model to get the irradiance on the tilted panel surface.
    const G_poa = calculateHayDaviesPOA(GHI_kWh, latitude, tilt, azimuth, p.dateTime);

    // STEP 3: Temperature derating — Faiman cell temperature model.
    // Panels heat above ambient temperature proportionally to irradiance
    // and inversely proportional to wind cooling. Efficiency drops ~0.4%/°C
    // above 25°C (STC); cold days give a small efficiency boost.
    const dayOfYear   = getDayOfYear(new Date(p.dateTime));
    const declination = 23.45 * Math.sin(toRadians((360 / 365) * (dayOfYear - 81)));
    const dlHours     = daylightHours(latitude, declination);
    const T_cell      = faimanCellTemp(p.temperatureC, G_poa, dlHours, p.windSpeedMs);
    const f_temp      = temperatureCorrFactor(T_cell);

    // STEP 4: Calculate electricity produced
    const E_day =
      G_poa *
      Number(cfg.systemCapacityKwp) *
      Number(cfg.performanceRatio) *
      f_temp;

    dailyKWh[p.dateTime] = round2(E_day);
  }

  // Aggregate into monthly and annual totals
  const monthlyKWh = aggregateMonthly(dailyKWh);
  const totalKWh = Object.values(monthlyKWh).reduce((a, b) => a + b, 0);
  const numYears = new Set(Object.keys(dailyKWh).map(d => d.slice(0, 4))).size || 1;
  const annualKWh = round2(totalKWh / numYears);
  const avgDaily = round2(avg(Object.values(dailyKWh)));
  const avgMonthly = round2(avg(Object.values(monthlyKWh)));

  return { dailyKWh, monthlyKWh, annualKWh, avgDaily, avgMonthly };
}

// ============================================================================
// IRRADIANCE DECOMPOSITION - Erbs (1982) Model
// ============================================================================
// Open-Meteo provides only total (global) horizontal irradiance (GHI).
// Before applying any tilt model we must split GHI into its two components:
//   - Beam horizontal irradiance (BHI) — direct sunlight on a flat surface
//   - Diffuse horizontal irradiance (DHI) — scattered sky radiation
// The Erbs et al. (1982) clearness-index correlation is the standard method
// for this decomposition from daily totals.
// ============================================================================

/**
 * Compute daily extraterrestrial irradiation on a horizontal surface (H0).
 *
 * Integrates solar irradiance over all daylight hours using the standard
 * Duffie-Beckman formula. H0 is used as the denominator of the clearness
 * index Kt = GHI / H0, which drives the Erbs decomposition.
 *
 * @param {number} latitude      - degrees (negative = southern hemisphere)
 * @param {number} declinationDeg - solar declination in degrees (-23.45 to +23.45)
 * @param {number} dayOfYear     - 1–365
 * @returns {number} H0 in kWh/m²/day
 */
function extraterrestrialIrradiation(latitude, declinationDeg, dayOfYear) {
  // Earth–Sun distance correction (eccentricity)
  const E0 = 1 + 0.033 * Math.cos(toRadians(360 * dayOfYear / 365));

  const latRad = toRadians(latitude);
  const decRad = toRadians(declinationDeg);

  // Sunset hour angle ωs — angle from solar noon to sunset
  const cosSunset = -Math.tan(latRad) * Math.tan(decRad);
  if (cosSunset >= 1) return 0;                              // Polar night — no sun
  const sunsetRad = cosSunset <= -1 ? Math.PI : Math.acos(cosSunset); // Midnight sun → π

  // Daily H0 [Wh/m²] — Duffie & Beckman equation 1.10.3
  // H0 = (24/π) × SC × E0 × [cos(φ)cos(δ)sin(ωs) + ωs·sin(φ)sin(δ)]
  const H0_Wh = (24 / Math.PI) * SOLAR_CONSTANT * E0 * (
    Math.cos(latRad) * Math.cos(decRad) * Math.sin(sunsetRad) +
    sunsetRad * Math.sin(latRad) * Math.sin(decRad)
  );

  return H0_Wh / 1000; // Convert W·h → kWh
}

/**
 * Decompose GHI into diffuse (DHI) and beam horizontal (BHI) irradiance
 * using the Erbs et al. (1982) clearness-index correlation.
 *
 * Reference: Erbs, Klein & Duffie, Solar Energy 28(4), 1982.
 *
 * @param {number} GHI - Global Horizontal Irradiance in kWh/m²/day
 * @param {number} H0  - Extraterrestrial horizontal irradiation in kWh/m²/day
 * @returns {{ DHI: number, BHI: number }} Both in kWh/m²/day
 */
function erbsDecomposition(GHI, H0) {
  if (H0 <= 0 || GHI <= 0) return { DHI: 0, BHI: 0 };

  const Kt = Math.min(1, GHI / H0); // Clearness index (0 = fully overcast, 1 = perfectly clear)

  // Three-regime polynomial for diffuse fraction Kd = DHI / GHI
  let Kd;
  if (Kt <= 0.22) {
    // Overcast: almost all radiation is diffuse
    Kd = 1 - 0.09 * Kt;
  } else if (Kt <= 0.80) {
    // Partly cloudy: polynomial fit to measured data
    Kd = 0.9511 - 0.1604 * Kt + 4.388 * Kt ** 2 - 16.638 * Kt ** 3 + 12.336 * Kt ** 4;
  } else {
    // Clear sky: ~16.5 % of global radiation remains diffuse
    Kd = 0.165;
  }

  Kd = Math.max(0, Math.min(1, Kd)); // Physical bounds
  const DHI = Kd * GHI;
  const BHI = GHI - DHI;             // = (1 − Kd) × GHI

  return { DHI, BHI };
}

// ============================================================================
// HAY-DAVIES TRANSPOSITION MODEL
// ============================================================================
// Converts horizontal irradiance (GHI) into Plane-of-Array irradiance (POA)
// for a tilted, azimuth-oriented panel surface.
//
// The Hay-Davies model (1980) is an anisotropic sky model that treats
// diffuse radiation as two components:
//   1. Circumsolar — concentrated around the solar disc, behaves like beam
//   2. Isotropic   — uniformly spread across the whole sky dome
//
// The anisotropy index Ai (= BHI / H0) controls the weighting between them.
// A clear day has high Ai (most diffuse is circumsolar); an overcast day
// has Ai ≈ 0 (all diffuse is isotropic).
//
// Final formula:
//   G_poa = BHI·Rb  +  DHI·[Ai·Rb + (1−Ai)·(1+cosβ)/2]  +  ρ·GHI·(1−cosβ)/2
//              beam       circumsolar    isotropic diffuse      ground-reflected
// ============================================================================

/**
 * Calculate Plane-of-Array (POA) irradiance using the Hay-Davies model.
 *
 * Uses daily total GHI from Open-Meteo and noon-angle solar geometry as a
 * representative geometry for the day (standard approach for daily-resolution
 * transposition).
 *
 * @param {number} GHI_kWh  - Global Horizontal Irradiance in kWh/m²/day
 * @param {number} latitude  - degrees (negative = southern hemisphere)
 * @param {number} tilt      - panel tilt in degrees (0 = flat, 90 = vertical)
 * @param {number} azimuth   - panel azimuth in degrees (0 = south, −90 = east, +90 = west)
 * @param {string} dateStr   - "YYYY-MM-DD"
 * @returns {number} G_poa in kWh/m²/day
 */
function calculateHayDaviesPOA(GHI_kWh, latitude, tilt, azimuth, dateStr) {
  if (GHI_kWh <= 0) return 0;
  if (tilt === 0) return GHI_kWh; // Flat panel: horizontal surface IS the plane of array

  const date     = new Date(dateStr);
  const dayOfYear = getDayOfYear(date);
  const tiltRad  = toRadians(tilt);

  // Solar declination (Spencer 1971)
  const declination = 23.45 * Math.sin(toRadians((360 / 365) * (dayOfYear - 81)));

  // --- Step 1: Extraterrestrial irradiation and GHI decomposition ---
  const H0 = extraterrestrialIrradiation(latitude, declination, dayOfYear);
  const { DHI, BHI } = erbsDecomposition(GHI_kWh, H0);

  // --- Step 2: Noon solar geometry ---
  const latRad = toRadians(latitude);
  const decRad = toRadians(declination);

  // Solar elevation at solar noon
  const sinElev      = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad);
  const solarElevDeg = toDegrees(Math.asin(Math.max(-1, Math.min(1, sinElev))));

  // Zenith angle and its cosine (avoid division by zero near horizon)
  const cosZenith = Math.max(0.01, Math.cos(toRadians(90 - solarElevDeg)));

  // --- Step 3: Angle of incidence on the tilted surface at solar noon ---
  // Solar azimuth at noon: 0° (south) for NH, 180° for SH — matching our sign convention
  const solarAzimuthNoon = latitude >= 0 ? 0 : 180;
  const azimuthDiffRad   = toRadians(Math.abs(solarAzimuthNoon - azimuth));
  const solarElevRad     = toRadians(solarElevDeg);

  // cos(θ_i): positive = beam hits the front face, 0 = grazing, negative = behind panel
  const cosIncidence = Math.max(0,
    Math.sin(solarElevRad) * Math.cos(tiltRad) +
    Math.cos(solarElevRad) * Math.sin(tiltRad) * Math.cos(azimuthDiffRad)
  );

  // --- Step 4: Geometric ratios ---
  // Rb — ratio of beam irradiance on the tilted surface to beam on horizontal
  const Rb = cosIncidence / cosZenith;

  // Anisotropy index Ai — fraction of diffuse that behaves like beam (circumsolar)
  // Daily approximation: Ai = BHI / H0  (≈ DNI / I₀ integrated over the day)
  const Ai = H0 > 0 ? Math.max(0, Math.min(1, BHI / H0)) : 0;

  // --- Step 5: Hay-Davies POA components ---
  const G_beam    = BHI * Rb;
  const G_diffuse = DHI * (Ai * Rb + (1 - Ai) * (1 + Math.cos(tiltRad)) / 2);
  const G_ground  = ALBEDO * GHI_kWh * (1 - Math.cos(tiltRad)) / 2;

  return Math.max(0, G_beam + G_diffuse + G_ground);
}

// ============================================================================
// TEMPERATURE DERATING - Faiman Cell Temperature Model
// ============================================================================
// PV panels lose efficiency as they heat up. A crystalline silicon panel
// loses ~0.4% of its rated power for every 1°C above 25°C (STC).
// The Faiman (2008) model estimates the actual cell temperature from:
//   - Ambient air temperature (from Open-Meteo)
//   - Mean daytime irradiance on the panel surface
//   - Wind speed (wind cools the panel)
//
// This is the same model used internally by PVGIS.
// ============================================================================

/**
 * Estimate the number of daylight hours for a given day and location.
 *
 * Derived from the sunset hour angle ωs (the angular distance from solar noon
 * to sunset). One full day = 2π radians = 24 hours, so:
 *   daylight_hours = 2 × ωs × (24 / 2π) = 24ωs / π
 *
 * @param {number} latitude      - degrees
 * @param {number} declinationDeg - solar declination in degrees
 * @returns {number} Approximate number of daylight hours (0–24)
 */
function daylightHours(latitude, declinationDeg) {
  const latRad = toRadians(latitude);
  const decRad = toRadians(declinationDeg);

  const cosSunset = -Math.tan(latRad) * Math.tan(decRad);
  if (cosSunset >= 1) return 0;           // Polar night
  if (cosSunset <= -1) return 24;         // Midnight sun

  const sunsetRad = Math.acos(cosSunset);
  return (24 / Math.PI) * sunsetRad;      // Hours of daylight
}

/**
 * Estimate PV cell temperature using the Faiman (2008) model.
 *
 * The model computes how much the panel heats above ambient air temperature
 * based on the irradiance it absorbs and how well wind cools it:
 *
 *   T_cell = T_ambient + G_mean / (U0 + U1 × wind_speed)
 *
 * G_mean (W/m²) is the mean irradiance during daylight hours, derived from
 * the daily POA total divided by the number of daylight hours.
 *
 * Defaults used when data is unavailable:
 *   - temperatureC → 20°C (mild temperate assumption)
 *   - windSpeedMs  → 1.0 m/s (light breeze — conservative cooling)
 *
 * @param {number|null} temperatureC - Ambient air temperature in °C
 * @param {number}      G_poa_kWh   - Daily POA irradiance in kWh/m²/day
 * @param {number}      dlHours     - Daylight hours for this day
 * @param {number|null} windSpeedMs - Mean wind speed in m/s
 * @returns {number} Estimated cell temperature in °C
 */
function faimanCellTemp(temperatureC, G_poa_kWh, dlHours, windSpeedMs) {
  const T_amb = temperatureC ?? 20;       // Default: mild temperate day
  const v     = windSpeedMs  ?? 1.0;      // Default: light breeze

  // Convert daily kWh/m² to mean W/m² during daylight hours
  const G_mean_W = dlHours > 0 ? (G_poa_kWh * 1000) / dlHours : 0;

  return T_amb + G_mean_W / (U0 + U1 * v);
}

/**
 * Calculate the temperature correction factor for PV power output.
 *
 * Uses the linear temperature coefficient γ (GAMMA_T):
 *   f_T = 1 + γ × (T_cell − T_STC)
 *
 * At T_STC (25°C) → f_T = 1.0 (no correction, rated conditions).
 * Above 25°C → f_T < 1 (efficiency loss, e.g. 0.92 at 44°C for c-Si).
 * Below 25°C → f_T > 1 (efficiency gain, e.g. 1.04 at 15°C — cold boosts output).
 *
 * Clamped to [0.5, 1.2] to prevent physically impossible values from
 * extreme edge-case inputs.
 *
 * @param {number} T_cell - Cell temperature in °C
 * @returns {number} Multiplicative correction factor
 */
function temperatureCorrFactor(T_cell) {
  const f = 1 + GAMMA_T * (T_cell - T_STC);
  return Math.max(0.5, Math.min(1.2, f));
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