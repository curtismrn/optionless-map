// Road-following geometry for suggested roads.
//
// Waypoints placed by a contributor are routed along OpenStreetMap roads with
// an OSRM server, so suggestions follow real roads instead of straight lines.
// Default endpoint is the public OSRM demo (fair-use, no SLA, driving profile);
// set NEXT_PUBLIC_OSRM_URL to a self-hosted instance for anything beyond a
// prototype. If routing fails, the caller falls back to straight segments and
// must label the geometry as unsnapped.

import type { Coord } from "./geo.ts";

export const OSRM_URL = (process.env.NEXT_PUBLIC_OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
export const MAX_WAYPOINTS = 25;

export type SnapResult = { ok: true; coordinates: Coord[]; distanceM: number } | { ok: false; error: string };

export async function snapToRoads(waypoints: Coord[], signal?: AbortSignal): Promise<SnapResult> {
  if (waypoints.length < 2) return { ok: false, error: "Need at least two waypoints." };
  if (waypoints.length > MAX_WAYPOINTS) return { ok: false, error: `Routing supports up to ${MAX_WAYPOINTS} waypoints.` };
  const path = waypoints.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(";");
  try {
    const res = await fetch(`${OSRM_URL}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false&continue_straight=true`, { signal });
    if (!res.ok) return { ok: false, error: `Routing service responded ${res.status}.` };
    const j = (await res.json()) as { code: string; message?: string; routes?: { distance: number; geometry: { coordinates: Coord[] } }[] };
    const r = j.routes?.[0];
    if (j.code !== "Ok" || !r) return { ok: false, error: j.message ?? `No road route found (${j.code}).` };
    return { ok: true, coordinates: r.geometry.coordinates.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)] as Coord), distanceM: r.distance };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { ok: false, error: "aborted" };
    return { ok: false, error: "Routing service unreachable." };
  }
}
