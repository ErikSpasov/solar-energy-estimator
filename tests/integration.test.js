/**
 * INTEGRATION TESTS — Full pipeline (API fetch → PV model → results)
 *
 * These tests verify that the two main modules work correctly together:
 *   1. openMeteoArchiveClient.js — fetches and parses weather data from the API
 *   2. pvModel.js               — runs the solar energy calculation
 *
 * We do NOT make real network calls here. Instead, we replace the global
 * fetch function with a fake version that instantly returns a pre-written
 * API response. This makes tests fast, reliable, and usable offline.
 *
 * Why this matters: unit tests check individual functions in isolation,
 * but integration tests check that the pieces connect correctly — the
 * data coming out of the API client matches what the PV model expects.
 */

import { fetchHistoricalDaily } from '../js/openMeteoArchiveClient.js';
import { estimateEnergy }       from '../js/pvModel.js';


// ============================================================================
// A realistic Open-Meteo API response for 3 days in London, June 2023
// ============================================================================
const MOCK_API_RESPONSE = {
  latitude:  51.5,
  longitude: -0.12,
  daily: {
    time:                     ['2023-06-01', '2023-06-02', '2023-06-03'],
    shortwave_radiation_sum:  [20.4, 14.8, 5.2],   // MJ/m²/day
    temperature_2m_mean:      [18.1, 15.6, 12.3],  // °C
    wind_speed_10m_mean:      [3.1,  2.4,  4.8],   // m/s
  },
};

// Standard system config used across all integration tests
const CFG = {
  latitude:          51.5,
  longitude:        -0.12,
  systemCapacityKwp: 4.0,
  tiltDeg:           35,
  azimuthDeg:         0,
  performanceRatio:  0.85,
  startDate:        '2023-06-01',
  endDate:          '2023-06-03',
};


// ============================================================================
// fetchHistoricalDaily — API client tests (fetch is mocked)
// ============================================================================
describe('fetchHistoricalDaily', () => {

  beforeEach(() => {
    // Replace global fetch with a fake that returns the mock response above
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_API_RESPONSE),
      })
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('calls the Open-Meteo archive endpoint with the correct URL parameters', async () => {
    await fetchHistoricalDaily(51.5, -0.12, '2023-06-01', '2023-06-03');

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('archive-api.open-meteo.com');
    expect(calledUrl).toContain('latitude=51.5');
    expect(calledUrl).toContain('start_date=2023-06-01');
    expect(calledUrl).toContain('end_date=2023-06-03');
    expect(calledUrl).toContain('shortwave_radiation_sum');
  });

  test('returns a dataset with the correct number of daily data points', async () => {
    const dataset = await fetchHistoricalDaily(51.5, -0.12, '2023-06-01', '2023-06-03');
    expect(dataset.points).toHaveLength(3);
  });

  test('each data point has the fields the PV model expects', async () => {
    const dataset = await fetchHistoricalDaily(51.5, -0.12, '2023-06-01', '2023-06-03');
    dataset.points.forEach(point => {
      expect(point).toHaveProperty('dateTime');
      expect(point).toHaveProperty('shortwaveRadiationMJm2');
      expect(point).toHaveProperty('temperatureC');
      expect(point).toHaveProperty('windSpeedMs');
    });
  });

  test('throws a descriptive error when the API returns a non-OK response', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('Rate limited') })
    );

    await expect(
      fetchHistoricalDaily(51.5, -0.12, '2023-06-01', '2023-06-03')
    ).rejects.toThrow('429');
  });

  test('throws a descriptive error when the API response is missing the daily field', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ latitude: 51.5 }) })
    );

    await expect(
      fetchHistoricalDaily(51.5, -0.12, '2023-06-01', '2023-06-03')
    ).rejects.toThrow();
  });

});


// ============================================================================
// Full pipeline — API response flows correctly into the PV model
// ============================================================================
describe('Full pipeline: fetchHistoricalDaily → estimateEnergy', () => {

  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_API_RESPONSE),
      })
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('produces a positive annual energy estimate from a realistic API response', async () => {
    const dataset = await fetchHistoricalDaily(
      CFG.latitude, CFG.longitude, CFG.startDate, CFG.endDate
    );
    const result = estimateEnergy(dataset, CFG);
    expect(result.annualKWh).toBeGreaterThan(0);
  });

  test('output contains daily entries matching the dates returned by the API', async () => {
    const dataset = await fetchHistoricalDaily(
      CFG.latitude, CFG.longitude, CFG.startDate, CFG.endDate
    );
    const result = estimateEnergy(dataset, CFG);
    expect(result.dailyKWh['2023-06-01']).toBeDefined();
    expect(result.dailyKWh['2023-06-02']).toBeDefined();
    expect(result.dailyKWh['2023-06-03']).toBeDefined();
  });

  test('a sunnier day in the dataset produces more energy than a cloudy day', async () => {
    const dataset = await fetchHistoricalDaily(
      CFG.latitude, CFG.longitude, CFG.startDate, CFG.endDate
    );
    const result = estimateEnergy(dataset, CFG);

    // June 1 had 20.4 MJ/m² (sunny), June 3 had 5.2 MJ/m² (cloudy)
    expect(result.dailyKWh['2023-06-01']).toBeGreaterThan(result.dailyKWh['2023-06-03']);
  });

});
