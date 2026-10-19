"use client";

// Tiny external store (useSyncExternalStore) — avoids a state library while
// letting the map, which lives outside React's render cycle, read and write it.

import { useSyncExternalStore } from "react";
import type { AtlasSnapshot, ContributionInput } from "@/lib/repository/types";
import { LocalDemoRepository } from "@/lib/repository/local";
import { DEFAULT_FILTERS, type Filters } from "@/lib/search";
import type { StyleId } from "@/components/map/styles";
import type { Coord } from "@/lib/geo";

export type Selection = { type: "location" | "variant" | "poi"; id: string } | null;

export type ContributeIntent =
  | { kind: "new_variant"; locationId?: string }
  | { kind: "geometry_correction"; variantId: string }
  | { kind: "new_poi"; targetId: string }
  | { kind: "description_edit"; variantId: string }
  | { kind: "review" };

export interface DrawState {
  active: boolean;
  purpose: "route" | "poi";
  coords: Coord[];
  /** Geometry being corrected, shown underneath for comparison. */
  reference: Coord[] | null;
}

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

export const EMPTY_DRAW: DrawState = { active: false, purpose: "route", coords: [], reference: null };

export const app = createStore<AppState>({
  data: null,
  selection: null,
  hover: null,
  query: "",
  filters: DEFAULT_FILTERS,
  style: "dark",
  layers: { terrain: true, hillshade: true, density: true, pois: true, hairpins: true },
  exploreOpen: true,
  contribute: null,
  draw: EMPTY_DRAW,
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

export async function reviewContribution(id: string, decision: "published" | "rejected") {
  await repository.reviewContribution(id, decision);
  await loadData();
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
