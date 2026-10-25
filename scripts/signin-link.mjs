// Make a one-time sign-in link for a member without sending an email, when
// Supabase's built-in mailer is rate-limited. Send it to them yourself (it
// works once, expires after about an hour, and opens the site signed in).
//
//   npm run link -- friend@example.com
//
// Uses the service-role key from .env.local: run it on your own machine only.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const env = loadEnv();
const email = process.argv[2]?.trim().toLowerCase();
const site = process.argv[3] ?? "https://optionless-map.vercel.app";
if (!email) {
  console.error("Usage: npm run link -- friend@example.com [site-url]");
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: member } = await admin.from("members").select("display_name").eq("email", email).maybeSingle();
const { data: invite } = await admin.from("invites").select("display_name").eq("email", email).maybeSingle();
if (!member && !invite) {
  console.error(`${email} isn't a member or invited. Invite them first (Edit → Members, or npm run invite).`);
  process.exit(1);
}
// An invited email without an account yet gets one here; the invite trigger makes it a member.
const { data, error } = await admin.auth.admin.generateLink(member ? { type: "magiclink", email, options: { redirectTo: site } } : { type: "invite", email, options: { redirectTo: site } });
if (error) {
  console.error("Couldn't make a link:", error.message);
  process.exit(1);
}
console.log(`Sign-in link for ${email} (works once, send it only to them):\n\n${data.properties.action_link}\n`);
