// Responsibility: fetch historical DAILY data and return a weatherDataset-like object

export async function fetchHistoricalDaily(lat, lon, startDate, endDate) {
  const baseUrl = "https://archive-api.open-meteo.com/v1/archive";

  // We request DAILY values only (keeps it simple + matches your methodology text)
  // shortwave_radiation_sum is MJ/m² per day (Open-Meteo docs) :contentReference[oaicite:1]{index=1}
  const url =
    `${baseUrl}?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&start_date=${encodeURIComponent(startDate)}` +
    `&end_date=${encodeURIComponent(endDate)}` +
    `&daily=shortwave_radiation_sum,temperature_2m_mean` +
    `&timezone=UTC`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Open-Meteo request failed (${res.status}). ${text}`);
  }

  const data = await res.json();

  // Basic shape checks (defensive)
  if (!data.daily || !Array.isArray(data.daily.time)) {
    throw new Error("Unexpected Open-Meteo response shape (missing daily.time).");
  }

  const times = data.daily.time;
  const rad = data.daily.shortwave_radiation_sum;     // MJ/m²/day
  const temp = data.daily.temperature_2m_mean;        // °C

  if (!Array.isArray(rad) || !Array.isArray(temp) || rad.length !== times.length) {
    throw new Error("Open-Meteo daily arrays missing or mismatched lengths.");
  }

  // Build dataset (like your weatherDataset + weatherDataPoint)
  const points = times.map((dateStr, i) => ({
    dateTime: dateStr,                    // "YYYY-MM-DD"
    shortwaveRadiationMJm2: rad[i],        // MJ/m²/day
    temperatureC: temp[i]                 // °C
  }));

  return {
    latitude: data.latitude ?? lat,
    longitude: data.longitude ?? lon,
    startDate,
    endDate,
    points
  };
}