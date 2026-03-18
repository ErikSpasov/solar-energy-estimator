/**
 * UNIT TESTS — PV Model (pvModel.js)
 *
 * These tests check the core solar energy maths one function at a time.
 * Each test feeds known inputs into a function and verifies the output
 * is correct (or within a physically sensible range).
 *
 * Why this matters: the PV model is the heart of the app — if its maths
 * are wrong, every energy estimate the user sees will be wrong.
 */

import {
  temperatureCorrFactor,
  faimanCellTemp,
  erbsDecomposition,
  extraterrestrialIrradiation,
  estimateEnergy,
} from '../js/pvModel.js';


// ============================================================================
// temperatureCorrFactor
// Panels lose ~0.4% efficiency for every °C above 25°C (standard test
// conditions). This function calculates that correction factor.
// ============================================================================
describe('temperatureCorrFactor', () => {

  test('returns exactly 1.0 at standard test condition temperature (25°C)', () => {
    expect(temperatureCorrFactor(25)).toBe(1.0);
  });

  test('returns less than 1 when panel is hotter than 25°C — efficiency drops', () => {
    expect(temperatureCorrFactor(45)).toBeCloseTo(0.92, 5); // 1 + (-0.004 * 20) = 0.92
  });

  test('returns greater than 1 when panel is colder than 25°C — cold gives a boost', () => {
    expect(temperatureCorrFactor(5)).toBeCloseTo(1.08, 5); // 1 + (-0.004 * -20) = 1.08
  });

  test('clamps at minimum 0.5 for extreme heat — prevents physically impossible values', () => {
    // At 200°C: 1 + (-0.004 * 175) = 0.3, but clamped to 0.5
    expect(temperatureCorrFactor(200)).toBe(0.5);
  });

  test('clamps at maximum 1.2 for extreme cold — prevents physically impossible values', () => {
    // At -125°C: 1 + (-0.004 * -150) = 1.6, but clamped to 1.2
    expect(temperatureCorrFactor(-125)).toBe(1.2);
  });

  test('correction factor is strictly between 0.5 and 1.2 for normal operating temperatures', () => {
    [0, 10, 20, 30, 40, 50, 60].forEach(t => {
      const f = temperatureCorrFactor(t);
      expect(f).toBeGreaterThanOrEqual(0.5);
      expect(f).toBeLessThanOrEqual(1.2);
    });
  });

});


// ============================================================================
// faimanCellTemp
// Estimates the actual temperature of the solar cell based on ambient air
// temperature, how much sunlight is hitting the panel, and wind cooling.
// ============================================================================
describe('faimanCellTemp', () => {

  test('cell temperature equals ambient when there is zero irradiance (night or full cloud)', () => {
    const result = faimanCellTemp(20, 0, 12, 2);
    expect(result).toBeCloseTo(20, 1);
  });

  test('cell temperature is hotter than ambient on a sunny day', () => {
    // 5 kWh/m² over 5 daylight hours = 1000 W/m² mean irradiance — very sunny
    const T_cell = faimanCellTemp(20, 5, 5, 1);
    expect(T_cell).toBeGreaterThan(20);
  });

  test('more wind means a cooler cell — wind removes heat from the panel surface', () => {
    const lowWind  = faimanCellTemp(20, 4, 8, 0.5);
    const highWind = faimanCellTemp(20, 4, 8, 5.0);
    expect(lowWind).toBeGreaterThan(highWind);
  });

  test('uses 20°C and 1 m/s as safe defaults when temperature and wind are null', () => {
    // Should not throw; result should be a finite number
    const result = faimanCellTemp(null, 3, 8, null);
    expect(Number.isFinite(result)).toBe(true);
  });

  test('returns a physically plausible temperature — between -30°C and 100°C for normal inputs', () => {
    const result = faimanCellTemp(15, 6, 10, 2);
    expect(result).toBeGreaterThan(-30);
    expect(result).toBeLessThan(100);
  });

});


// ============================================================================
// erbsDecomposition
// Takes total sunlight on a flat surface (GHI) and splits it into two parts:
//   - beam (BHI): direct sunlight
//   - diffuse (DHI): scattered sky light
// This split is needed before the Hay-Davies tilt model can run.
// ============================================================================
describe('erbsDecomposition', () => {

  test('returns zero beam and diffuse when there is no sunlight', () => {
    expect(erbsDecomposition(0, 10)).toEqual({ DHI: 0, BHI: 0 });
  });

  test('returns zero beam and diffuse when extraterrestrial irradiation is zero (polar night)', () => {
    expect(erbsDecomposition(5, 0)).toEqual({ DHI: 0, BHI: 0 });
  });

  test('overcast day (Kt ≤ 0.22): nearly all radiation is diffuse', () => {
    // GHI=2, H0=20 → Kt=0.1, very overcast
    const { DHI, BHI } = erbsDecomposition(2, 20);
    expect(DHI).toBeGreaterThan(BHI); // Most light is scattered (diffuse)
    expect(DHI + BHI).toBeCloseTo(2, 1); // Must sum back to GHI
  });

  test('clear sky day (Kt > 0.80): most radiation is direct beam', () => {
    // GHI=22, H0=25 → Kt=0.88, clear — Kd=0.165, so 83.5% is beam
    const { DHI, BHI } = erbsDecomposition(22, 25);
    expect(BHI).toBeGreaterThan(DHI); // Most light is direct beam
    expect(DHI + BHI).toBeCloseTo(22, 1);
  });

  test('DHI and BHI are always non-negative — no physically impossible values', () => {
    [[5, 25], [10, 15], [20, 22], [0.5, 8]].forEach(([ghi, h0]) => {
      const { DHI, BHI } = erbsDecomposition(ghi, h0);
      expect(DHI).toBeGreaterThanOrEqual(0);
      expect(BHI).toBeGreaterThanOrEqual(0);
    });
  });

  test('DHI + BHI equals GHI — energy is conserved in the decomposition', () => {
    const ghi = 12;
    const { DHI, BHI } = erbsDecomposition(ghi, 20);
    expect(DHI + BHI).toBeCloseTo(ghi, 4);
  });

});


// ============================================================================
// extraterrestrialIrradiation
// Calculates how much solar energy would hit a flat surface above the
// atmosphere (before clouds or air). Used as a reference to judge how
// clear or cloudy a day is.
// ============================================================================
describe('extraterrestrialIrradiation', () => {

  test('returns 0 during polar night (Arctic winter — sun never rises)', () => {
    // Latitude 90°N, winter solstice (dec = -23.45°, dayOfYear ≈ 355)
    const result = extraterrestrialIrradiation(90, -23.45, 355);
    expect(result).toBe(0);
  });

  test('returns a positive value at the equator on the spring equinox', () => {
    // Latitude 0°, declination ≈ 0°, dayOfYear ≈ 80
    const result = extraterrestrialIrradiation(0, 0, 80);
    expect(result).toBeGreaterThan(0);
  });

  test('equator at equinox receives roughly 10–12 kWh/m² extraterrestrially', () => {
    // Known reference value from solar energy textbooks
    const result = extraterrestrialIrradiation(0, 0, 80);
    expect(result).toBeGreaterThan(8);
    expect(result).toBeLessThan(13);
  });

  test('mid-latitude summer (London, June) receives more than mid-latitude winter', () => {
    const summer = extraterrestrialIrradiation(51.5, 23.45, 172);  // June solstice
    const winter = extraterrestrialIrradiation(51.5, -23.45, 355); // Dec solstice
    expect(summer).toBeGreaterThan(winter);
  });

});


// ============================================================================
// estimateEnergy (full pipeline)
// End-to-end test: feeds a small real-looking weather dataset through the
// entire model and checks the output has the right shape and sensible values.
// ============================================================================
describe('estimateEnergy — full pipeline', () => {

  // A minimal 3-day weather dataset for London in June (sunny-ish days)
  const dataset = {
    latitude: 51.5,
    longitude: -0.12,
    startDate: '2023-06-01',
    endDate:   '2023-06-03',
    points: [
      { dateTime: '2023-06-01', shortwaveRadiationMJm2: 20, temperatureC: 18, windSpeedMs: 3 },
      { dateTime: '2023-06-02', shortwaveRadiationMJm2: 15, temperatureC: 15, windSpeedMs: 2 },
      { dateTime: '2023-06-03', shortwaveRadiationMJm2: 5,  temperatureC: 12, windSpeedMs: 4 },
    ],
  };

  const cfg = {
    latitude:          51.5,
    longitude:        -0.12,
    systemCapacityKwp: 4,
    tiltDeg:           35,
    azimuthDeg:         0,   // south-facing
    performanceRatio:   0.85,
    startDate:        '2023-06-01',
    endDate:          '2023-06-03',
  };

  let result;
  beforeAll(() => { result = estimateEnergy(dataset, cfg); });

  test('result contains all expected output fields', () => {
    expect(result).toHaveProperty('dailyKWh');
    expect(result).toHaveProperty('monthlyKWh');
    expect(result).toHaveProperty('annualKWh');
    expect(result).toHaveProperty('avgDaily');
    expect(result).toHaveProperty('avgMonthly');
    expect(result).toHaveProperty('advisory');
  });

  test('produces a positive annual energy estimate for a sunny-location dataset', () => {
    expect(result.annualKWh).toBeGreaterThan(0);
  });

  test('daily energy output is recorded for each day in the dataset', () => {
    expect(Object.keys(result.dailyKWh)).toHaveLength(3);
  });

  test('no single day produces negative energy', () => {
    Object.values(result.dailyKWh).forEach(kWh => {
      expect(kWh).toBeGreaterThanOrEqual(0);
    });
  });

  test('advisory contains optimal tilt, azimuth, and potential annual output', () => {
    expect(result.advisory).toHaveProperty('optimalTiltDeg');
    expect(result.advisory).toHaveProperty('optimalAzimuthDeg');
    expect(result.advisory).toHaveProperty('potentialAnnualKWh');
  });

  test('advisory potential output is at least as good as current configuration', () => {
    expect(result.advisory.potentialAnnualKWh).toBeGreaterThanOrEqual(result.annualKWh);
  });

  test('a cloudy dataset (all zeros) produces zero energy output', () => {
    const cloudyDataset = {
      ...dataset,
      points: dataset.points.map(p => ({ ...p, shortwaveRadiationMJm2: 0 })),
    };
    const cloudyResult = estimateEnergy(cloudyDataset, cfg);
    expect(cloudyResult.annualKWh).toBe(0);
  });

  test('a larger system produces more energy than a smaller one (same weather)', () => {
    const bigSystem   = estimateEnergy(dataset, { ...cfg, systemCapacityKwp: 8 });
    const smallSystem = estimateEnergy(dataset, { ...cfg, systemCapacityKwp: 2 });
    expect(bigSystem.annualKWh).toBeGreaterThan(smallSystem.annualKWh);
  });

});
