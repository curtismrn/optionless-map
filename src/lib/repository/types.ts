import type { Contribution, Location, MediaItem, Poi, Variant, LocationInput, VariantInput, PhotoUpdate, PoiInput } from "@/lib/domain/schema";

export interface AtlasSnapshot {
  locations: Location[];
  variants: Variant[];
  pois: Poi[];
  media: MediaItem[];
  contributions: Contribution[];
}

export type ContributionInput = Omit<Contribution, "id" | "status" | "submittedAt" | "submitter" | "possibleDuplicates">;

export interface MediaInput {
  attachedTo: MediaItem["attachedTo"];
  file: File;
  caption: string;
  credit: string;
  license: "CC BY 4.0" | "CC BY-SA 4.0" | "CC0" | "All rights reserved";
  capturedAt?: string;
}

/**
 * Data-access boundary. The UI only talks to this interface, so the local demo
 * implementation can be swapped for a Supabase/PostGIS-backed one (server
 * actions doing validation, auth, rate limiting and moderation) without
 * touching components.
 *
 * Deliberately absent: approve/reject. Reviewing suggestions needs real
 * accounts and roles, so the prototype does not simulate it.
 */
export interface AtlasRepository {
  readonly kind: "local-demo" | "remote";
  load(): Promise<AtlasSnapshot>;
  /** Road suggestions, corrections, POIs, text edits and reports — always enter as pending review. */
  submitContribution(input: ContributionInput): Promise<Contribution>;
  /** Photos and clips on existing roads — published directly, reportable. */
  addMedia(input: MediaInput): Promise<MediaItem>;
  removeOwnMedia(id: string): Promise<void>;
  resetLocal(): Promise<void>;
}

// ---- Direct editing (friends-only shared mode) ------------------------------

export interface EditEntry {
  id: number;
  table: "locations" | "variants" | "pois" | "photos";
  rowId: string;
  action: "insert" | "update" | "delete" | "restore";
  label: string;
  actor: string;
  at: string;
}

/**
 * Members change the shared atlas directly: no approval step. Every write is
 * checked by Row Level Security in the database and logged in `edits`, from
 * which any change can be restored.
 */
export interface AtlasEditor {
  saveLocation(input: LocationInput, id?: string): Promise<string>;
  deleteLocation(id: string): Promise<void>;
  saveVariant(input: VariantInput, id?: string): Promise<string>;
  deleteVariant(id: string): Promise<void>;
  /** Flip a route between "to scout" and driven without touching anything else. */
  setToScout(id: string, toScout: boolean): Promise<void>;
  savePoi(input: PoiInput, id?: string): Promise<string>;
  deletePoi(id: string): Promise<void>;
  addPhoto(input: MediaInput): Promise<void>;
  updatePhoto(id: string, patch: PhotoUpdate): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  listEdits(limit?: number): Promise<EditEntry[]>;
  restoreEdit(id: number): Promise<void>;
}
