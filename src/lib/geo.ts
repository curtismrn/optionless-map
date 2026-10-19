// Small, dependency-free geodesy helpers. Kept pure so they run in Node tests.

export type Coord = [number, number];
export type BBox = [number, number, number, number]; // w, s, e, n

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: Coord, b: Coord): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(coords: Coord[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1]!, coords[i]!);
  return d;
}

export function bboxOf(coords: Coord[]): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

export function bboxCenter([w, s, e, n]: BBox): Coord {
  return [(w + e) / 2, (s + n) / 2];
}

/** Portion of a line between two distances (metres) from its start. */
export function sliceByDistance(coords: Coord[], fromM: number, toM: number): Coord[] {
  const out: Coord[] = [];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!, b = coords[i]!;
    const seg = haversine(a, b);
    const lerp = (t: number): Coord => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (acc + seg >= fromM && acc <= toM) {
      if (out.length === 0) out.push(fromM > acc ? lerp((fromM - acc) / seg) : a);
      if (acc + seg <= toM) out.push(b);
      else { out.push(lerp((toM - acc) / seg)); break; }
    }
    acc += seg;
  }
  return out;
}

/** Points along the line every `step` metres (inclusive of ends). */
export function samplePoints(coords: Coord[], step: number): Coord[] {
  const out: Coord[] = [coords[0]!];
  let acc = 0, next = step;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!, b = coords[i]!;
    const seg = haversine(a, b);
    while (seg > 0 && acc + seg >= next) {
      const t = (next - acc) / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      next += step;
    }
    acc += seg;
  }
  out.push(coords[coords.length - 1]!);
  return out;
}

function distToSegment(p: Coord, a: Coord, b: Coord): number {
  // local equirectangular approximation — fine at route scale
  const k = Math.cos(rad(p[1]));
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2));
  const x = ax + dx * t, y = ay + dy * t;
  return rad(Math.hypot(x, y)) * R;
}

export function distanceToLine(p: Coord, line: Coord[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, distToSegment(p, line[i - 1]!, line[i]!));
  return best;
}

/**
 * Share of `a`'s length lying within `toleranceM` of `b` (0..1). Used to flag
 * likely duplicates for human review — never to merge automatically.
 */
export function overlapRatio(a: Coord[], b: Coord[], toleranceM = 40): number {
  const pts = samplePoints(a, 50);
  if (pts.length === 0) return 0;
  const bb = bboxOf(b);
  const pad = toleranceM / 111_000 / Math.max(0.2, Math.cos(rad(pts[0]![1])));
  let hit = 0;
  for (const p of pts) {
    if (p[0] < bb[0] - pad || p[0] > bb[2] + pad || p[1] < bb[1] - pad || p[1] > bb[3] + pad) continue;
    if (distanceToLine(p, b) <= toleranceM) hit++;
  }
  return hit / pts.length;
}

/** Douglas–Peucker simplification with a tolerance in metres. */
export function simplify(coords: Coord[], toleranceM: number): Coord[] {
  if (coords.length <= 2) return coords.slice();
  const lat0 = rad(coords[0]![1]);
  const P = coords.map(([x, y]) => [rad(x) * R * Math.cos(lat0), rad(y) * R] as const);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = P[s]!, [bx, by] = P[e]!;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * P[i]![0] - dx * P[i]![1] + bx * ay - by * ax) / L;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > toleranceM && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return coords.filter((_, i) => keep[i]);
}

export function formatKm(m: number): string {
  return m >= 10_000 ? `${(m / 1000).toFixed(1)} km` : `${(m / 1000).toFixed(2)} km`;
}

export function formatCoord([lon, lat]: Coord, digits = 4): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}°${ns} ${Math.abs(lon).toFixed(digits)}°${ew}`;
}
