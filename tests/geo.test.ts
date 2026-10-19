import { test } from "node:test";
import assert from "node:assert/strict";
import { haversine, lineLength, overlapRatio, simplify, sliceByDistance, type Coord } from "../src/lib/geo.ts";
import { parseGpx } from "../src/lib/gpx.ts";

test("haversine: one degree of latitude ≈ 111.2 km", () => {
  const d = haversine([0, 0], [0, 1]);
  assert.ok(Math.abs(d - 111_195) < 50, `got ${d}`);
});

test("sliceByDistance returns the requested length", () => {
  const line: Coord[] = [[0, 0], [0, 0.05], [0.05, 0.05]];
  const total = lineLength(line);
  const part = sliceByDistance(line, 1000, total - 1000);
  assert.ok(Math.abs(lineLength(part) - (total - 2000)) < 1, `got ${lineLength(part)}`);
});

test("simplify keeps endpoints and drops collinear points", () => {
  const line: Coord[] = [[0, 0], [0, 0.001], [0, 0.002], [0, 0.003]];
  assert.deepEqual(simplify(line, 1), [[0, 0], [0, 0.003]]);
});

test("overlapRatio: identical lines overlap fully, distant lines not at all", () => {
  const a: Coord[] = [[-1.67, 43.33], [-1.68, 43.31]];
  assert.ok(overlapRatio(a, a) > 0.99);
  const far: Coord[] = [[10, 46], [10.1, 46.1]];
  assert.equal(overlapRatio(a, far), 0);
});

test("parseGpx reads track points in lon/lat order", () => {
  const xml = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Test</name><trkseg>
    <trkpt lat="43.30" lon="-1.68"><ele>300</ele></trkpt>
    <trkpt lon="-1.67" lat="43.31"/>
    <trkpt lat="999" lon="0"/>
  </trkseg></trk></gpx>`;
  const r = parseGpx(xml);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.name, "Test");
  assert.deepEqual(r.coordinates, [[-1.68, 43.3], [-1.67, 43.31]]);
  assert.equal(r.droppedPoints, 1);
});

test("parseGpx falls back to route points and rejects junk", () => {
  const r = parseGpx(`<gpx><rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2.1"/></rte></gpx>`);
  assert.ok(r.ok && r.source === "route");
  assert.equal(parseGpx("<kml></kml>").ok, false);
  assert.equal(parseGpx(`<gpx><trk><trkpt lat="1" lon="2"/></trk></gpx>`).ok, false);
});
