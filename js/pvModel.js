// Responsibility: take weatherDataset + userConfiguration, produce estimationResult

const MJ_TO_KWH = 0.2777777778; // 1 MJ = 0.277777... kWh

export function estimateEnergy(dataset, cfg) {
  // Capacity-based simplified approach you documented:
  // E_day = (G_kWhm2_day) * (systemCapacityKwp) * (performanceRatio)
  // where Open-Meteo G is shortwave_radiation_sum (MJ/m²/day) -> convert to kWh/m²/day
  const dailyKWh = {};

  for (const p of dataset.points) {
    const G_kWhm2 = (Number(p.shortwaveRadiationMJm2) || 0) * MJ_TO_KWH;

    // Simplified feasibility estimate (consistent with your report approach)
    const E_day =
      G_kWhm2 *
      Number(cfg.systemCapacityKwp) *
      Number(cfg.performanceRatio);

    dailyKWh[p.dateTime] = round2(E_day);
  }

  const monthlyKWh = aggregateMonthly(dailyKWh);
  const annualKWh = round2(Object.values(monthlyKWh).reduce((a, b) => a + b, 0));

  const avgDaily = round2(avg(Object.values(dailyKWh)));
  const avgMonthly = round2(avg(Object.values(monthlyKWh)));

  // Optional advisory (for now: just echo inputs or placeholders)
  const advisory = {
    optimalTiltDeg: cfg.tiltDeg ?? null,
    optimalAzimuthDeg: cfg.azimuthDeg ?? null
  };

  return {
    dailyKWh,
    monthlyKWh,
    annualKWh,
    avgDaily,
    avgMonthly,
    advisory
  };
}

function aggregateMonthly(dailyMap) {
  // dailyMap keys: "YYYY-MM-DD"
  const monthly = {};
  for (const [dateStr, val] of Object.entries(dailyMap)) {
    const month = dateStr.slice(0, 7); // "YYYY-MM"
    monthly[month] = round2((monthly[month] || 0) + (Number(val) || 0));
  }
  return monthly;
}

function avg(arr) {
  if (!arr.length) return 0;
  const s = arr.reduce((a, b) => a + (Number(b) || 0), 0);
  return s / arr.length;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}