/**
 * UNIT TESTS — Input Validation (validator.js)
 *
 * These tests check the two functions that decide whether the user's
 * form input is complete and valid before allowing a calculation to run.
 *
 *   toNumber   — safely converts a form field string to a number (or null)
 *   isValidConfig — returns true only when every field is present and
 *                   within its allowed range
 *
 * Why this matters: if validation is too strict, users can never calculate.
 * If it is too loose, bad data reaches the PV model and produces nonsense.
 */

import { toNumber, isValidConfig } from '../js/validator.js';


// ============================================================================
// toNumber
// Converts raw string values from HTML inputs into usable numbers.
// Returns null for anything that cannot be a valid number.
// ============================================================================
describe('toNumber', () => {

  test('converts a valid integer string to a number', () => {
    expect(toNumber('4')).toBe(4);
  });

  test('converts a valid decimal string to a number', () => {
    expect(toNumber('3.14')).toBeCloseTo(3.14);
  });

  test('converts a negative number string correctly', () => {
    expect(toNumber('-90')).toBe(-90);
  });

  test('returns null for an empty string — field is blank', () => {
    expect(toNumber('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(toNumber(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(toNumber(undefined)).toBeNull();
  });

  test('returns null for a non-numeric string', () => {
    expect(toNumber('abc')).toBeNull();
  });

  test('returns null for Infinity — not a usable number', () => {
    expect(toNumber(Infinity)).toBeNull();
  });

});


// ============================================================================
// isValidConfig
// The Calculate button is only enabled when this returns true.
// Tests cover: missing fields, out-of-range values, and date ordering.
// ============================================================================

// A fully valid configuration — used as the base for all tests below
const VALID_CFG = {
  latitude:          51.5,
  longitude:        -0.12,
  systemCapacityKwp: 4.0,
  tiltDeg:           35,
  azimuthDeg:         0,
  performanceRatio:  0.85,
  startDate:        '2022-01-01',
  endDate:          '2024-12-31',
};

describe('isValidConfig', () => {

  test('returns true for a complete, valid configuration', () => {
    expect(isValidConfig(VALID_CFG)).toBe(true);
  });

  // --- Missing fields ---
  test('returns false when latitude is missing', () => {
    expect(isValidConfig({ ...VALID_CFG, latitude: null })).toBe(false);
  });

  test('returns false when longitude is missing', () => {
    expect(isValidConfig({ ...VALID_CFG, longitude: null })).toBe(false);
  });

  test('returns false when system capacity is missing', () => {
    expect(isValidConfig({ ...VALID_CFG, systemCapacityKwp: null })).toBe(false);
  });

  test('returns false when start date is missing', () => {
    expect(isValidConfig({ ...VALID_CFG, startDate: null })).toBe(false);
  });

  test('returns false when end date is missing', () => {
    expect(isValidConfig({ ...VALID_CFG, endDate: null })).toBe(false);
  });

  // --- Out-of-range values ---
  test('returns false when latitude is above 90° (north pole limit)', () => {
    expect(isValidConfig({ ...VALID_CFG, latitude: 91 })).toBe(false);
  });

  test('returns false when latitude is below -90°', () => {
    expect(isValidConfig({ ...VALID_CFG, latitude: -91 })).toBe(false);
  });

  test('returns false when longitude is above 180°', () => {
    expect(isValidConfig({ ...VALID_CFG, longitude: 181 })).toBe(false);
  });

  test('returns false when longitude is below -180°', () => {
    expect(isValidConfig({ ...VALID_CFG, longitude: -181 })).toBe(false);
  });

  test('returns false when system capacity is zero — cannot have a 0 kWp system', () => {
    expect(isValidConfig({ ...VALID_CFG, systemCapacityKwp: 0 })).toBe(false);
  });

  test('returns false when tilt is above 90° — panels cannot face downward', () => {
    expect(isValidConfig({ ...VALID_CFG, tiltDeg: 91 })).toBe(false);
  });

  test('returns false when tilt is negative', () => {
    expect(isValidConfig({ ...VALID_CFG, tiltDeg: -1 })).toBe(false);
  });

  test('returns false when performance ratio is 0', () => {
    expect(isValidConfig({ ...VALID_CFG, performanceRatio: 0 })).toBe(false);
  });

  test('returns false when performance ratio exceeds 1 — cannot be more than 100% efficient', () => {
    expect(isValidConfig({ ...VALID_CFG, performanceRatio: 1.01 })).toBe(false);
  });

  // --- Date ordering ---
  test('returns false when start date is after end date', () => {
    expect(isValidConfig({
      ...VALID_CFG,
      startDate: '2024-01-01',
      endDate:   '2022-01-01',
    })).toBe(false);
  });

  test('returns true when start and end date are the same day', () => {
    expect(isValidConfig({
      ...VALID_CFG,
      startDate: '2023-06-01',
      endDate:   '2023-06-01',
    })).toBe(true);
  });

  // --- Boundary values that should be valid ---
  test('accepts latitude of exactly 90° (north pole)', () => {
    expect(isValidConfig({ ...VALID_CFG, latitude: 90 })).toBe(true);
  });

  test('accepts performance ratio of exactly 1.0', () => {
    expect(isValidConfig({ ...VALID_CFG, performanceRatio: 1.0 })).toBe(true);
  });

  test('accepts tilt of 0° (flat panels on a flat roof)', () => {
    expect(isValidConfig({ ...VALID_CFG, tiltDeg: 0 })).toBe(true);
  });

  test('accepts tilt of 90° (panels on a vertical wall)', () => {
    expect(isValidConfig({ ...VALID_CFG, tiltDeg: 90 })).toBe(true);
  });

});
