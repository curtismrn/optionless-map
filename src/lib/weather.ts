// Forecasts from Open-Meteo (free, no key, CORS-enabled). The road state is a
// rule of thumb from temperature and precipitation, not an observation: the
// UI says so. Road closures are not covered: no reliable free source exists.

import type { Coord } from "@/lib/geo";

export type RoadState = "dry" | "wet" | "frost" | "ice" | "snow";

export interface Forecast {
  /** Elevation the temperatures are for (requested, or Open-Meteo's terrain model). */
  elevation: number;
  current: { temp: number; code: number; wind: number; isDay: boolean; road: RoadState };
  days: { date: string; code: number; max: number; min: number; rain: number; rainChance: number | null; snow: number; road: RoadState }[];
}

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

/** Rough road surface state now, from the current hour and the last six. */
function roadNow(temp: number, code: number, recentRain: number): RoadState {
  if (SNOW_CODES.has(code)) return "snow";
  if (temp <= 1 && recentRain >= 0.1) return "ice";
  if (recentRain >= 0.2) return "wet";
  if (temp <= 0) return "frost";
  return "dry";
}

function roadForDay(min: number, rain: number, rainChance: number | null, snow: number): RoadState {
  if (snow > 0) return "snow";
  if (min <= 1 && rain >= 0.5) return "ice";
  if (rain >= 1 || (rainChance ?? 0) >= 60) return "wet";
  if (min <= 0) return "frost";
  return "dry";
}

const cache = new Map<string, { at: number; data: Forecast }>();
const TTL = 15 * 60 * 1000;

export async function getForecast(at: Coord, elevation?: number): Promise<Forecast> {
  const [lng, lat] = at;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${elevation ? Math.round(elevation / 50) : "-"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: "temperature_2m,weather_code,wind_speed_10m,is_day",
    hourly: "precipitation",
    past_hours: "6",
    forecast_hours: "1",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,snowfall_sum",
    forecast_days: "5",
    timezone: "auto",
  });
  if (elevation !== undefined) q.set("elevation", String(Math.round(elevation)));
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error(`Weather service error (${r.status})`);
  const j = await r.json();

  const recentRain = (j.hourly?.precipitation as number[] | undefined)?.reduce((a, b) => a + (b ?? 0), 0) ?? 0;
  const c = j.current;
  const d = j.daily;
  const data: Forecast = {
    elevation: j.elevation,
    current: {
      temp: c.temperature_2m,
      code: c.weather_code,
      wind: c.wind_speed_10m,
      isDay: !!c.is_day,
      road: roadNow(c.temperature_2m, c.weather_code, recentRain),
    },
    days: (d.time as string[]).map((date, i) => ({
      date,
      code: d.weather_code[i],
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      rain: d.precipitation_sum[i] ?? 0,
      rainChance: d.precipitation_probability_max?.[i] ?? null,
      snow: d.snowfall_sum[i] ?? 0,
      road: roadForDay(d.temperature_2m_min[i], d.precipitation_sum[i] ?? 0, d.precipitation_probability_max?.[i] ?? null, d.snowfall_sum[i] ?? 0),
    })),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** WMO weather code → short label. */
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "—";
}

export const ROAD_LABEL: Record<RoadState, string> = {
  dry: "Dry",
  wet: "Wet",
  frost: "Frost possible",
  ice: "Ice risk",
  snow: "Snow",
};
