// Minimal GPX reader: extracts the first track (trk/trkseg/trkpt), falling back
// to a route (rte/rtept). Regex-based so it runs identically in the browser and
// in Node tests; GPX point elements are flat and attribute-only, which keeps
// this reliable without a full XML parser.

import type { Coord } from "./geo.ts";

export type GpxResult =
  | { ok: true; name?: string; coordinates: Coord[]; source: "track" | "route"; droppedPoints: number }
  | { ok: false; error: string };

const MAX_POINTS = 5000;

function readPoints(xml: string, tag: "trkpt" | "rtept"): { coords: Coord[]; invalid: number } {
  const re = new RegExp(`<${tag}\\b([^>]*?)\\/?>`, "gi");
  const coords: Coord[] = [];
  let invalid = 0;
  for (const m of xml.matchAll(re)) {
    const attrs = m[1] ?? "";
    const lat = Number(/\blat\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]);
    const lon = Number(/\blon\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      coords.push([lon, lat]);
    } else invalid++;
  }
  return { coords, invalid };
}

export function parseGpx(xml: string): GpxResult {
  if (!/<gpx\b/i.test(xml)) return { ok: false, error: "Not a GPX document (no <gpx> root element)." };
  let source: "track" | "route" = "track";
  let { coords, invalid } = readPoints(xml, "trkpt");
  if (coords.length === 0) {
    ({ coords, invalid } = readPoints(xml, "rtept"));
    source = "route";
  }
  if (coords.length < 2) return { ok: false, error: "GPX contains fewer than two valid track or route points." };

  // drop consecutive duplicates
  const dedup = coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1]![0] || c[1] !== coords[i - 1]![1]);
  let out = dedup;
  if (out.length > MAX_POINTS) {
    const stride = Math.ceil(out.length / MAX_POINTS);
    out = out.filter((_, i) => i % stride === 0 || i === dedup.length - 1);
  }
  const name = /<(?:trk|rte)\b[^>]*>[\s\S]*?<name>([^<]{1,120})<\/name>/i.exec(xml)?.[1]?.trim();
  return { ok: true, name, coordinates: out, source, droppedPoints: invalid + (coords.length - out.length) };
}
