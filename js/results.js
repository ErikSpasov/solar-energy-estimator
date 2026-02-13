import { fetchHistoricalDaily } from "./openMeteoArchiveClient.js";
import { estimateEnergy } from "./pvModel.js";

// ======= DOM helpers =======
const el = (id) => document.getElementById(id);

const statusText = el("statusText");
const metaLine = el("metaLine");

const annualEl = el("kpiAnnual");
const avgMonthlyEl = el("kpiMonthlyAvg");
const avgDailyEl = el("kpiDailyAvg");

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
  renderAdvisory(result, cfg);  // UPDATED: Now passes both result and cfg
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

// ============================================================================
// TASK 2: UPDATED ADVISORY RENDERING
// ============================================================================
// Now shows real optimal angles and potential improvement
// ============================================================================

function renderAdvisory(result, cfg) {
  const optimalTilt = result?.advisory?.optimalTiltDeg;
  const optimalAzimuth = result?.advisory?.optimalAzimuthDeg;
  const potentialKWh = result?.advisory?.potentialAnnualKWh;
  const currentKWh = result?.annualKWh;

  // Display optimal angles
  if (advisoryTiltEl) advisoryTiltEl.textContent = (optimalTilt ?? "—");
  if (advisoryAzEl) advisoryAzEl.textContent = (optimalAzimuth ?? "—");
  
  // Get user's current configuration
  const userTilt = Number(cfg.tiltDeg);
  const userAzimuth = Number(cfg.azimuthDeg);
  
  // Check if there's an advisory note element in your HTML
  const advisoryNoteEl = el("advisoryNote");
  
  if (advisoryNoteEl) {
    // Check if user already has optimal configuration
    if (optimalTilt === userTilt && optimalAzimuth === userAzimuth) {
      advisoryNoteEl.textContent = "✓ Your configuration is already optimal!";
      advisoryNoteEl.className = "text-sm text-emerald-600 font-medium mt-2";
    } 
    // Show potential improvement if not optimal
    else if (potentialKWh && currentKWh && potentialKWh > currentKWh) {
      const improvementKWh = potentialKWh - currentKWh;
      const improvementPercent = ((improvementKWh / currentKWh) * 100).toFixed(1);
      
      advisoryNoteEl.textContent = 
        `Potential gain: +${improvementPercent}% (+${Math.round(improvementKWh)} kWh/year)`;
      advisoryNoteEl.className = "text-sm text-blue-600 font-medium mt-2";
    }
  }
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
  
  // Add advisory information
  if (result.advisory) {
    lines.push("Advisory");
    lines.push(`optimalTilt,${result.advisory.optimalTiltDeg}`);
    lines.push(`optimalAzimuth,${result.advisory.optimalAzimuthDeg}`);
    lines.push(`potentialAnnual,${result.advisory.potentialAnnualKWh}`);
    lines.push("");
  }
  
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