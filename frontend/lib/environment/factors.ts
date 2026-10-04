import type { DrawPeriod } from "../types";

// ── Environmental factors for prediction modulation ──────────────────────────

export type EnvironmentalFactors = {
  // Astronomical
  moonPhase: number;          // 0-1 (0=new, 0.25=first quarter, 0.5=full, 0.75=last quarter)
  moonIllumination: number;   // 0-1
  tidalForce: number;         // 0-1 normalized gravitational pull
  solarCyclePosition: number; // 0-1 position in ~11-year solar cycle
  geomagneticProxy: number;   // 0-1 estimated Kp-like index

  // Meteorological (San Jose, Costa Rica: 9.9281, -84.0907)
  temperature: number | null;        // Celsius
  humidity: number | null;           // 0-100%
  pressure: number | null;           // hPa
  windSpeed: number | null;          // km/h
  precipitation: number | null;      // mm

  // Calendar
  dayOfWeek: number;          // 0=Sunday, 6=Saturday
  dayOfYear: number;          // 1-366
  weekOfYear: number;         // 1-53
  seasonPhase: number;        // 0-1 (tropical: 0=dry start, 0.5=rainy start)

  // Draw-specific
  drawHour: number;           // approximate hour of draw
};

// ── Moon phase calculation (Meeus algorithm simplified) ──────────────────────

function moonPhaseForDate(dateISO: string): { phase: number; illumination: number } {
  const [y, m, d] = dateISO.split("-").map(Number);

  // Julian Day Number
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
    Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;

  // Days since known new moon (Jan 6, 2000 18:14 UTC = JDN 2451550.26)
  const daysSinceNewMoon = jdn - 2451550.26;
  const synodicMonth = 29.53058867;
  const phase = ((daysSinceNewMoon % synodicMonth) + synodicMonth) % synodicMonth / synodicMonth;

  // Illumination: approximated by cosine
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;

  return { phase, illumination };
}

// ── Tidal force approximation ────────────────────────────────────────────────
// Gravitational pull is strongest at new moon (0) and full moon (0.5)

function tidalForce(moonPhase: number): number {
  return (1 + Math.cos(moonPhase * 2 * Math.PI * 2)) / 2;
}

// ── Solar cycle approximation ────────────────────────────────────────────────
// Solar cycle 25 started ~Dec 2019, peak expected ~2025
// Average cycle length: ~11 years (4018 days)

function solarCyclePosition(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const cycle25Start = new Date(2019, 11, 1); // Dec 2019
  const cycleLengthDays = 4018; // ~11 years
  const daysSinceStart = (date.getTime() - cycle25Start.getTime()) / 86400000;
  return ((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays / cycleLengthDays;
}

// ── Geomagnetic proxy ────────────────────────────────────────────────────────
// Higher activity near solar maximum (~0.5 of cycle), modulated by moon

function geomagneticProxy(solarPos: number, moonPhase: number): number {
  // Peak at solar max (0.45-0.55 of cycle)
  const solarComponent = Math.exp(-Math.pow((solarPos - 0.5) * 4, 2));
  // Slight modulation by moon (equinoctial effect)
  const lunarMod = 1 + 0.15 * Math.cos(moonPhase * 2 * Math.PI);
  return Math.min(1, solarComponent * lunarMod);
}

// ── Calendar calculations ────────────────────────────────────────────────────

function dayOfYear(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const start = new Date(y, 0, 1);
  return Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
}

function weekOfYear(dateISO: string): number {
  return Math.ceil(dayOfYear(dateISO) / 7);
}

function dayOfWeek(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// Costa Rica tropical seasons:
// Dry season (verano): Dec-Apr, Rainy season (invierno): May-Nov
function seasonPhase(dateISO: string): number {
  const doy = dayOfYear(dateISO);
  // Shift so dry season starts at 0 (roughly day 335 = Dec 1)
  const shifted = (doy + 30) % 366;
  return shifted / 366;
}

// Draw hours (approximate)
const DRAW_HOURS: Record<DrawPeriod, number> = {
  MEDIODIA: 12,
  TARDE: 15,
  NOCHE: 21,
};

// ── Weather from Open-Meteo API ──────────────────────────────────────────────
// San Jose, Costa Rica: lat 9.9281, lon -84.0907

type WeatherData = {
  temperature: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  precipitation: number;
};

async function fetchWeather(dateISO: string, hour: number): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=9.9281&longitude=-84.0907&hourly=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,precipitation&start_date=${dateISO}&end_date=${dateISO}&timezone=America/Costa_Rica`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const data = await response.json();
    const hourly = data?.hourly;
    if (!hourly) return null;

    const idx = Math.min(hour, (hourly.time?.length ?? 1) - 1);

    return {
      temperature: hourly.temperature_2m?.[idx] ?? null,
      humidity: hourly.relative_humidity_2m?.[idx] ?? null,
      pressure: hourly.surface_pressure?.[idx] ?? null,
      windSpeed: hourly.wind_speed_10m?.[idx] ?? null,
      precipitation: hourly.precipitation?.[idx] ?? null,
    };
  } catch {
    return null;
  }
}

// For past dates, Open-Meteo has a historical archive endpoint
async function fetchHistoricalWeather(dateISO: string, hour: number): Promise<WeatherData | null> {
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=9.9281&longitude=-84.0907&hourly=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,precipitation&start_date=${dateISO}&end_date=${dateISO}&timezone=America/Costa_Rica`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const data = await response.json();
    const hourly = data?.hourly;
    if (!hourly) return null;

    const idx = Math.min(hour, (hourly.time?.length ?? 1) - 1);

    return {
      temperature: hourly.temperature_2m?.[idx] ?? null,
      humidity: hourly.relative_humidity_2m?.[idx] ?? null,
      pressure: hourly.surface_pressure?.[idx] ?? null,
      windSpeed: hourly.wind_speed_10m?.[idx] ?? null,
      precipitation: hourly.precipitation?.[idx] ?? null,
    };
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getEnvironmentalFactors(
  dateISO: string,
  period: DrawPeriod,
  options?: { skipWeather?: boolean },
): Promise<EnvironmentalFactors> {
  const moon = moonPhaseForDate(dateISO);
  const solarPos = solarCyclePosition(dateISO);
  const drawHour = DRAW_HOURS[period];

  let weather: WeatherData | null = null;
  if (!options?.skipWeather) {
    // Determine if date is in the past or future
    const today = new Date().toISOString().slice(0, 10);
    if (dateISO <= today) {
      weather = await fetchHistoricalWeather(dateISO, drawHour);
    }
    if (!weather) {
      weather = await fetchWeather(dateISO, drawHour);
    }
  }

  return {
    moonPhase: moon.phase,
    moonIllumination: moon.illumination,
    tidalForce: tidalForce(moon.phase),
    solarCyclePosition: solarPos,
    geomagneticProxy: geomagneticProxy(solarPos, moon.phase),

    temperature: weather?.temperature ?? null,
    humidity: weather?.humidity ?? null,
    pressure: weather?.pressure ?? null,
    windSpeed: weather?.windSpeed ?? null,
    precipitation: weather?.precipitation ?? null,

    dayOfWeek: dayOfWeek(dateISO),
    dayOfYear: dayOfYear(dateISO),
    weekOfYear: weekOfYear(dateISO),
    seasonPhase: seasonPhase(dateISO),

    drawHour,
  };
}

// Non-async version using only calculable factors (no weather API)
export function getCalculableFactors(
  dateISO: string,
  period: DrawPeriod,
): Omit<EnvironmentalFactors, "temperature" | "humidity" | "pressure" | "windSpeed" | "precipitation"> & {
  temperature: null;
  humidity: null;
  pressure: null;
  windSpeed: null;
  precipitation: null;
} {
  const moon = moonPhaseForDate(dateISO);
  const solarPos = solarCyclePosition(dateISO);

  return {
    moonPhase: moon.phase,
    moonIllumination: moon.illumination,
    tidalForce: tidalForce(moon.phase),
    solarCyclePosition: solarPos,
    geomagneticProxy: geomagneticProxy(solarPos, moon.phase),

    temperature: null,
    humidity: null,
    pressure: null,
    windSpeed: null,
    precipitation: null,

    dayOfWeek: dayOfWeek(dateISO),
    dayOfYear: dayOfYear(dateISO),
    weekOfYear: weekOfYear(dateISO),
    seasonPhase: seasonPhase(dateISO),

    drawHour: DRAW_HOURS[period],
  };
}
