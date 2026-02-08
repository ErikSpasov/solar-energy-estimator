import { fetchHistoricalDaily } from "./openMeteoArchiveClient.js";
import { estimateEnergy } from "./pvModel.js";

// ======= DOM helpers =======
const el = (id) => document.getElementById(id);

const statusText = el("statusText");           // you likely have this line under title
const metaLine = el("metaLine");               // location + period line

const annualEl = el("annualEnergy");
const avgMonthlyEl = el("avgMonthly");
const avgDailyEl = el("avgDaily");

const advisoryTiltEl = el("advisoryTilt");
const advisoryAzEl = el("advisoryAz");

const btnBack = el("btnBack");
const btnExportCsv = el("btnExportCsv");

// Chart canvases (must exist in your HTML)
const monthlyCanvas = el("monthlyChart");
const dailyCanvas = el("dailyChart");

let monthlyChart = null;
let dailyChart = null;

// ======= Load config =======
const cfgRaw = localStorage.getItem("userConfiguration");
if (!cfgRaw) {
  setStatus("Missing data. Please run an estimation first.", true);
  wireButtons(null, null);
} else {
  const cfg = JSON.parse(cfgRaw);
  run(cfg).catch((err) => {
    console.error(err);
    setStatus(`Open-Meteo error: ${err.message}`, true);
    wireButtons(cfg, null);
  });
}

async function run(cfg) {
  setStatus("Fetching historical data from Open-Meteo…", false);

  const dataset = await fetchHistoricalDaily(
    cfg.latitude,
    cfg.longitude,
    cfg.startDate,
    cfg.endDate
  );

  setStatus("Running PV estimation…", false);

  const result = estimateEnergy(dataset, cfg);

  // Save result if you want export later
  localStorage.setItem("estimationResult", JSON.stringify(result));

  renderMeta(cfg);
  renderKPIs(result);
  renderAdvisory(result);
  renderCharts(result);

  setStatus("Results loaded.", false);
  wireButtons(cfg, result);
}

// ======= Rendering =======
function renderMeta(cfg) {
  if (metaLine) {
    metaLine.textContent =
      `Location: ${cfg.latitude}, ${cfg.longitude} | Period: ${cfg.startDate} → ${cfg.endDate}`;
  }
}

function renderKPIs(result) {
  const dailyMap = result?.dailyKWh || {};
  const monthlyMap = result?.monthlyKWh || {};

  const dailyValues = Object.values(dailyMap).map(Number).filter(Number.isFinite);
  const monthlyValues = Object.values(monthlyMap).map(Number).filter(Number.isFinite);

  const annualFromMonthly = monthlyValues.reduce((a, b) => a + b, 0);
  const annualFromDaily = dailyValues.reduce((a, b) => a + b, 0);

  const annualKWh =
    Number.isFinite(Number(result?.annualKWh)) ? Number(result.annualKWh)
    : (monthlyValues.length ? annualFromMonthly : annualFromDaily);

  const avgDaily =
    Number.isFinite(Number(result?.avgDaily)) ? Number(result.avgDaily)
    : (dailyValues.length ? (annualFromDaily / dailyValues.length) : null);

  const avgMonthly =
    Number.isFinite(Number(result?.avgMonthly)) ? Number(result.avgMonthly)
    : (monthlyValues.length ? (annualFromMonthly / monthlyValues.length) : null);

  if (annualEl) annualEl.textContent = Number.isFinite(annualKWh) ? `${Math.round(annualKWh)}` : "—";
  if (avgMonthlyEl) avgMonthlyEl.textContent = Number.isFinite(avgMonthly) ? `${Math.round(avgMonthly)}` : "—";
  if (avgDailyEl) avgDailyEl.textContent = Number.isFinite(avgDaily) ? `${avgDaily.toFixed(1)}` : "—";
}

function renderAdvisory(result) {
  const tilt = result?.advisory?.optimalTiltDeg;
  const az = result?.advisory?.optimalAzimuthDeg;

  if (advisoryTiltEl) advisoryTiltEl.textContent = (tilt ?? "—");
  if (advisoryAzEl) advisoryAzEl.textContent = (az ?? "—");
}

function renderCharts(result) {
  // MONTHLY chart
  const monthKeys = Object.keys(result.monthlyKWh).sort(); // "YYYY-MM"
  const monthVals = monthKeys.map((k) => result.monthlyKWh[k]);

  // DAILY chart: show last 30 days only
  const dayKeysAll = Object.keys(result.dailyKWh).sort(); // "YYYY-MM-DD"
  const dayKeys = dayKeysAll.slice(Math.max(0, dayKeysAll.length - 30));
  const dayVals = dayKeys.map((k) => result.dailyKWh[k]);

  // Chart.js must already be loaded in results.html
  if (monthlyChart) monthlyChart.destroy();
  if (dailyChart) dailyChart.destroy();

  monthlyChart = new Chart(monthlyCanvas, {
    type: "bar",
    data: {
      labels: monthKeys.map((m) => m.slice(5)), // "MM" for compact display
      datasets: [{ label: "Energy (kWh)", data: monthVals }]
    }
  });

  dailyChart = new Chart(dailyCanvas, {
    type: "line",
    data: {
      labels: dayKeys.map((d, i) => `Day ${i + 1}`),
      datasets: [{ label: "Energy (kWh)", data: dayVals }]
    }
  });
}

function setStatus(msg, isError) {
  if (!statusText) return;
  statusText.textContent = msg;
  statusText.className = isError ? "text-sm text-red-600" : "text-sm text-slate-500";
}

// ======= Buttons =======
function wireButtons(cfg, result) {
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      window.location.href = "./index.html";
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", () => {
      const rRaw = localStorage.getItem("estimationResult");
      if (!rRaw) return alert("No results to export.");
      const r = JSON.parse(rRaw);

      const csv = buildCsv(cfg, r);
      downloadTextFile(csv, "solar-estimate.csv", "text/csv");
    });
  }
}

function buildCsv(cfg, result) {
  const lines = [];
  lines.push("Solar Energy Estimator Export");
  lines.push(`latitude,${cfg.latitude}`);
  lines.push(`longitude,${cfg.longitude}`);
  lines.push(`startDate,${cfg.startDate}`);
  lines.push(`endDate,${cfg.endDate}`);
  lines.push("");
  lines.push("date,kWh");
  for (const d of Object.keys(result.dailyKWh).sort()) {
    lines.push(`${d},${result.dailyKWh[d]}`);
  }
  return lines.join("\n");
}

function downloadTextFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}