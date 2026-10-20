"use client";

// Imperative camera helpers. The map instance lives outside React; UI calls
// these instead of reaching into the map directly.

import type { Map as MLMap, LngLatBoundsLike, PaddingOptions } from "maplibre-gl";
import { app } from "@/lib/store";
import { bboxOf, haversine, type Coord } from "@/lib/geo";

let map: MLMap | null = null;
export const setMapInstance = (m: MLMap | null) => {
  map = m;
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") (window as unknown as { __omMap?: MLMap | null }).__omMap = m;
};
export const getMap = () => map;

export const GLOBAL_VIEW = { center: [-28, 38] as [number, number], zoom: 1.6, pitch: 0, bearing: 0 };
/** Whole-globe zoom that fits the current viewport width. */
export const globalZoom = () => (typeof window !== "undefined" && window.innerWidth < 768 ? 0.6 : GLOBAL_VIEW.zoom);

function padding(): PaddingOptions {
  const w = typeof window === "undefined" ? 1440 : window.innerWidth;
  const h = typeof window === "undefined" ? 900 : window.innerHeight;
  const s = app.get();
  if (w < 768) return { top: 112, left: 24, right: 56, bottom: Math.round(h * 0.6) }; // clear the bottom sheet, chip and controls
  const detailOpen = !!s.selection || !!s.contribute;
  return { top: 84, bottom: 56, left: s.exploreOpen ? 372 : 32, right: detailOpen ? 452 : 32 };
}

function fit(coords: Coord[], opts: { pitch?: number; bearing?: number; maxZoom?: number } = {}) {
  if (!map || coords.length === 0) return;
  const [w, s, e, n] = bboxOf(coords);
  const bounds: LngLatBoundsLike = [[w, s], [e, n]];
  map.fitBounds(bounds, {
    padding: padding(),
    pitch: opts.pitch ?? 0,
    bearing: opts.bearing ?? 0,
    maxZoom: opts.maxZoom ?? 15,
    duration: 1800,
    essential: true,
  });
}

export function focusVariant(id: string, cinematic = false) {
  const v = app.get().data?.variants.find((x) => x.id === id);
  if (!v) return;
  const coords = v.geometry.coordinates as Coord[];
  if (!cinematic) return fit(coords, { pitch: 15 });
  // Route camera: look along the route from its start, pitched over the terrain.
  const a = coords[0]!, b = coords.at(-1)!;
  const bearing = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  fit(coords, { pitch: 62, bearing, maxZoom: haversine(a, b) < 3000 ? 15.5 : 14 });
}

export function focusLocation(id: string) {
  const data = app.get().data;
  if (!data) return;
  const coords = data.variants.filter((v) => v.locationId === id).flatMap((v) => v.geometry.coordinates as Coord[]);
  const loc = data.locations.find((l) => l.id === id);
  if (coords.length) fit(coords, { pitch: 30 });
  else if (loc && map) map.flyTo({ center: loc.center, zoom: 12, duration: 1800, padding: padding() });
}

export function focusPoint(c: Coord, zoom = 15) {
  map?.flyTo({ center: c, zoom, pitch: 45, duration: 1600, padding: padding(), essential: true });
}

export function resetGlobal() {
  map?.flyTo({ ...GLOBAL_VIEW, zoom: globalZoom(), duration: 2200, essential: true });
}

export function zoomBy(delta: number) {
  if (!map) return;
  map.easeTo({ zoom: map.getZoom() + delta, duration: 300 });
}

export function resetNorth() {
  map?.easeTo({ bearing: 0, pitch: 0, duration: 600 });
}

let highlighted: string | null = null;
/** Hover-highlight a route from a panel list (desktop affordance; tapping selects). */
export function highlightRoute(id: string | null) {
  if (!map || !map.getSource("om-variants")) return;
  if (highlighted) map.setFeatureState({ source: "om-variants", id: highlighted }, { hover: false });
  highlighted = id;
  if (id) map.setFeatureState({ source: "om-variants", id }, { hover: true });
}
