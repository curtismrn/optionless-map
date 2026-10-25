"use client";

// Browser Supabase client. Uses the public anon key only — every permission is
// enforced by Row Level Security and Storage policies in the database
// (supabase/migrations). The service-role key is used exclusively by local
// Node scripts and must never be prefixed NEXT_PUBLIC_.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Shared (friends) mode when a Supabase project is configured; otherwise the local demo. */
export const SHARED_MODE = URL.length > 0 && ANON.length > 0;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!SHARED_MODE) throw new Error("Supabase is not configured");
  client ??= createClient(URL, ANON, {
    // Implicit flow: a sign-in link works in any browser or device (PKCE only accepts it
    // in the browser that asked for it, which broke links opened from a phone's mail app
    // and the links made by `npm run link`).
    auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
