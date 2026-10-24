// Apply supabase/migrations/*.sql and seed the demo atlas into the shared database.
//
//   npm run db:setup            migrations + seed
//   npm run db:setup -- --seed  seed only
//
// Needs SUPABASE_DB_URL in .env.local (Dashboard → Project Settings → Database →
// Connection string, "Session pooler" URI). Server-side only — never NEXT_PUBLIC_.
// Seeding uses fixed demo ids with ON CONFLICT DO NOTHING, so running it again
// never duplicates rows and never overwrites friends' edits to demo records.

import { readFileSync, readdirSync } from "node:fs";
import postgres from "postgres";
import { loadEnv } from "./env.mjs";
import { SEED_LOCATIONS, SEED_VARIANTS, SEED_POIS } from "../src/data/seed.ts";

const env = loadEnv();
if (!env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is missing in .env.local");
  process.exit(1);
}
// Passwords often contain URL-special characters (?, #, @, $…): split on the last "@"
// and percent-encode the password ourselves instead of asking the user to.
function safeDbUrl(raw) {
  const m = /^(postgres(?:ql)?:\/\/)([^:/@]+):(.*)@([^@]+)$/.exec(raw.trim());
  if (!m) throw new Error("SUPABASE_DB_URL doesn't look like postgresql://user:password@host:port/db");
  const [, scheme, user, pass, rest] = m;
  let decoded = pass;
  try {
    decoded = decodeURIComponent(pass);
  } catch {
    /* raw password with a literal % — keep as is */
  }
  return `${scheme}${user}:${encodeURIComponent(decoded)}@${rest}`;
}
let sql;
try {
  sql = postgres(safeDbUrl(env.SUPABASE_DB_URL), { ssl: "require", max: 1, onnotice: () => {} });
} catch (e) {
  // never echo the connection string: it contains the password
  console.error(`Invalid SUPABASE_DB_URL (${e.code ?? e.message?.split("\n")[0]}). Copy the "Session pooler" URI from Supabase → Connect.`);
  process.exit(1);
}
const seedOnly = process.argv.includes("--seed");

try {
  if (!seedOnly) {
    for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
      process.stdout.write(`migration ${f} … `);
      await sql.unsafe(readFileSync(`supabase/migrations/${f}`, "utf8"));
      console.log("ok");
    }
  }

  const routes = JSON.parse(readFileSync("src/data/generated/routes.json", "utf8")).routes;
  const media = JSON.parse(readFileSync("src/data/generated/media.json", "utf8")).items;
  const viaFor = (v) => {
    const r = Object.values(routes).find((x) => JSON.stringify(x.coordinates) === JSON.stringify(v.geometry.coordinates));
    return r?.via ?? [v.geometry.coordinates[0], v.geometry.coordinates.at(-1)];
  };

  const counts = { locations: 0, variants: 0, pois: 0, photos: 0 };
  await sql.begin(async (tx) => {
    for (const l of SEED_LOCATIONS) {
      const r = await tx`
        insert into public.locations (id, slug, name, summary, countries, regions, continent, center, tags, featured, provenance, created_by, updated_by, created_at, updated_at)
        values (${l.id}, ${l.slug}, ${l.name}, ${l.summary}, ${l.countries}, ${l.regions}, ${l.continent}, ${tx.json(l.center)}, ${l.tags}, ${l.featured},
                ${tx.json(l.provenance)}, null, null, ${l.createdAt}, ${l.updatedAt})
        on conflict (id) do nothing`;
      counts.locations += r.count;
    }
    for (const v of SEED_VARIANTS) {
      const r = await tx`
        insert into public.variants (id, location_id, slug, name, description, activity, geometry, waypoints, elevation, detected_hairpins, surface,
                                     countries, regions, direction, direction_note, verification, provenance, created_by, updated_by, created_at, updated_at)
        values (${v.id}, ${v.locationId}, ${v.slug}, ${v.name}, ${v.description}, ${v.activity}, ${tx.json(v.geometry)}, ${tx.json(viaFor(v))},
                ${v.elevation ? tx.json(v.elevation) : null}, ${tx.json(v.detectedHairpins)}, ${v.surface ?? null}, ${v.countries}, ${v.regions},
                ${v.direction}, ${v.directionNote ?? null}, ${v.verification}, ${tx.json(v.provenance)}, null, null, ${v.createdAt}, ${v.updatedAt})
        on conflict (id) do nothing`;
      counts.variants += r.count;
    }
    for (const p of SEED_POIS) {
      const r = await tx`
        insert into public.pois (id, location_id, variant_id, name, community_label, coordinates, category, description, provenance, created_by, created_at)
        values (${p.id}, ${p.parent.type === "location" ? p.parent.id : null}, ${p.parent.type === "variant" ? p.parent.id : null}, ${p.name},
                ${p.communityLabel}, ${tx.json(p.coordinates)}, ${p.category}, ${p.description}, ${tx.json(p.provenance)}, null, ${p.createdAt})
        on conflict (id) do nothing`;
      counts.pois += r.count;
    }
    for (const m of media.filter((x) => x.kind === "photo")) {
      const r = await tx`
        insert into public.photos (id, location_id, variant_id, poi_id, source, url, thumb_url, title, caption, credit, license, license_url, source_url, captured_at, width, height, created_by)
        values (${m.id}, ${m.attachedTo.type === "location" ? m.attachedTo.id : null}, ${m.attachedTo.type === "variant" ? m.attachedTo.id : null},
                ${m.attachedTo.type === "poi" ? m.attachedTo.id : null}, 'commons', ${m.url}, ${m.thumbUrl}, ${m.title}, ${m.caption}, ${m.credit.slice(0, 120)},
                ${m.license}, ${m.licenseUrl ?? null}, ${m.sourceUrl ?? null}, ${m.capturedAt ?? null}, ${m.width ?? null}, ${m.height ?? null}, null)
        on conflict (id) do nothing`;
      counts.photos += r.count;
    }
  });
  console.log("seed inserted (existing rows skipped):", counts);
} finally {
  await sql.end();
}
