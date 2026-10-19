// Local, dataset-only search. No geocoder: places absent from the dataset are
// not returned, by design.

import { ACTIVITY_LABEL, MOTORSPORT_ACTIVITIES, type ActivityType, type Continent, type Location, type MediaItem, type Poi, type Variant } from "@/lib/domain/schema";
import { COUNTRY_NAMES } from "@/data/seed";

export type SearchHit =
  | { type: "location"; id: string; score: number; location: Location; matched: string }
  | { type: "variant"; id: string; score: number; variant: Variant; location?: Location; matched: string }
  | { type: "poi"; id: string; score: number; poi: Poi; matched: string };

export interface Filters {
  activities: ActivityType[];
  continents: Continent[];
  verification: "all" | "verified" | "unverified";
  entity: "all" | "locations" | "variants";
  withMedia: boolean;
  includePending: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  activities: [],
  continents: [],
  verification: "all",
  entity: "all",
  withMedia: false,
  includePending: false,
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function scoreField(q: string, field: string | undefined, weight: number): number {
  if (!field) return 0;
  const f = norm(field);
  if (f === q) return weight * 3;
  if (f.startsWith(q)) return weight * 2;
  if (f.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return weight * 1.5;
  if (f.includes(q)) return weight;
  return 0;
}

function bestOf(q: string, fields: [string | undefined, number][]): { score: number; matched: string } {
  let score = 0, matched = "";
  for (const [f, w] of fields) {
    const s = scoreField(q, f, w);
    if (s > score) { score = s; matched = f ?? ""; }
  }
  return { score, matched };
}

/** Entity ids (locations, variants, POIs) that have at least one visible photo or clip. */
export function mediaIndex(media: MediaItem[]): Set<string> {
  return new Set(media.filter((m) => m.status !== "removed").map((m) => m.attachedTo.id));
}

/** Does a variant pass the active filters? A variant "has media" if it or its parent road has some. */
export function variantPasses(v: Variant, loc: Location | undefined, f: Filters, withMedia?: Set<string>): boolean {
  if (!f.includePending && v.publication !== "published") return false;
  if (v.publication === "rejected" || v.publication === "archived") return false;
  if (f.activities.length && !f.activities.includes(v.activity)) return false;
  if (f.continents.length && (!loc || !f.continents.includes(loc.continent))) return false;
  if (f.verification === "verified" && v.verification === "unverified") return false;
  if (f.verification === "unverified" && v.verification !== "unverified") return false;
  if (f.withMedia && !(withMedia?.has(v.id) || withMedia?.has(v.locationId))) return false;
  return true;
}

export function locationPasses(l: Location, variants: Variant[], f: Filters, withMedia?: Set<string>): boolean {
  if (!f.includePending && l.publication !== "published") return false;
  if (f.continents.length && !f.continents.includes(l.continent)) return false;
  return variants.some((v) => v.locationId === l.id && variantPasses(v, l, f, withMedia));
}

export function search(
  query: string,
  data: { locations: Location[]; variants: Variant[]; pois: Poi[]; media?: MediaItem[] },
  filters: Filters,
): SearchHit[] {
  const withMedia = mediaIndex(data.media ?? []);
  const q = norm(query.trim());
  if (!q) return [];
  const locById = new Map(data.locations.map((l) => [l.id, l]));
  const hits: SearchHit[] = [];
  const countryNames = (cs: string[]) => cs.map((c) => COUNTRY_NAMES[c] ?? c).join(" ");

  if (filters.entity !== "variants") {
    for (const l of data.locations) {
      if (!locationPasses(l, data.variants, filters, withMedia)) continue;
      const { score, matched } = bestOf(q, [
        [l.name, 10],
        [countryNames(l.countries), 5],
        [l.countries.join(" "), 4],
        [l.regions.join(" "), 5],
        [l.continent, 3],
        [l.tags.join(" "), 4],
      ]);
      if (score > 0) hits.push({ type: "location", id: l.id, score: score + (l.featured ? 0.5 : 0), location: l, matched });
    }
  }
  if (filters.entity !== "locations") {
    for (const v of data.variants) {
      const loc = locById.get(v.locationId);
      if (!variantPasses(v, loc, filters, withMedia)) continue;
      const { score, matched } = bestOf(q, [
        [v.name, 9],
        [loc?.name, 6],
        [ACTIVITY_LABEL[v.activity], 5],
        [MOTORSPORT_ACTIVITIES.includes(v.activity) ? "motorsport" : undefined, 3],
        [countryNames(v.countries), 4],
        [v.regions.join(" "), 4],
        [v.description, 2],
      ]);
      if (score > 0) hits.push({ type: "variant", id: v.id, score, variant: v, location: loc, matched });
    }
    for (const p of data.pois) {
      if (p.publication === "rejected") continue;
      if (!filters.includePending && p.publication !== "published") continue;
      const { score, matched } = bestOf(q, [[p.name, 7], [p.category.replace("_", " "), 3]]);
      if (score > 0) hits.push({ type: "poi", id: p.id, score, poi: p, matched });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 40);
}
