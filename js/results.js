// ===== Helpers =====
const el = (id) => document.getElementById(id);

function fmt(n, decimals = 0) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

function safeParse(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ===== Load config =====
const cfg = safeParse("userConfiguration");

// Basic guard
const statusText = el("statusText");
if (!cfg) {
  statusText.textContent = "Missing configuration. Go back and run Locate Me + fill inputs.";
} else {
  statusText.textContent = `Location: ${cfg.latitude}, ${cfg.longitude} | Period: ${cfg.startDate} → ${cfg.endDate}`;
}

// ===== Mock result generator =====
// We generate reasonable-looking values that scale with systemCapacityKwp and PR.
// This is NOT the real physics yet — just for UI wiring.
function generateMockResult(config) {
  const cap = Number(config?.systemCapacityKwp ?? 4);     // kWp
  const pr = Number(config?.performanceRatio ?? 0.85);    // 0–1

  // Annual baseline per kWp (very rough typical UK-ish ballpark)
  const annualPerKwp = 950; // kWh per kWp per year (mock)
  const annual = cap * annualPerKwp * pr;

  // Seasonal monthly weights (sum ~ 1)
  const weights = [0.04,0.06,0.09,0.10,0.11,0.11,0.11,0.10,0.08,0.07,0.06,0.07];
  const monthly = weights.map(w => annual * w);

  // Daily (last 30 days) – oscillate around avg daily
  const dailyAvg = annual / 365;
  const daily = Array.from({ length: 30 }, (_, i) => {
    const wave = Math.sin((i / 30) * Math.PI * 2); // -1..1
    const noise = (Math.random() - 0.5) * 2;       // -1..1
    const val = dailyAvg * (1 + 0.25 * wave) + noise;
    return Math.max(0, val);
  });

  return {
    annualKWh: annual,
    monthlyKWh: monthly, // 12 values
    dailyKWh: daily,     // 30 values
    optimalTiltDeg: Math.min(45, Math.max(15, Number(config?.tiltDeg ?? 30))), // mock “advisory”
    optimalAzimuthDeg: 0 // mock “south”
  };
}

// Either use stored estimationResult (later), or generate mock now
let result = safeParse("estimationResult");
if (!result) {
  result = generateMockResult(cfg);
  localStorage.setItem("estimationResult", JSON.stringify(result));
}

// ===== Render KPIs =====
const kpiAnnual = el("kpiAnnual");
const kpiMonthlyAvg = el("kpiMonthlyAvg");
const kpiDailyAvg = el("kpiDailyAvg");

const annual = Number(result.annualKWh);
const monthlyAvg = annual / 12;
const dailyAvg = annual / 365;

kpiAnnual.textContent = fmt(annual, 0);
kpiMonthlyAvg.textContent = fmt(monthlyAvg, 0);
kpiDailyAvg.textContent = fmt(dailyAvg, 1);

// Advisory
el("optTilt").textContent = Number.isFinite(result.optimalTiltDeg) ? `${fmt(result.optimalTiltDeg, 0)}°` : "—";
el("optAzimuth").textContent = Number.isFinite(result.optimalAzimuthDeg) ? `${fmt(result.optimalAzimuthDeg, 0)}°` : "—";

// ===== Charts =====
let monthlyChart;
let dailyChart;

function renderMonthlyChart() {
  const ctx = el("monthlyChart");
  if (!ctx) return;

  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const data = (result.monthlyKWh || []).map(Number);

  monthlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Energy (kWh)", data }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderDailyChart() {
  const ctx = el("dailyChart");
  if (!ctx) return;

  const data = (result.dailyKWh || []).map(Number);
  const labels = data.map((_, i) => `Day ${i + 1}`);

  dailyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Energy (kWh)", data, tension: 0.25 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

renderMonthlyChart();
renderDailyChart();

// ===== Export CSV (simple mock export) =====
const btnExportCsv = el("btnExportCsv");
if (btnExportCsv) {
  btnExportCsv.addEventListener("click", () => {
    const rows = [];
    rows.push(["type", "index", "kWh"].join(","));

    (result.monthlyKWh || []).forEach((v, i) => rows.push(["month", i + 1, Number(v).toFixed(2)].join(",")));
    (result.dailyKWh || []).forEach((v, i) => rows.push(["day", i + 1, Number(v).toFixed(2)].join(",")));

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "solar-estimate-mock.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}