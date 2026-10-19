// Build-time data fetcher for the OPTIONLESS MAP demo dataset.
//
// For each route spec:
//   1. Route between OSM-geocoded anchors with the public OSRM demo server
//      (geometry follows OpenStreetMap road data, ODbL).
//   2. Simplify the line (Douglas–Peucker, ~4 m tolerance).
//   3. Sample elevation from AWS Terrain Tiles (Mapzen "terrarium" encoding)
//      and derive gain / loss / min / max and a compact profile.
//   4. Detect hairpins with a simple turning-angle heuristic.
//
// Output: src/data/generated/routes.json (committed, so the app never needs
// network access to these services at runtime).
//
// Usage: npm run data:fetch [-- id1 id2]   (ids: refetch only those and merge;
//        be polite: the OSRM/Nominatim demo servers are rate-limited)

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { PNG } from "pngjs";

const UA = "OPTIONLESS-MAP-prototype/0.1 (dev data build)";

// Anchors were resolved with Nominatim (OSM) and pinned here so the build is reproducible.
const A = {
  ibardinCol: [-1.68444, 43.30966],
  olhette: [-1.66879, 43.33709],
  bera: [-1.67965, 43.28133],
  urrugne: [-1.7003, 43.36247],
  lizuniaga: [-1.63275, 43.28298],
  sare: [-1.5793, 43.31296],
  stelvioPass: [10.45321, 46.52862],
  bormio: [10.37747, 46.46767],
  prato: [10.59166, 46.61709],
  cartisoara: [24.57448, 45.72633],
  baleaLac: [24.61705, 45.60331],
  vidraru: [24.63147, 45.36631],
  umagaeshi: [139.52709, 36.73903],
  irohazakaJunction: [139.54282, 36.73645], // where the one-way first and second roads split
  chuzenjiOnsen: [139.49954, 36.73893],
  ikaho: [138.92591, 36.49989],
  harunaLake: [138.86591, 36.47528],
  turiniCol: [7.3916, 43.97757],
  bollene: [7.33108, 43.98994],
  moulinet: [7.41322, 43.94129],
  sospel: [7.44982, 43.87856],
  pikesGate: [-104.97389, 38.90366],
  pikesSummit: [-105.04395, 38.8404],
  dealsGap: [-83.92082, 35.47395],
  tabcat: [-83.98741, 35.52254],
};

const SPECS = [
  { id: "ibardin-fr", via: [A.olhette, A.ibardinCol] },
  { id: "ibardin-es", via: [A.bera, A.ibardinCol] },
  { id: "ibardin-loop", via: [A.urrugne, A.ibardinCol, A.bera, A.lizuniaga, A.sare] },
  { id: "stelvio-bormio", via: [A.bormio, A.stelvioPass] },
  { id: "stelvio-prato", via: [A.prato, A.stelvioPass] },
  { id: "transfagarasan-north", via: [A.cartisoara, A.baleaLac] },
  { id: "transfagarasan-full", via: [A.cartisoara, A.baleaLac, A.vidraru] },
  { id: "irohazaka-second", via: [A.irohazakaJunction, A.chuzenjiOnsen] },
  { id: "irohazaka-first", via: [A.chuzenjiOnsen, A.umagaeshi] },
  { id: "haruna-ikaho", via: [A.ikaho, A.harunaLake] },
  { id: "turini-bollene", via: [A.bollene, A.turiniCol] },
  { id: "turini-sospel", via: [A.sospel, A.moulinet, A.turiniCol] },
  { id: "pikes-highway", via: [A.pikesGate, A.pikesSummit] },
  { id: "dragon-us129", via: [A.dealsGap, A.tabcat] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// Douglas–Peucker on a local equirectangular projection (metres).
function simplify(coords, tol) {
  const lat0 = rad(coords[0][1]);
  const P = coords.map(([x, y]) => [rad(x) * R * Math.cos(lat0), rad(y) * R]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = P[s], [bx, by] = P[e];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * P[i][0] - dx * P[i][1] + bx * ay - by * ax) / L;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return coords.filter((_, i) => keep[i]);
}

// Resample a line every `step` metres.
function resample(coords, step) {
  const out = [{ c: coords[0], d: 0 }];
  let dist = 0, next = step;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const seg = haversine(a, b);
    while (dist + seg >= next) {
      const t = (next - dist) / seg;
      out.push({ c: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: next });
      next += step;
    }
    dist += seg;
  }
  out.push({ c: coords[coords.length - 1], d: dist });
  return { samples: out, length: dist };
}

// ---- Terrarium DEM ---------------------------------------------------------
const Z = 13;
const tileCache = new Map();
async function tile(x, y) {
  const key = `${x}/${y}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, (async () => {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`DEM ${url} ${res.status}`);
      return PNG.sync.read(Buffer.from(await res.arrayBuffer()));
    })());
  }
  return tileCache.get(key);
}
async function elevationAt([lon, lat]) {
  const n = 2 ** Z;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await tile(tx, ty);
  const px = Math.min(255, Math.max(0, (fx - tx) * 256 - 0.5));
  const py = Math.min(255, Math.max(0, (fy - ty) * 256 - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1);
  const v = (x, y) => {
    const i = (y * 256 + x) * 4;
    return png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
  };
  const tx2 = px - x0, ty2 = py - y0;
  return (v(x0, y0) * (1 - tx2) + v(x1, y0) * tx2) * (1 - ty2) + (v(x0, y1) * (1 - tx2) + v(x1, y1) * tx2) * ty2;
}

function elevationStats(eles) {
  // Moving-average smoothing then hysteresis to avoid counting DEM noise as climbing.
  const w = 3;
  const sm = eles.map((_, i) => {
    const s = eles.slice(Math.max(0, i - w), i + w + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
  let gain = 0, loss = 0, ref = sm[0];
  for (const e of sm) {
    if (e - ref > 3) { gain += e - ref; ref = e; }
    else if (ref - e > 3) { loss += ref - e; ref = e; }
  }
  return { gain: Math.round(gain), loss: Math.round(loss), min: Math.round(Math.min(...sm)), max: Math.round(Math.max(...sm)), smoothed: sm };
}

// Hairpin heuristic: heading change >= 150° within a ~120 m window.
function detectHairpins(coords) {
  const { samples } = resample(coords, 20);
  const pts = samples.map((s) => s.c);
  const hits = [];
  const W = 3; // 3 samples each side = ~60 m
  for (let i = W; i < pts.length - W; i++) {
    const b1 = bearing(pts[i - W], pts[i]);
    const b2 = bearing(pts[i], pts[i + W]);
    let d = Math.abs(b2 - b1);
    if (d > 180) d = 360 - d;
    if (d >= 150) hits.push({ i, d, c: pts[i] });
  }
  // keep local maxima separated by >= 150 m
  const out = [];
  for (const h of hits.sort((a, b) => b.d - a.d)) {
    if (out.every((o) => Math.abs(o.i - h.i) * 20 >= 150)) out.push(h);
  }
  return out.sort((a, b) => a.i - b.i).map((h) => [+h.c[0].toFixed(5), +h.c[1].toFixed(5)]);
}

async function osrm(via) {
  const coords = via.map((c) => c.join(",")).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const j = await res.json();
  if (j.code !== "Ok") throw new Error(`OSRM ${j.code} ${j.message ?? ""}`);
  return j.routes[0];
}

const only = process.argv.slice(2);
const OUT = "src/data/generated/routes.json";
const prev = only.length && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;

const out = {
  generatedAt: new Date().toISOString(),
  sources: {
    geometry: "OpenStreetMap contributors (ODbL), routed with the OSRM public demo server",
    elevation: "AWS Terrain Tiles / Mapzen terrarium (SRTM, GMTED, NED, ETOPO1 et al.), z13 bilinear sample every 25 m",
  },
  routes: prev?.routes ?? {},
};

for (const spec of SPECS.filter((s) => !only.length || only.includes(s.id))) {
  process.stdout.write(`${spec.id} … `);
  const r = await osrm(spec.via);
  const raw = r.geometry.coordinates;
  const simple = simplify(raw, 4).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
  const { samples, length } = resample(raw, 25);
  const eles = [];
  for (const s of samples) eles.push(await elevationAt(s.c));
  const st = elevationStats(eles);
  // compact profile: ~120 points of [km, m]
  const stride = Math.max(1, Math.floor(samples.length / 120));
  const profile = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1)
    .map((s) => [+(s.d / 1000).toFixed(3), Math.round(st.smoothed[samples.indexOf(s)])]);
  const hairpins = detectHairpins(raw);
  out.routes[spec.id] = {
    via: spec.via,
    coordinates: simple,
    lengthM: Math.round(length),
    elevation: { gainM: st.gain, lossM: st.loss, minM: st.min, maxM: st.max, profile },
    hairpins,
  };
  console.log(`${(length / 1000).toFixed(1)} km, +${st.gain}/-${st.loss} m, ${st.min}–${st.max} m, ${simple.length} pts, ${hairpins.length} hairpins`);
  await sleep(1200);
}

mkdirSync("src/data/generated", { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT}`);
