import { toNumber, isValidConfig } from './validator.js';

// ======= DOM =======
const el = (id) => document.getElementById(id);

const statusBanner = el("statusBanner");
const btnLocate = el("btnLocate");
const btnCalculate = el("btnCalculate");

const latitude = el("latitude");
const longitude = el("longitude");

const systemCapacityKwp = el("systemCapacityKwp");
const tiltDeg = el("tiltDeg");
const azimuthDeg = el("azimuthDeg");
const performanceRatio = el("performanceRatio");

const startDate = el("startDate");
const endDate = el("endDate");


// ======= State =======
const state = {
  userConfiguration: {
    latitude: null,
    longitude: null,
    systemCapacityKwp: null,
    tiltDeg: null,
    azimuthDeg: null,
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


function syncStateFromInputs() {
  const cfg = state.userConfiguration;

  cfg.latitude = toNumber(latitude.value);
  cfg.longitude = toNumber(longitude.value);

  cfg.systemCapacityKwp = toNumber(systemCapacityKwp.value);
  cfg.tiltDeg = toNumber(tiltDeg.value);
  cfg.azimuthDeg = toNumber(azimuthDeg.value);
  cfg.performanceRatio = toNumber(performanceRatio.value);

  cfg.startDate = startDate.value || null;
  cfg.endDate = endDate.value || null;

  btnCalculate.disabled = !isValidConfig(cfg);
}

// ======= Map =======
let _map = null;
let _marker = null;

function updateMap(lat, lon) {
  const container = el("mapContainer");
  container.classList.remove("hidden");

  if (!_map) {
    // Leaflet needs the container visible before init
    _map = L.map("locationMap").setView([lat, lon], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19
    }).addTo(_map);
    _marker = L.marker([lat, lon]).addTo(_map);
    _map.invalidateSize();
  } else {
    _map.setView([lat, lon], 12);
    _marker.setLatLng([lat, lon]);
  }
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

      clearFieldError(latitude, el("errLatitude"));
      clearFieldError(longitude, el("errLongitude"));
      updateMap(lat, lon);

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

// ======= Calculate =======
function calculateEnergy() {
  const cfg = state.userConfiguration;

  if (!isValidConfig(cfg)) {
    showBanner("warn", "Complete all required fields first (location, parameters, date range).");
    return;
  }

  localStorage.setItem("userConfiguration", JSON.stringify(cfg));
  window.location.href = "./results.html";
}

// ======= Input Validation =======

// Rules for each validated field
const FIELD_RULES = {
  latitude:          { min: -90,   max: 90,    unit: "°",    noNeg: false, noDecimal: false, maxDecimals: 6,    errId: "errLatitude" },
  longitude:         { min: -180,  max: 180,   unit: "°",    noNeg: false, noDecimal: false, maxDecimals: 6,    errId: "errLongitude" },
  systemCapacityKwp: { min: 0.01, max: 10000, unit: " kWp", noNeg: true,  noDecimal: false, maxDecimals: null, errId: "errCapacity" },
  tiltDeg:           { min: 0,    max: 90,    unit: "°",    noNeg: true,  noDecimal: true,  maxDecimals: null, errId: "errTilt"     },
  azimuthDeg:        { min: -180, max: 180,   unit: "°",    noNeg: false, noDecimal: true,  maxDecimals: null, errId: "errAzimuth"  },
  performanceRatio:  { min: 0.01, max: 1,     unit: "",     noNeg: true,  noDecimal: false, maxDecimals: 2,    errId: "errPR"       },
};

function showFieldError(input, errEl, msg) {
  if (errEl) { errEl.textContent = msg; errEl.classList.remove("hidden"); }
  input.classList.add("border-red-400");
}

function clearFieldError(input, errEl) {
  if (errEl) { errEl.textContent = ""; errEl.classList.add("hidden"); }
  input.classList.remove("border-red-400");
}

function setupFieldValidation(input, rules) {
  const errEl = el(rules.errId);

  // Block characters that can never be valid for this field
  input.addEventListener("keydown", (e) => {
    // Block scientific notation ('e'/'E') and explicit '+' in all number fields
    if (e.key === "e" || e.key === "E" || e.key === "+") { e.preventDefault(); return; }
    // Block '-' for fields that only accept positive values
    if (rules.noNeg && e.key === "-") { e.preventDefault(); return; }
    // Block '.' for integer-only fields
    if (rules.noDecimal && e.key === ".") { e.preventDefault(); return; }
  });

  // Show live error while typing if value is out of range
  input.addEventListener("input", () => {
    // Truncate to maxDecimals if exceeded (e.g. 0.8599 → 0.85)
    if (rules.maxDecimals != null) {
      const dotIdx = input.value.indexOf(".");
      if (dotIdx !== -1 && input.value.length - dotIdx - 1 > rules.maxDecimals) {
        input.value = parseFloat(input.value).toFixed(rules.maxDecimals);
      }
    }

    if (input.value === "") { clearFieldError(input, errEl); return; }

    const val = parseFloat(input.value);
    if (isNaN(val)) { showFieldError(input, errEl, "Enter a valid number."); return; }

    if (val < rules.min || val > rules.max) {
      showFieldError(input, errEl, `Must be between ${rules.min}${rules.unit} and ${rules.max}${rules.unit}.`);
    } else {
      clearFieldError(input, errEl);
    }
  });
}

// Attach validation to location fields (manual input)
setupFieldValidation(latitude,  FIELD_RULES.latitude);
setupFieldValidation(longitude, FIELD_RULES.longitude);

// Update map when user manually types valid coordinates
function tryUpdateMapFromInputs() {
  const lat = toNumber(latitude.value);
  const lon = toNumber(longitude.value);
  if (lat !== null && lon !== null &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180) {
    updateMap(lat, lon);
  }
}

latitude.addEventListener("input",  () => { syncStateFromInputs(); tryUpdateMapFromInputs(); });
longitude.addEventListener("input", () => { syncStateFromInputs(); tryUpdateMapFromInputs(); });

// Attach validation to all System Parameter fields
setupFieldValidation(systemCapacityKwp, FIELD_RULES.systemCapacityKwp);
setupFieldValidation(tiltDeg,           FIELD_RULES.tiltDeg);
setupFieldValidation(azimuthDeg,        FIELD_RULES.azimuthDeg);
setupFieldValidation(performanceRatio,  FIELD_RULES.performanceRatio);

// ======= Date Constraints =======
function getMaxDate() {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
}

function applyDateConstraints() {
  const maxDate = getMaxDate();
  // End date can never exceed today − 2 days
  endDate.max = maxDate;
  // Start date can't be after the chosen end date (or max date if none chosen)
  startDate.max = endDate.value || maxDate;
  // End date can't be before the chosen start date
  endDate.min = startDate.value || "";
}

// ======= Date Presets =======
function setDatePreset(years) {
  const end = new Date();
  end.setDate(end.getDate() - 2);

  const start = new Date(end);
  start.setFullYear(start.getFullYear() - years);

  const fmt = (d) => d.toISOString().slice(0, 10);
  startDate.value = fmt(start);
  endDate.value = fmt(end);

  applyDateConstraints();
  syncStateFromInputs();
}

// ======= Wire up events =======
btnLocate.addEventListener("click", locateMe);
btnCalculate.addEventListener("click", calculateEnergy);

el("btnPreset1yr").addEventListener("click", () => setDatePreset(1));
el("btnPreset3yr").addEventListener("click", () => setDatePreset(3));
el("btnPreset5yr").addEventListener("click", () => setDatePreset(5));

// Prevent manual keyboard/paste input on date fields — calendar picker or quick-select only
[startDate, endDate].forEach((input) => {
  input.addEventListener("keydown", (e) => e.preventDefault());
  input.addEventListener("paste",   (e) => e.preventDefault());
});

// Keep date constraints in sync whenever the user picks a date from the calendar
startDate.addEventListener("change", applyDateConstraints);
endDate.addEventListener("change", applyDateConstraints);

// Apply constraints immediately on page load
applyDateConstraints();

[
  systemCapacityKwp, tiltDeg, azimuthDeg, performanceRatio,
  startDate, endDate
].forEach((input) => input.addEventListener("input", syncStateFromInputs));

// ======= Restore / Clear =======
function restoreConfigFromStorage() {
  const saved = localStorage.getItem("userConfiguration");
  if (!saved) { syncStateFromInputs(); return; }

  let cfg;
  try { cfg = JSON.parse(saved); } catch { syncStateFromInputs(); return; }

  if (cfg.latitude        != null) latitude.value           = cfg.latitude;
  if (cfg.longitude       != null) longitude.value          = cfg.longitude;
  if (cfg.systemCapacityKwp != null) systemCapacityKwp.value = cfg.systemCapacityKwp;
  if (cfg.tiltDeg         != null) tiltDeg.value            = cfg.tiltDeg;
  if (cfg.azimuthDeg      != null) azimuthDeg.value         = cfg.azimuthDeg;
  if (cfg.performanceRatio != null) performanceRatio.value  = cfg.performanceRatio;
  if (cfg.startDate)               startDate.value          = cfg.startDate;
  if (cfg.endDate)                 endDate.value            = cfg.endDate;

  applyDateConstraints();
  syncStateFromInputs();
  tryUpdateMapFromInputs();
}

function clearAll() {
  latitude.value           = "";
  longitude.value          = "";
  systemCapacityKwp.value  = "";
  tiltDeg.value            = "";
  azimuthDeg.value         = "";
  performanceRatio.value   = "";
  startDate.value          = "";
  endDate.value            = "";

  [
    [systemCapacityKwp, "errCapacity"],
    [tiltDeg,           "errTilt"],
    [azimuthDeg,        "errAzimuth"],
    [performanceRatio,  "errPR"],
  ].forEach(([input, errId]) => clearFieldError(input, el(errId)));

  localStorage.removeItem("userConfiguration");
  applyDateConstraints();
  hideBanner();
  syncStateFromInputs();
}

el("btnClear").addEventListener("click", clearAll);

// Restore saved config (if returning from results page), otherwise just sync
restoreConfigFromStorage();