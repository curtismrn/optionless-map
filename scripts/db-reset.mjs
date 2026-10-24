// Empty the shared atlas: roads, routes, points, photos (rows + uploaded files)
// and the edit history. Members are kept.
//
//   npm run db:reset              show what would be deleted
//   npm run db:reset -- --yes     back up to backups/ then delete
//
// The backup (JSON of every row) is written to backups/, which is git-ignored.
// Uploaded photo files are listed in the backup but not downloaded.

import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TABLES = ["photos", "pois", "variants", "locations", "edits"];

const dump = {};
for (const t of TABLES) {
  const { data, error } = await admin.from(t).select("*");
  if (error) throw error;
  dump[t] = data;
}
const files = [];
for (const { name: folder } of (await admin.storage.from("photos").list("", { limit: 1000 })).data ?? []) {
  const { data } = await admin.storage.from("photos").list(folder, { limit: 1000 });
  for (const f of data ?? []) files.push(`${folder}/${f.name}`);
}
console.log("current contents:", Object.fromEntries(TABLES.map((t) => [t, dump[t].length])), `storage files: ${files.length}`);

if (!process.argv.includes("--yes")) {
  console.log("dry run — add --yes to back up and delete");
  process.exit(0);
}

mkdirSync("backups", { recursive: true });
const path = `backups/atlas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(path, JSON.stringify({ ...dump, storageFiles: files }, null, 1));
console.log(`backup written: ${path}`);

// locations cascade to variants/pois/photos; delete children explicitly anyway
for (const t of TABLES) {
  const { error } = await admin.from(t).delete().not("id", "is", null);
  if (error) throw error;
}
if (files.length) {
  const { error } = await admin.storage.from("photos").remove(files);
  if (error) throw error;
}
const after = {};
for (const t of TABLES) after[t] = (await admin.from(t).select("id", { count: "exact", head: true })).count;
const { count: members } = await admin.from("members").select("user_id", { count: "exact", head: true });
console.log("after reset:", after, `members kept: ${members}`);
