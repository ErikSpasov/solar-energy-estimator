// ============================================================================
// VALIDATOR — pure helper functions with no browser/DOM dependencies.
// Kept in a separate file so the test suite can import them directly
// without needing a browser environment.
// ============================================================================

/**
 * Converts a raw input string/value to a finite number, or null if invalid.
 * Used to safely read values from HTML form fields.
 */
export function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Returns true only when every field in the config object is present
 * and within the physically valid range for a solar panel system.
 * The Calculate button is only enabled when this returns true.
 */
export function isValidConfig(cfg) {
  const required = [
    cfg.latitude,
    cfg.longitude,
    cfg.systemCapacityKwp,
    cfg.tiltDeg,
    cfg.azimuthDeg,
    cfg.performanceRatio,
    cfg.startDate,
    cfg.endDate
  ];

  if (required.some((x) => x === null || x === "")) return false;

  if (cfg.latitude < -90 || cfg.latitude > 90) return false;
  if (cfg.longitude < -180 || cfg.longitude > 180) return false;

  if (cfg.systemCapacityKwp <= 0) return false;
  if (cfg.tiltDeg < 0 || cfg.tiltDeg > 90) return false;
  if (cfg.azimuthDeg < -180 || cfg.azimuthDeg > 180) return false;

  if (cfg.performanceRatio <= 0 || cfg.performanceRatio > 1) return false;

  if (cfg.startDate > cfg.endDate) return false;

  return true;
}
