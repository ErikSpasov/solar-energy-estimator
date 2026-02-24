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
const btnExportPdf = el("btnExportPdf");

// Chart canvases (must exist in your HTML)
const monthlyCanvas = el("monthlyChart");
const dailyCanvas = el("dailyChart");

let monthlyChart = null;
let dailyChart = null;

// ======= Load config =======
const cfgRaw = localStorage.getItem("userConfiguration");
if (!cfgRaw) {
  setStatus("Missing data. Please run an estimation first.", true);
  wireButtons(null);
} else {
  const cfg = JSON.parse(cfgRaw);
  run(cfg).catch((err) => {
    console.error(err);
    setStatus(`Open-Meteo error: ${err.message}`, true);
    wireButtons(cfg);
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
  wireButtons(cfg);
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

  // Display current config values (left side of arrow)
  const currentTiltEl = el("currentTilt");
  const currentAzEl   = el("currentAz");
  if (currentTiltEl) currentTiltEl.textContent = cfg.tiltDeg ?? "—";
  if (currentAzEl)   currentAzEl.textContent   = cfg.azimuthDeg ?? "—";

  // Display advised (optimal) angles (right side of arrow)
  if (advisoryTiltEl) advisoryTiltEl.textContent = (optimalTilt ?? "—");
  if (advisoryAzEl)   advisoryAzEl.textContent   = (optimalAzimuth ?? "—");

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
  // ---- Monthly data ----
  const monthKeys = Object.keys(result.monthlyKWh).sort(); // "YYYY-MM"
  const monthVals = monthKeys.map((k) => result.monthlyKWh[k]);

  // "YYYY-MM" → "Jan '24"
  const monthLabels = monthKeys.map((m) => {
    const [y, mo] = m.split("-");
    return new Date(+y, +mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  });

  // ---- Daily data (last 30 days) ----
  const dayKeysAll = Object.keys(result.dailyKWh).sort(); // "YYYY-MM-DD"
  const dayKeys = dayKeysAll.slice(Math.max(0, dayKeysAll.length - 30));
  const dayVals = dayKeys.map((k) => result.dailyKWh[k]);

  // "YYYY-MM-DD" → "15 Jan"
  const dayLabels = dayKeys.map((d) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  );

  // ---- Subtitles ----
  const fmtMonth = (m) => {
    const [y, mo] = m.split("-");
    return new Date(+y, +mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };
  const fmtDay = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const monthlySub = el("monthlyChartSubtitle");
  if (monthlySub && monthKeys.length > 0)
    monthlySub.textContent = `${monthKeys.length} months: ${fmtMonth(monthKeys[0])} – ${fmtMonth(monthKeys[monthKeys.length - 1])}`;

  const dailySub = el("dailyChartSubtitle");
  if (dailySub && dayKeys.length > 0)
    dailySub.textContent = `${fmtDay(dayKeys[0])} – ${fmtDay(dayKeys[dayKeys.length - 1])}`;

  // ---- Shared Chart.js options ----
  const sharedOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y.toFixed(1)} kWh`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: "kWh", color: "#94a3b8", font: { size: 11 } },
        grid: { color: "#f1f5f9" },
        ticks: { color: "#64748b", font: { size: 11 } }
      },
      x: {
        grid: { display: false },
        ticks: { color: "#64748b", font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 18 }
      }
    }
  };

  if (monthlyChart) monthlyChart.destroy();
  if (dailyChart) dailyChart.destroy();

  monthlyChart = new Chart(monthlyCanvas, {
    type: "bar",
    data: {
      labels: monthLabels,
      datasets: [{
        label: "Monthly Energy",
        data: monthVals,
        backgroundColor: "rgba(16, 185, 129, 0.75)",
        borderColor: "rgb(16, 185, 129)",
        borderWidth: 1,
        borderRadius: 3,
      }]
    },
    options: sharedOptions
  });

  dailyChart = new Chart(dailyCanvas, {
    type: "line",
    data: {
      labels: dayLabels,
      datasets: [{
        label: "Daily Energy",
        data: dayVals,
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.08)",
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.3,
      }]
    },
    options: sharedOptions
  });
}

function setStatus(msg, isError) {
  if (!statusText) return;
  statusText.textContent = msg;
  statusText.className = isError ? "text-sm text-red-600" : "text-sm text-slate-500";
}

// ======= Buttons =======
function wireButtons(cfg) {
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

  if (btnExportPdf) {
    btnExportPdf.addEventListener("click", () => exportPdf());
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

// ======= PDF Export =======
async function exportPdf() {
  if (!window.html2canvas || !window.jspdf) {
    alert("PDF libraries not loaded yet. Please wait a moment and try again.");
    return;
  }

  if (btnExportPdf) { btnExportPdf.disabled = true; btnExportPdf.textContent = "Generating…"; }

  try {
    const { jsPDF } = window.jspdf;

    // Capture the full results main area
    const mainEl = document.querySelector("main");
    const canvas = await html2canvas(mainEl, { scale: 2, useCORS: true, logging: false });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = pdf.internal.pageSize.getWidth();   // 210 mm
    const pageH = pdf.internal.pageSize.getHeight();  // 297 mm

    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    // Stamp header on first page
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Solar Energy Estimator — exported ${new Date().toLocaleDateString()}`, pageW / 2, 6, { align: "center" });

    // Add image (split across pages if content is taller than one page)
    let heightLeft = imgH;
    let yPos = 10; // leave room for header text

    pdf.addImage(imgData, "PNG", 0, yPos, imgW, imgH);
    heightLeft -= (pageH - yPos);

    while (heightLeft > 0) {
      yPos = -(imgH - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, yPos, imgW, imgH);
      heightLeft -= pageH;
    }

    pdf.save("solar-estimate.pdf");
  } finally {
    if (btnExportPdf) { btnExportPdf.disabled = false; btnExportPdf.textContent = "Export PDF"; }
  }
}