// Invite a friend (the only way to become a member — there is no self sign-up).
//
//   npm run invite -- friend@example.com "Display name"
//   npm run invite -- --remove friend@example.com
//
// Uses the service-role key from .env.local. Run it on your own machine only;
// the service-role key bypasses RLS and must never reach the browser.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const args = process.argv.slice(2);
const remove = args[0] === "--remove";
const email = (remove ? args[1] : args[0])?.trim().toLowerCase();
const name = (remove ? "" : args.slice(1).join(" ").trim()) || email?.split("@")[0];
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run invite -- friend@example.com "Name"   |   npm run invite -- --remove friend@example.com');
  process.exit(1);
}

async function findUser(e) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === e);
    if (u || data.users.length < 200) return u;
  }
}

let user = await findUser(email);
if (remove) {
  await admin.from("invites").delete().eq("email", email);
  if (!user) {
    console.log("No account for this email (any pending invite was cancelled).");
    process.exit(0);
  }
  const { error } = await admin.from("members").delete().eq("user_id", user.id);
  if (error) throw error;
  console.log(`Removed ${email} from members (their auth account remains but can no longer read private data or write).`);
  process.exit(0);
}

if (!user) {
  // The account gate (migration 0002) only lets invited emails create an account.
  const inv = await admin.from("invites").upsert({ email, display_name: name }, { onConflict: "email" });
  if (inv.error) throw inv.error;
  // Creates the account without sending an email; they sign in from the app with a magic link.
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  user = data.user;
}
const { error } = await admin.from("members").upsert({ user_id: user.id, email, display_name: name }, { onConflict: "user_id" });
if (error) throw error;
await admin.from("invites").delete().eq("email", email);
console.log(`✓ ${name} <${email}> is a member. They can now open the atlas and sign in with “Email me a link”.`);
