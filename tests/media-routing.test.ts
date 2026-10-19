import { test } from "node:test";
import assert from "node:assert/strict";
import { roadMedia, variantMedia } from "../src/lib/media.ts";
import { snapToRoads } from "../src/lib/routing.ts";
import { MediaItem } from "../src/lib/domain/schema.ts";

const mk = (id: string, type: "location" | "variant", target: string, status: "published" | "removed" = "published") =>
  MediaItem.parse({ id, attachedTo: { type, id: target }, kind: "photo", source: "commons", title: id, credit: "x", license: "CC0", status });

const variants = [
  { id: "v1", locationId: "L" },
  { id: "v2", locationId: "L" },
  { id: "v3", locationId: "OTHER" },
];
const media = [mk("a", "location", "L"), mk("b", "variant", "v1"), mk("c", "variant", "v3"), mk("d", "variant", "v2", "removed")];

test("roadMedia gathers the road record and its variants, skipping removed items", () => {
  assert.deepEqual(roadMedia({ variants, media } as never, "L").map((m) => m.id), ["a", "b"]);
});

test("variantMedia lists the variant's own media before the road's", () => {
  assert.deepEqual(variantMedia({ media } as never, { id: "v1", locationId: "L" }).map((m) => m.id), ["b", "a"]);
});

test("snapToRoads returns OSRM geometry and reports failures without throwing", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 1234, geometry: { coordinates: [[1, 2], [1.001, 2.001], [1.002, 2.003]] } }] }))) as typeof fetch;
    const ok = await snapToRoads([[1, 2], [1.002, 2.003]]);
    assert.ok(ok.ok && ok.coordinates.length === 3 && ok.distanceM === 1234);

    globalThis.fetch = (async () => new Response(JSON.stringify({ code: "NoRoute", message: "Impossible route" }))) as typeof fetch;
    const no = await snapToRoads([[1, 2], [3, 4]]);
    assert.deepEqual(no, { ok: false, error: "Impossible route" });

    globalThis.fetch = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;
    assert.equal((await snapToRoads([[1, 2], [3, 4]])).ok, false);
    assert.equal((await snapToRoads([[1, 2]])).ok, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("MediaItem defaults to published and rejects unknown kinds", () => {
  assert.equal(mk("z", "location", "L").status, "published");
  assert.equal(MediaItem.safeParse({ id: "x", attachedTo: { type: "location", id: "L" }, kind: "gif", source: "local", title: "x", credit: "x", license: "CC0" }).success, false);
});
