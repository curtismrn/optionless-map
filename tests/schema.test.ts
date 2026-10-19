import { test } from "node:test";
import assert from "node:assert/strict";
import { VariantDraft, Contribution } from "../src/lib/domain/schema.ts";

const geometry = { type: "LineString", coordinates: [[-1.68, 43.3], [-1.67, 43.31]] };

test("VariantDraft accepts a valid draft", () => {
  assert.ok(VariantDraft.safeParse({ name: "North ramp", description: "", activity: "mountain_pass", direction: "both", geometry }).success);
});

test("VariantDraft rejects single-point geometry and out-of-range coordinates", () => {
  const one = { ...geometry, coordinates: [[-1.68, 43.3]] };
  assert.equal(VariantDraft.safeParse({ name: "X ramp", description: "", activity: "touge", direction: "both", geometry: one }).success, false);
  const bad = { ...geometry, coordinates: [[-1.68, 43.3], [200, 10]] };
  assert.equal(VariantDraft.safeParse({ name: "X ramp", description: "", activity: "touge", direction: "both", geometry: bad }).success, false);
});

test("Contribution status must be a known publication status", () => {
  const base = { id: "c1", kind: "new_variant", submittedAt: "2026-10-20T00:00:00Z", submitter: { kind: "anonymous", name: "a" } };
  assert.ok(Contribution.safeParse({ ...base, status: "pending_review" }).success);
  assert.equal(Contribution.safeParse({ ...base, status: "verified" }).success, false);
});
