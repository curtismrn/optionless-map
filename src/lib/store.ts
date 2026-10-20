"use client";

// Tiny external store (useSyncExternalStore) — avoids a state library while
// letting the map, which lives outside React's render cycle, read and write it.

import { useSyncExternalStore } from "react";
import type { AtlasSnapshot, ContributionInput, MediaInput } from "@/lib/repository/types";
import { LocalDemoRepository } from "@/lib/repository/local";
import { DEFAULT_FILTERS, type Filters } from "@/lib/search";
import type { StyleId } from "@/components/map/styles";
import type { Coord } from "@/lib/geo";

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
  | { kind: "my_submissions" };

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

export const repository = new LocalDemoRepository();

export async function loadData() {
  app.set({ data: await repository.load() });
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
