import type { Contribution, Location, Poi, Variant } from "@/lib/domain/schema";

export interface AtlasSnapshot {
  locations: Location[];
  variants: Variant[];
  pois: Poi[];
  contributions: Contribution[];
}

export type ContributionInput = Omit<Contribution, "id" | "status" | "submittedAt" | "submitter" | "possibleDuplicates">;

/**
 * Data-access boundary. The UI only talks to this interface, so the local demo
 * implementation can be swapped for a Supabase/PostGIS-backed one (server
 * actions or route handlers doing validation, rate limiting and moderation)
 * without touching components.
 */
export interface AtlasRepository {
  readonly kind: "local-demo" | "remote";
  load(): Promise<AtlasSnapshot>;
  submitContribution(input: ContributionInput): Promise<Contribution>;
  /** Demo-only reviewer action; a real backend restricts this to moderators. */
  reviewContribution(id: string, decision: "published" | "rejected"): Promise<Contribution>;
  resetLocal(): Promise<void>;
}
