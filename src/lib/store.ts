"use client";

// Tiny external store (useSyncExternalStore) — avoids a state library while
// letting the map, which lives outside React's render cycle, read and write it.

import { useSyncExternalStore } from "react";
import type { AtlasRepository, AtlasEditor, AtlasSnapshot, ContributionInput, MediaInput } from "@/lib/repository/types";
import { LocalDemoRepository } from "@/lib/repository/local";
import { SharedRepository } from "@/lib/repository/shared";
import { SHARED_MODE, supabase } from "@/lib/supabase";
import { DEFAULT_FILTERS, type Filters } from "@/lib/search";
import type { StyleId } from "@/components/map/styles";
import type { Coord } from "@/lib/geo";
import { DEFAULT_LOOK, type Look } from "@/lib/look";

export type Selection = { type: "location" | "variant" | "poi"; id: string } | null;

export type MediaTarget = { type: "location" | "variant" | "poi"; id: string };
export type ReportSubject = { type: "location" | "variant" | "poi" | "media"; id: string };

export type ContributeIntent =
  | { kind: "add_media"; target: MediaTarget }
  | { kind: "new_variant"; locationId?: string }
  | { kind: "geometry_correction"; variantId: string }
  | { kind: "new_poi"; targetId: string }
  | { kind: "description_edit"; variantId: string }
  | { kind: "report"; subject: ReportSubject }
  | { kind: "my_submissions" }
  // shared (friends) mode — direct edits
  | { kind: "edit_location"; id?: string }
  | { kind: "edit_variant"; id?: string; locationId?: string }
  | { kind: "history" };

/**
 * disabled   – no Supabase configured: local demo mode
 * signed_out – shared mode, not signed in
 * member     – signed in and on the members list: can edit
 * not_member – signed in but not invited (should not happen: sign-up is disabled)
 */
export type AuthState =
  | { status: "disabled" | "loading" | "signed_out" | "not_member"; email?: string }
  | { status: "member"; email: string; name: string; userId: string };

export interface DrawState {
  active: boolean;
  purpose: "route" | "poi";
  /** Points the contributor placed (editable vertices). */
  waypoints: Coord[];
  /** Displayed / submitted geometry: road-snapped route through the waypoints, or the waypoints themselves. */
  coords: Coord[];
  snap: boolean;
  snapStatus: "idle" | "routing" | "snapped" | "unsnapped";
  snapError: string | null;
  /** Geometry being corrected, shown underneath for comparison. */
  reference: Coord[] | null;
}

export type DetailTab = "overview" | "media" | "info";

export interface AppState {
  data: AtlasSnapshot | null;
  selection: Selection;
  hover: { type: "variant" | "location" | "poi"; id: string; x: number; y: number } | null;
  query: string;
  filters: Filters;
  style: StyleId;
  layers: { terrain: boolean; hillshade: boolean; density: boolean; pois: boolean; hairpins: boolean };
  exploreOpen: boolean;
  contribute: ContributeIntent | null;
  draw: DrawState;
  detailTab: DetailTab;
  /** Mobile bottom-sheet height. */
  sheet: "peek" | "half" | "full";
  lightbox: { ids: string[]; index: number } | null;
  /** Several overlapping routes under a tap — the user picks one. */
  pick: { x: number; y: number; ids: string[] } | null;
  toast: string | null;
  mapError: string | null;
  auth: AuthState;
  /** design exploration look (design/explorations branch) */
  look: Look;
  /** Shared mode: may anonymous visitors read? (atlas_settings.public_read) */
  publicRead: boolean;
  loadError: string | null;
}

export interface ViewState {
  zoom: number;
  center: Coord;
  pitch: number;
  bearing: number;
  cursor: Coord | null;
  visibleVariantIds: string[];
  /** Point on the selected route under the elevation-profile cursor. */
  profileCursor: Coord | null;
}

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const p = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const EMPTY_DRAW: DrawState = {
  active: false,
  purpose: "route",
  waypoints: [],
  coords: [],
  snap: true,
  snapStatus: "idle",
  snapError: null,
  reference: null,
};

export const app = createStore<AppState>({
  data: null,
  selection: null,
  hover: null,
  query: "",
  filters: DEFAULT_FILTERS,
  style: "dark",
  layers: { terrain: true, hillshade: true, density: true, pois: true, hairpins: false },
  exploreOpen: true,
  contribute: null,
  draw: EMPTY_DRAW,
  detailTab: "overview",
  sheet: "half",
  lightbox: null,
  pick: null,
  toast: null,
  mapError: null,
  auth: { status: SHARED_MODE ? "loading" : "disabled" },
  publicRead: false,
  loadError: null,
  look: DEFAULT_LOOK,
});

export const view = createStore<ViewState>({
  zoom: 1.6,
  center: [10, 35],
  pitch: 0,
  bearing: 0,
  cursor: null,
  visibleVariantIds: [],
  profileCursor: null,
});

export function useApp<U>(sel: (s: AppState) => U): U {
  return useSyncExternalStore(app.subscribe, () => sel(app.get()), () => sel(app.get()));
}
export function useView<U>(sel: (s: ViewState) => U): U {
  return useSyncExternalStore(view.subscribe, () => sel(view.get()), () => sel(view.get()));
}

// ---- repository-backed actions ---------------------------------------------

export const repository: AtlasRepository = SHARED_MODE ? new SharedRepository(supabase()) : new LocalDemoRepository();
/** Direct-editing API — only in shared mode. */
export const editor: AtlasEditor | null = repository instanceof SharedRepository ? repository : null;

export async function loadData() {
  try {
    app.set({ data: await repository.load(), loadError: null });
  } catch (e) {
    app.set({ loadError: e instanceof Error ? e.message : "Loading failed" });
  }
}

export const canEdit = (s: AppState) => s.auth.status === "member";
export function useCanEdit() {
  return useApp(canEdit);
}

// ---- shared mode: auth + realtime -------------------------------------------

let started = false;
/** Wire up session tracking and live refresh (once, client side). */
export function startShared() {
  if (!SHARED_MODE || started) return;
  started = true;
  const sb = supabase();

  // Someone else saved → reload (debounced). Realtime respects RLS, so the channel is
  // (re)joined after the session is known — joining as anonymous would receive nothing.
  let t: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(t);
    t = setTimeout(() => void loadData(), 400);
  };
  let ch: ReturnType<typeof sb.channel> | null = null;
  const subscribe = async (accessToken: string | undefined) => {
    if (ch) await sb.removeChannel(ch);
    await sb.realtime.setAuth(accessToken ?? null);
    ch = sb.channel("atlas-changes");
    for (const table of ["locations", "variants", "pois", "photos"]) ch.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    ch.subscribe();
  };

  const resolve = async (session: { user: { id: string; email?: string }; access_token?: string } | null) => {
    if (!session) {
      app.set({ auth: { status: "signed_out" } });
    } else {
      const { data } = await sb.from("members").select("display_name").eq("user_id", session.user.id).maybeSingle();
      app.set({
        auth: data
          ? { status: "member", email: session.user.email ?? "", name: data.display_name as string, userId: session.user.id }
          : { status: "not_member", email: session.user.email },
      });
    }
    const { data: st } = await sb.from("atlas_settings").select("public_read").maybeSingle();
    app.set({ publicRead: !!st?.public_read });
    await loadData();
    await subscribe(session?.access_token);
  };
  sb.auth.getSession().then(({ data }) => resolve(data.session));
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void resolve(session);
  });
}

export async function sendMagicLink(email: string) {
  const { error } = await supabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    // invitation only: unknown addresses are refused instead of creating accounts
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  });
  if (error) {
    if (/signups? not allowed|not found|Invalid login/i.test(error.message)) throw new Error("This email hasn't been invited to the atlas.");
    if (/rate limit|security purposes/i.test(error.message)) throw new Error("Too many links requested — wait a minute and try again.");
    throw new Error(error.message);
  }
}

export async function signOut() {
  await supabase().auth.signOut();
}

/** Run an edit, then reload so the map shows what is now in the shared database. */
export async function runEdit<T>(fn: (e: AtlasEditor) => Promise<T>, done?: string): Promise<T> {
  if (!editor) throw new Error("Editing needs the shared atlas (Supabase) to be configured.");
  const r = await fn(editor);
  await loadData();
  if (done) toast(done);
  return r;
}

export async function submitContribution(input: ContributionInput) {
  const c = await repository.submitContribution(input);
  await loadData();
  return c;
}

export async function addMedia(input: MediaInput) {
  const m = await repository.addMedia(input);
  await loadData();
  return m;
}

export async function removeOwnMedia(id: string) {
  await repository.removeOwnMedia(id);
  if (editor) toast("Photo removed — undo from History if that was a mistake.");
  app.set({ lightbox: null });
  await loadData();
}

/** Select a road record or variant and show its detail (mobile: half sheet). */
export function openDetail(sel: NonNullable<Selection>, tab: DetailTab = "overview") {
  app.set({ selection: sel, contribute: null, detailTab: tab, sheet: "half", pick: null });
}

export async function resetLocalContributions() {
  await repository.resetLocal();
  app.set({ selection: null });
  await loadData();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  app.set({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => app.set({ toast: null }), 3800);
}
