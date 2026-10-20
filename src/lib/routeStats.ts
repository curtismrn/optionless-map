// Route statistics for routes created or edited in the app — the same method as
// scripts/fetch-routes.mjs (25 m sampling of AWS terrarium DEM, smoothing,
// 3 m hysteresis; hairpins = heading change ≥ 150° within ~120 m).

import { haversine, type Coord } from "./geo.ts";
import type { ElevationStats } from "./domain/schema.ts";

const rad = (d: number) => (d * Math.PI) / 180;

function bearing(a: Coord, b: Coord) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function resample(coords: Coord[], step: number): { c: Coord; d: number }[] {
  const out = [{ c: coords[0]!, d: 0 }];
  let dist = 0, next = step;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!, b = coords[i]!;
    const seg = haversine(a, b);
    while (seg > 0 && dist + seg >= next) {
      const t = (next - dist) / seg;
      out.push({ c: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: next });
      next += step;
    }
    dist += seg;
  }
  out.push({ c: coords[coords.length - 1]!, d: dist });
  return out;
}

export function detectHairpins(coords: Coord[]): Coord[] {
  const pts = resample(coords, 20).map((s) => s.c);
  const hits: { i: number; d: number; c: Coord }[] = [];
  const W = 3;
  for (let i = W; i < pts.length - W; i++) {
    let d = Math.abs(bearing(pts[i]!, pts[i + W]!) - bearing(pts[i - W]!, pts[i]!));
    if (d > 180) d = 360 - d;
    if (d >= 150) hits.push({ i, d, c: pts[i]! });
  }
  const out: typeof hits = [];
  for (const h of hits.sort((a, b) => b.d - a.d)) if (out.every((o) => Math.abs(o.i - h.i) * 20 >= 150)) out.push(h);
  return out.sort((a, b) => a.i - b.i).map((h) => [+h.c[0].toFixed(5), +h.c[1].toFixed(5)] as Coord);
}

export function elevationStatsFrom(eles: number[], dists: number[]): Omit<ElevationStats, "source"> {
  const w = 3;
  const sm = eles.map((_, i) => {
    const s = eles.slice(Math.max(0, i - w), i + w + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
  let gain = 0, loss = 0, ref = sm[0]!;
  for (const e of sm) {
    if (e - ref > 3) { gain += e - ref; ref = e; }
    else if (ref - e > 3) { loss += ref - e; ref = e; }
  }
  const stride = Math.max(1, Math.floor(sm.length / 120));
  const profile: [number, number][] = [];
  for (let i = 0; i < sm.length; i++) if (i % stride === 0 || i === sm.length - 1) profile.push([+(dists[i]! / 1000).toFixed(3), Math.round(sm[i]!)]);
  return { gainM: Math.round(gain), lossM: Math.round(loss), minM: Math.round(Math.min(...sm)), maxM: Math.round(Math.max(...sm)), profile };
}

// ---- browser-only DEM sampling ---------------------------------------------

const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const Z = 13;
const tiles = new Map<string, Promise<ImageData>>();

function tile(x: number, y: number): Promise<ImageData> {
  const k = `${x}/${y}`;
  if (!tiles.has(k)) {
    tiles.set(
      k,
      (async () => {
        const res = await fetch(`${TERRARIUM}/${Z}/${x}/${y}.png`);
        if (!res.ok) throw new Error(`DEM tile ${res.status}`);
        const bmp = await createImageBitmap(await res.blob());
        const cv = new OffscreenCanvas(256, 256);
        const ctx = cv.getContext("2d")!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, 256, 256);
      })(),
    );
  }
  return tiles.get(k)!;
}

async function elevationAt([lon, lat]: Coord): Promise<number> {
  const n = 2 ** Z;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const img = await tile(tx, ty);
  const px = Math.min(255, Math.max(0, Math.floor((fx - tx) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((fy - ty) * 256)));
  const i = (py * 256 + px) * 4;
  return img.data[i]! * 256 + img.data[i + 1]! + img.data[i + 2]! / 256 - 32768;
}

/** Best effort: returns undefined when the DEM is unreachable or the route is very long. */
export async function computeElevation(coords: Coord[]): Promise<ElevationStats | undefined> {
  try {
    const samples = resample(coords, 25);
    if (samples.length > 8000) return undefined;
    const eles: number[] = [];
    for (const s of samples) eles.push(await elevationAt(s.c));
    return {
      ...elevationStatsFrom(eles, samples.map((s) => s.d)),
      source: "AWS Terrain Tiles (Mapzen terrarium) · 25 m sampling · smoothed · computed in the app",
    };
  } catch {
    return undefined;
  }
}
