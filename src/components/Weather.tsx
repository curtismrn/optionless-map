"use client";

// Current weather + 5 days at a point, with a rough road-surface state.

import { useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Loader2, Moon, Sun, Wind } from "lucide-react";
import { getForecast, weatherLabel, ROAD_LABEL, type Forecast, type RoadState } from "@/lib/weather";
import type { Coord } from "@/lib/geo";
import { cn } from "@/components/ui";

function WeatherIcon({ code, isDay = true, className }: { code: number; isDay?: boolean; className?: string }) {
  const I =
    code === 0 ? (isDay ? Sun : Moon)
    : code <= 2 ? (isDay ? CloudSun : CloudMoon)
    : code === 3 ? Cloud
    : code === 45 || code === 48 ? CloudFog
    : code >= 51 && code <= 57 ? CloudDrizzle
    : (code >= 61 && code <= 67) || (code >= 80 && code <= 82) ? CloudRain
    : (code >= 71 && code <= 77) || code === 85 || code === 86 ? CloudSnow
    : code >= 95 ? CloudLightning
    : Cloud;
  return <I className={className} aria-label={weatherLabel(code)} />;
}

const ROAD_TONE: Record<RoadState, string> = {
  dry: "border-ok/50 text-ok",
  wet: "border-ice/50 text-ice",
  frost: "border-amber/50 text-amber",
  ice: "border-signal/60 text-signal",
  snow: "border-signal/60 text-signal",
};

function RoadBadge({ state, small }: { state: RoadState; small?: boolean }) {
  return (
    <span className={cn("inline-block border font-mono tracking-[0.06em] uppercase", small ? "px-1 text-[8.5px]" : "px-1.5 py-0.5 text-[10px]", ROAD_TONE[state])}>
      {ROAD_LABEL[state]}
    </span>
  );
}

const round = (n: number) => Math.round(n);
const dayName = (iso: string, i: number) => (i === 0 ? "Today" : new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" }));

/**
 * `elevation` makes Open-Meteo correct temperatures for that height (useful at a
 * pass summit); without it, its own terrain model at the point is used.
 */
export function WeatherBlock({ at, elevation, where }: { at: Coord; elevation?: number; where?: string }) {
  const [f, setF] = useState<Forecast | null>(null);
  const [err, setErr] = useState("");
  const key = `${at[0]},${at[1]},${elevation}`;
  useEffect(() => {
    let alive = true;
    setF(null);
    setErr("");
    getForecast(at, elevation)
      .then((x) => alive && setF(x))
      .catch(() => alive && setErr("Weather unavailable right now."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <section className="border-b border-line px-3 py-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-fg-dim uppercase">Weather</h3>
        {f && (
          <span className="truncate text-[11px] text-fg-faint">
            {where ? `${where} · ` : ""}
            {round(f.elevation)} m
          </span>
        )}
      </header>
      {err && <p className="text-[12px] text-fg-faint">{err}</p>}
      {!f && !err && (
        <p className="flex items-center gap-2 text-[12px] text-fg-faint">
          <Loader2 className="size-3.5 animate-spin" /> Loading forecast…
        </p>
      )}
      {f && (
        <>
          <div className="flex items-center gap-3">
            <WeatherIcon code={f.current.code} isDay={f.current.isDay} className="size-8 shrink-0 text-fg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[26px] leading-none font-semibold text-white tabular-nums">{round(f.current.temp)}°</span>
                <span className="truncate text-[12.5px] text-fg-dim">{weatherLabel(f.current.code)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-faint">
                <span className="flex items-center gap-1">
                  <Wind className="size-3" /> {round(f.current.wind)} km/h
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="mb-0.5 text-[9.5px] tracking-[0.08em] text-fg-faint uppercase">Road now</div>
              <RoadBadge state={f.current.road} />
            </div>
          </div>
          <ul className="mt-3 grid grid-cols-5 gap-1">
            {f.days.map((d, i) => (
              <li key={d.date} className="flex flex-col items-center gap-1 border border-line px-0.5 py-1.5 text-center" title={`${weatherLabel(d.code)} · ${d.rain.toFixed(1)} mm${d.snow ? ` · ${d.snow.toFixed(1)} cm snow` : ""}`}>
                <span className="text-[10px] text-fg-dim">{dayName(d.date, i)}</span>
                <WeatherIcon code={d.code} className="size-4 text-fg" />
                <span className="text-[11px] text-fg tabular-nums">
                  {round(d.max)}° <span className="text-fg-faint">{round(d.min)}°</span>
                </span>
                {d.rainChance !== null && <span className="text-[9.5px] text-ice tabular-nums">{d.rainChance}%</span>}
                <RoadBadge state={d.road} small />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10.5px] leading-snug text-fg-faint">
            Forecast by Open-Meteo. The road state is a rough guess from temperature and rain, and road closures aren&apos;t covered: check locally before you go.
          </p>
        </>
      )}
    </section>
  );
}
