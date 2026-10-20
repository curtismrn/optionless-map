// Audit of the road → route-variant → media hierarchy in the seed data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_LOCATIONS, SEED_VARIANTS, SEED_POIS } from "../src/data/seed.ts";
import routes from "../src/data/generated/routes.json" with { type: "json" };
import media from "../src/data/generated/media.json" with { type: "json" };
import { haversine, type Coord } from "../src/lib/geo.ts";
import { routeRole, selectionContext, resolveRouteClick } from "../src/lib/selection.ts";

const locIds = new Set(SEED_LOCATIONS.map((l) => l.id));

test("every variant belongs to an existing road, ids are unique", () => {
  assert.equal(new Set(SEED_VARIANTS.map((v) => v.id)).size, SEED_VARIANTS.length);
  for (const v of SEED_VARIANTS) assert.ok(locIds.has(v.locationId), `${v.id} → ${v.locationId}`);
  for (const l of SEED_LOCATIONS) assert.ok(SEED_VARIANTS.some((v) => v.locationId === l.id), `${l.id} has no route`);
});

test("Col d'Ibardin groups its distinct routes under one road", () => {
  const ib = SEED_VARIANTS.filter((v) => v.locationId === "loc-ibardin").map((v) => v.id).sort();
  assert.deepEqual(ib, ["var-ibardin-es", "var-ibardin-fr", "var-ibardin-hillclimb", "var-ibardin-traverse"]);
});

test("each variant owns independent geometry (no shared arrays, no merges)", () => {
  const seen = new Set<unknown>();
  for (const v of SEED_VARIANTS) {
    assert.ok(!seen.has(v.geometry.coordinates), `${v.id} shares a coordinate array`);
    seen.add(v.geometry.coordinates);
    assert.ok(v.geometry.coordinates.length >= 2);
  }
  const keys = SEED_VARIANTS.map((v) => JSON.stringify(v.geometry.coordinates));
  assert.equal(new Set(keys).size, keys.length, "two variants have identical geometry");
});

test("seed geometry is the stored road-following route, endpoints unchanged", () => {
  const map: Record<string, string> = {
    "var-ibardin-fr": "ibardin-fr", "var-ibardin-es": "ibardin-es", "var-ibardin-traverse": "ibardin-loop",
    "var-stelvio-bormio": "stelvio-bormio", "var-stelvio-prato": "stelvio-prato",
    "var-irohazaka-first": "irohazaka-first", "var-irohazaka-second": "irohazaka-second", "var-pikes-highway": "pikes-highway",
  };
  const R = (routes as { routes: Record<string, { coordinates: number[][] }> }).routes;
  for (const [vid, rid] of Object.entries(map)) {
    const v = SEED_VARIANTS.find((x) => x.id === vid)!;
    assert.deepEqual(v.geometry.coordinates, R[rid]!.coordinates, vid);
  }
});

test("no straight-line shortcuts: longest segment is a known tunnel (< 1.5 km)", () => {
  for (const v of SEED_VARIANTS) {
    const c = v.geometry.coordinates as Coord[];
    let max = 0;
    for (let i = 1; i < c.length; i++) max = Math.max(max, haversine(c[i - 1]!, c[i]!));
    assert.ok(max < 1500, `${v.id} has a ${Math.round(max)} m straight segment`);
  }
});

test("every photo is attached to an existing road, route or point", () => {
  const ids = new Set([...locIds, ...SEED_VARIANTS.map((v) => v.id), ...SEED_POIS.map((p) => p.id)]);
  for (const m of (media as { items: { id: string; attachedTo: { id: string } }[] }).items) assert.ok(ids.has(m.attachedTo.id), `${m.id} → ${m.attachedTo.id}`);
});

test("selection roles: one primary, siblings on the same road, the rest faded", () => {
  const vs = SEED_VARIANTS;
  const roles = (sel: Parameters<typeof selectionContext>[0]) => {
    const ctx = selectionContext(sel, vs, SEED_POIS);
    return Object.fromEntries(vs.map((v) => [v.id, routeRole(v, ctx)]));
  };
  assert.ok(Object.values(roles(null)).every((r) => r === "none"));
  const loc = roles({ type: "location", id: "loc-ibardin" });
  assert.equal(loc["var-ibardin-fr"], "sibling");
  assert.equal(loc["var-stelvio-prato"], "faded");
  assert.ok(!Object.values(loc).includes("primary"));
  const v = roles({ type: "variant", id: "var-ibardin-es" });
  assert.equal(Object.values(v).filter((r) => r === "primary").length, 1);
  assert.equal(v["var-ibardin-es"], "primary");
  assert.equal(v["var-ibardin-fr"], "sibling");
  assert.equal(v["var-turini-bollene"], "faded");
});

test("overlapping routes under a tap are offered as a choice, never merged", () => {
  const ctx = selectionContext({ type: "location", id: "loc-ibardin" }, SEED_VARIANTS, SEED_POIS);
  assert.deepEqual(resolveRouteClick(["var-ibardin-fr", "var-ibardin-fr"], SEED_VARIANTS, ctx), { select: "var-ibardin-fr" });
  const r = resolveRouteClick(["var-ibardin-fr", "var-ibardin-traverse", "var-ibardin-hillclimb"], SEED_VARIANTS, ctx);
  assert.ok(r && "choose" in r && r.choose.length === 3);
  assert.equal(resolveRouteClick([], SEED_VARIANTS, ctx), null);
});
