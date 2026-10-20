// End-to-end check of the shared atlas against the real Supabase project.
//
//   npm run test:shared
//
// Creates two throw-away members (A and B), signs each in as an independent
// browser-like client (anon key + their own session), plus an anonymous
// visitor, then checks: A creates/edits a route → B sees it (incl. realtime),
// geometry and waypoints survive unchanged, both upload and view photos, the
// visitor cannot write, invalid data is rejected, and History can undo.
// Everything it creates is removed at the end.
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY in .env.local (the service key is used only here,
// to create the test members and mint their sign-in tokens).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const tag = `e2e-${Date.now().toString(36)}`;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1×1 JPEG
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

async function member(label) {
  const email = `${tag}-${label}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const { error: mErr } = await admin.from("members").insert({ user_id: created.user.id, email, display_name: `E2E ${label}` });
  if (mErr) throw mErr;
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr) throw lErr;
  const client = createClient(URL, ANON, opts);
  const { error: vErr } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (vErr) throw vErr;
  return { client, id: created.user.id, email };
}

const routes = JSON.parse(readFileSync("src/data/generated/routes.json", "utf8")).routes;
const geometry = { type: "LineString", coordinates: routes["ibardin-es"].coordinates };
const waypoints = routes["ibardin-es"].via;

let A, B;
const created = { locations: [], photos: [] };
try {
  A = await member("a");
  B = await member("b");
  const anon = createClient(URL, ANON, opts);
  check("two independent member sessions", A.client !== B.client && A.id !== B.id);

  // realtime: B listens before A writes
  let realtimeSeen = false;
  const ch = B.client.channel(`${tag}-rt`).on("postgres_changes", { event: "INSERT", schema: "public", table: "variants" }, (p) => {
    if (String(p.new?.name ?? "").startsWith(tag)) realtimeSeen = true;
  });
  await new Promise((res) => ch.subscribe((s) => s === "SUBSCRIBED" && res()));
  await B.client.realtime.setAuth((await B.client.auth.getSession()).data.session.access_token);

  // 1. A creates a road + route
  const { data: loc, error: locErr } = await A.client.from("locations").insert({ name: `${tag} road`, slug: tag, countries: ["FR"], continent: "Europe", center: [-1.68, 43.3] }).select().single();
  check("A creates a road", !locErr, locErr?.message);
  created.locations.push(loc?.id);
  const { data: v, error: vErr } = await A.client.from("variants").insert({ location_id: loc.id, name: `${tag} route`, slug: tag, activity: "mountain_pass", geometry, waypoints }).select().single();
  check("A creates a route", !vErr, vErr?.message);

  // 2. B sees it, geometry untouched
  const { data: seen } = await B.client.from("variants").select("*").eq("id", v.id).single();
  check("B sees A's route", !!seen && seen.name === `${tag} route`);
  check("geometry identical after round trip", JSON.stringify(seen?.geometry) === JSON.stringify(geometry), `${geometry.coordinates.length} vertices`);
  check("waypoints preserved", JSON.stringify(seen?.waypoints) === JSON.stringify(waypoints));
  for (let i = 0; i < 20 && !realtimeSeen; i++) await sleep(250);
  check("B receives the change in realtime", realtimeSeen);

  // A edits, B sees the edit
  await A.client.from("variants").update({ name: `${tag} route renamed` }).eq("id", v.id);
  const { data: seen2 } = await B.client.from("variants").select("name, geometry").eq("id", v.id).single();
  check("B sees A's edit", seen2?.name === `${tag} route renamed`);
  check("editing the name leaves geometry unchanged", JSON.stringify(seen2?.geometry) === JSON.stringify(geometry));

  // 3. both add and view photos
  for (const [who, other] of [[A, B], [B, A]]) {
    const path = `${who.id}/${tag}.jpg`;
    const up = await who.client.storage.from("photos").upload(path, JPEG, { contentType: "image/jpeg" });
    const { data: ph, error: pErr } = await who.client.from("photos").insert({ variant_id: v.id, source: "upload", storage_path: path, thumb_path: path, caption: `${tag} by ${who.email}` }).select().single();
    created.photos.push({ path, client: who.client });
    check(`${who === A ? "A" : "B"} uploads a photo`, !up.error && !pErr, up.error?.message ?? pErr?.message);
    const { data: signed } = await other.client.storage.from("photos").createSignedUrl(path, 60);
    const res = signed ? await fetch(signed.signedUrl) : null;
    check(`${who === A ? "B" : "A"} can view it`, res?.status === 200 && !!ph);
  }

  // 4. unauthorized visitor
  const anonIns = await anon.from("locations").insert({ name: `${tag} hack`, slug: "x", countries: ["FR"], continent: "Europe", center: [0, 0] });
  check("visitor cannot create", !!anonIns.error, anonIns.error?.code);
  const anonUpd = await anon.from("variants").update({ name: "hacked" }, { count: "exact" }).eq("id", v.id);
  check("visitor cannot edit", !anonUpd.error ? anonUpd.count === 0 : true);
  const anonDel = await anon.from("variants").delete({ count: "exact" }).eq("id", v.id);
  check("visitor cannot delete", !anonDel.error ? anonDel.count === 0 : true);
  const anonUp = await anon.storage.from("photos").upload(`anon/${tag}.jpg`, JPEG, { contentType: "image/jpeg" });
  check("visitor cannot upload", !!anonUp.error);
  const { data: settings } = await anon.from("atlas_settings").select("public_read").single();
  const anonRead = await anon.from("variants").select("id").eq("id", v.id);
  check(`visitor read matches privacy setting (public_read=${settings?.public_read})`, settings?.public_read ? anonRead.data?.length === 1 : anonRead.data?.length === 0);
  const { data: still } = await B.client.from("variants").select("name").eq("id", v.id).single();
  check("data unchanged after visitor attempts", still?.name === `${tag} route renamed`);

  // 5. invalid changes are rejected with clear errors
  const bad = await A.client.from("variants").insert({ location_id: loc.id, name: `${tag} bad`, slug: "bad", activity: "mountain_pass", geometry: { type: "LineString", coordinates: [[0, 0]] } });
  check("single-point geometry rejected", bad.error?.code === "23514", bad.error?.message);
  const bad2 = await A.client.from("variants").insert({ location_id: loc.id, name: `${tag} bad2`, slug: "bad2", activity: "mountain_pass", geometry: { type: "LineString", coordinates: [[0, 0], [500, 91]] } });
  check("out-of-range coordinates rejected", bad2.error?.code === "23514");
  const bad3 = await A.client.from("variants").insert({ location_id: "does-not-exist", name: `${tag} bad3`, slug: "bad3", activity: "mountain_pass", geometry });
  check("route on a missing road rejected", bad3.error?.code === "23503");
  const badType = await A.client.storage.from("photos").upload(`${A.id}/${tag}.txt`, Buffer.from("hello"), { contentType: "text/plain" });
  check("non-image upload rejected", !!badType.error, badType.error?.message);
  const bigUp = await A.client.storage.from("photos").upload(`${A.id}/${tag}-big.jpg`, Buffer.alloc(10_485_761, 1), { contentType: "image/jpeg" });
  check("upload over 10 MB rejected", !!bigUp.error, bigUp.error?.message);
  const notMemberMembers = await A.client.from("members").insert({ user_id: A.id, email: "x@x.x", display_name: "x" });
  check("members list cannot be changed from the browser", !!notMemberMembers.error);

  // 6. history + undo
  const { data: edits } = await B.client.from("edits").select("id, action, actor_name, row_id, table_name").eq("row_id", v.id).order("id");
  check("edits are logged with the author", (edits ?? []).some((e) => e.action === "update" && e.actor_name === "E2E a"));
  const upd = edits?.find((e) => e.action === "update");
  const { error: rErr } = await B.client.rpc("restore_edit", { edit_id: upd.id });
  const { data: restored } = await A.client.from("variants").select("name, geometry").eq("id", v.id).single();
  check("B undoes A's rename", !rErr && restored?.name === `${tag} route`, rErr?.message);
  check("geometry still identical after undo", JSON.stringify(restored?.geometry) === JSON.stringify(geometry));
  const anonRestore = await anon.rpc("restore_edit", { edit_id: upd.id });
  check("visitor cannot undo", !!anonRestore.error);

  // delete + undo the delete
  await A.client.from("variants").delete().eq("id", v.id);
  const { data: delEdit } = await B.client.from("edits").select("id").eq("row_id", v.id).eq("action", "delete").single();
  await B.client.rpc("restore_edit", { edit_id: delEdit.id });
  const { data: back } = await B.client.from("variants").select("id, geometry").eq("id", v.id).maybeSingle();
  check("deleted route restored with its geometry", !!back && JSON.stringify(back.geometry) === JSON.stringify(geometry));

  await B.client.removeChannel(ch);
} catch (e) {
  check("unexpected error", false, e?.message ?? String(e));
} finally {
  // cleanup (service role): rows, files, history, test users
  for (const id of created.locations.filter(Boolean)) await admin.from("locations").delete().eq("id", id);
  if (A && B) await admin.storage.from("photos").remove([`${A.id}/${tag}.jpg`, `${B.id}/${tag}.jpg`]);
  await admin.from("edits").delete().like("after->>name", `${tag}%`);
  await admin.from("edits").delete().like("before->>name", `${tag}%`);
  await admin.from("edits").delete().like("after->>caption", `${tag}%`);
  for (const u of [A, B].filter(Boolean)) await admin.auth.admin.deleteUser(u.id);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
