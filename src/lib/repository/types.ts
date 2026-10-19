import type { Contribution, Location, MediaItem, Poi, Variant } from "@/lib/domain/schema";

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
