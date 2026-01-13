// ======= DOM =======
const el = (id) => document.getElementById(id);

const statusBanner = el("statusBanner");
const btnLocate = el("btnLocate");
const btnCalculate = el("btnCalculate");
const btnClear = el("btnClear");

const latitude = el("latitude");
const longitude = el("longitude");

const systemCapacityKwp = el("systemCapacityKwp");
const tiltDeg = el("tiltDeg");
const azimuthDeg = el("azimuthDeg");
const panelEfficiency = el("panelEfficiency");
const performanceRatio = el("performanceRatio");

const startDate = el("startDate");
const endDate = el("endDate");

const configPreview = el("configPreview");

// ======= State =======
const state = {
  userConfiguration: {
    latitude: null,
    longitude: null,
    systemCapacityKwp: null,
    tiltDeg: null,
    azimuthDeg: null,
    panelEfficiency: null,
    performanceRatio: null,
    startDate: null,
    endDate: null
  }
};

// ======= Helpers =======
function showBanner(type, msg) {
  // type: "ok" | "warn" | "err"
  statusBanner.classList.remove("hidden");
  statusBanner.className = "mb-6 rounded-lg border px-4 py-3 text-sm";

  if (type === "ok") statusBanner.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-900");
  if (type === "warn") statusBanner.classList.add("border-amber-200", "bg-amber-50", "text-amber-900");
  if (type === "err") statusBanner.classList.add("border-red-200", "bg-red-50", "text-red-900");

  statusBanner.textContent = msg;
}

function hideBanner() {
  statusBanner.classList.add("hidden");
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isValidConfig(cfg) {
  // Mandatory: location, system params, and date range
  const required = [
    cfg.latitude,
    cfg.longitude,
    cfg.systemCapacityKwp,
    cfg.tiltDeg,
    cfg.azimuthDeg,
    cfg.panelEfficiency,
    cfg.performanceRatio,
    cfg.startDate,
    cfg.endDate
  ];

  if (required.some((x) => x === null || x === "")) return false;

  // bounds sanity
  if (cfg.latitude < -90 || cfg.latitude > 90) return false;
  if (cfg.longitude < -180 || cfg.longitude > 180) return false;

  if (cfg.systemCapacityKwp <= 0) return false;
  if (cfg.tiltDeg < 0 || cfg.tiltDeg > 90) return false;
  if (cfg.azimuthDeg < -180 || cfg.azimuthDeg > 180) return false;

  if (cfg.panelEfficiency <= 0 || cfg.panelEfficiency > 1) return false;
  if (cfg.performanceRatio <= 0 || cfg.performanceRatio > 1) return false;

  // date order
  if (cfg.startDate > cfg.endDate) return false;

  return true;
}

function syncStateFromInputs() {
  const cfg = state.userConfiguration;

  cfg.latitude = toNumber(latitude.value);
  cfg.longitude = toNumber(longitude.value);

  cfg.systemCapacityKwp = toNumber(systemCapacityKwp.value);
  cfg.tiltDeg = toNumber(tiltDeg.value);
  cfg.azimuthDeg = toNumber(azimuthDeg.value);
  cfg.panelEfficiency = toNumber(panelEfficiency.value);
  cfg.performanceRatio = toNumber(performanceRatio.value);

  cfg.startDate = startDate.value || null;
  cfg.endDate = endDate.value || null;

  configPreview.textContent = JSON.stringify(state.userConfiguration, null, 2);

  btnCalculate.disabled = !isValidConfig(cfg);
}

function clearAll() {
  latitude.value = "";
  longitude.value = "";

  systemCapacityKwp.value = "";
  tiltDeg.value = "";
  azimuthDeg.value = "";
  panelEfficiency.value = "";
  performanceRatio.value = "";

  startDate.value = "";
  endDate.value = "";

  hideBanner();
  syncStateFromInputs();
}

// ======= Locate Me =======
async function locateMe() {
  hideBanner();

  if (!("geolocation" in navigator)) {
    showBanner("err", "Geolocation is not supported by this browser.");
    return;
  }

  btnLocate.disabled = true;
  btnLocate.textContent = "Locating...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      latitude.value = lat.toFixed(6);
      longitude.value = lon.toFixed(6);

      showBanner("ok", "Location retrieved successfully.");
      btnLocate.disabled = false;
      btnLocate.textContent = "Locate Me";

      syncStateFromInputs();
    },
    (err) => {
      // Common: blocked permission, insecure origin, timeout
      const msg =
        err.code === 1 ? "Location permission denied. Allow location access in your browser."
        : err.code === 2 ? "Location unavailable. Try again."
        : "Location request timed out. Try again.";

      showBanner("err", msg);
      btnLocate.disabled = false;
      btnLocate.textContent = "Locate Me";
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// ======= Calculate (placeholder) =======
function calculateEnergy() {
  const cfg = state.userConfiguration;

  if (!isValidConfig(cfg)) {
    showBanner("warn", "Complete all required fields first (location, parameters, date range).");
    return;
  }

  // Save for the next page (Results Dashboard)
  localStorage.setItem("userConfiguration", JSON.stringify(cfg));
  showBanner("ok", "Configuration saved. Next step: fetch weather + run PV model.");

  // Later: window.location.href = "./results.html";
}

// ======= Wire up events =======
btnLocate.addEventListener("click", locateMe);
btnCalculate.addEventListener("click", calculateEnergy);
btnClear.addEventListener("click", clearAll);

[
  systemCapacityKwp, tiltDeg, azimuthDeg, panelEfficiency, performanceRatio,
  startDate, endDate
].forEach((input) => input.addEventListener("input", syncStateFromInputs));

// Initial render
syncStateFromInputs();