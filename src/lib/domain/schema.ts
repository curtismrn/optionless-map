// Core domain model for OPTIONLESS MAP.
//
// Hierarchy:  Location (geographic parent)
//               └─ Variant (route / activity on that location, own geometry)
//                    └─ Poi (point of interest; may also hang off the Location)
//             Media can attach to any of the three (see future.ts).
//
// Publication status (is it visible?) and verification status (is the geometry
// confirmed?) are deliberately separate axes. Provenance records *where the data
// came from* so the UI can distinguish OSM-derived, community, demo and
// illustrative content.

import { z } from "zod";

export const LngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LngLat = z.infer<typeof LngLat>;

export const LineStringGeometry = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(LngLat).min(2, "A route needs at least two points"),
});
export type LineStringGeometry = z.infer<typeof LineStringGeometry>;

export const ACTIVITY_TYPES = [
  "scenic_drive",
  "mountain_pass",
  "hill_climb",
  "rally_stage",
  "circuit",
  "drift_spot",
  "touge",
  "touring",
  "other",
] as const;
export const ActivityType = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityType>;

/** Activities that describe a competition format rather than a drive. */
export const MOTORSPORT_ACTIVITIES: readonly ActivityType[] = ["hill_climb", "rally_stage", "circuit", "drift_spot"];

export const PublicationStatus = z.enum(["draft", "pending_review", "published", "rejected", "archived", "reported"]);
export type PublicationStatus = z.infer<typeof PublicationStatus>;

export const VerificationStatus = z.enum(["unverified", "community_confirmed", "verified"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

/**
 * osm          – geometry/coordinates derived from OpenStreetMap data
 * community    – submitted by a contributor
 * demo         – editorial demonstration text written for this prototype
 * illustrative – placeholder / concept content; never an exact real-world claim
 */
export const ProvenanceKind = z.enum(["osm", "community", "demo", "illustrative"]);
export type ProvenanceKind = z.infer<typeof ProvenanceKind>;

export const Provenance = z.object({
  kind: ProvenanceKind,
  source: z.string(),
  license: z.string().optional(),
  note: z.string().optional(),
});
export type Provenance = z.infer<typeof Provenance>;

export const Actor = z.object({
  kind: z.enum(["system", "anonymous", "user"]),
  name: z.string(),
});
export type Actor = z.infer<typeof Actor>;

export const Timestamps = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const Continent = z.enum(["Europe", "Asia", "North America", "South America", "Africa", "Oceania"]);
export type Continent = z.infer<typeof Continent>;

export const Location = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string().min(2).max(120),
    summary: z.string().max(600),
    /** ISO 3166-1 alpha-2. Several values = border location. */
    countries: z.array(z.string().length(2)).min(1),
    regions: z.array(z.string()),
    continent: Continent,
    center: LngLat,
    /** Optional general-area polygon, GeoJSON ring. */
    boundary: z.array(LngLat).optional(),
    cover: z.object({ kind: z.enum(["placeholder", "image"]), url: z.string().optional(), credit: z.string().optional() }),
    tags: z.array(z.string()),
    featured: z.boolean().default(false),
    publication: PublicationStatus,
    provenance: Provenance,
    createdBy: Actor,
  })
  .extend(Timestamps.shape);
export type Location = z.infer<typeof Location>;

export const ElevationStats = z.object({
  gainM: z.number(),
  lossM: z.number(),
  minM: z.number(),
  maxM: z.number(),
  /** [distance km, elevation m] */
  profile: z.array(z.tuple([z.number(), z.number()])),
  source: z.string(),
  caveat: z.string().optional(),
});
export type ElevationStats = z.infer<typeof ElevationStats>;

export const Direction = z.enum(["both", "one_way", "recommended"]);
export type Direction = z.infer<typeof Direction>;

export const Variant = z
  .object({
    id: z.string(),
    locationId: z.string(),
    slug: z.string(),
    name: z.string().min(2).max(120),
    description: z.string().max(2000),
    activity: ActivityType,
    geometry: LineStringGeometry,
    elevation: ElevationStats.optional(),
    surface: z.string().optional(),
    countries: z.array(z.string().length(2)).min(1),
    regions: z.array(z.string()),
    /** Geometry is drawn in travel direction when direction != "both". */
    direction: Direction,
    directionNote: z.string().optional(),
    verification: VerificationStatus,
    publication: PublicationStatus,
    provenance: Provenance,
    /** Points the route was drawn through; re-routed along OSM roads when the line is edited. */
    waypoints: z.array(LngLat).optional(),
    /** Turning points >= 150° detected from geometry (heuristic, not authoritative). */
    detectedHairpins: z.array(LngLat).default([]),
    /** Spotted, looks promising, nobody has driven it yet: listed apart and drawn faintly. */
    toScout: z.boolean().optional(),
    createdBy: Actor,
    /** Present when this variant came from a local contribution. */
    contributionId: z.string().optional(),
  })
  .extend(Timestamps.shape);
export type Variant = z.infer<typeof Variant>;

export const POI_CATEGORIES = [
  "drift",
  "meetup",
  "parking",
  "photo_spot",
  "viewpoint",
  "hairpin",
  "notable_corner",
  "motorsport_facility",
  "garage",
  "fuel",
  "food",
  "summit",
  "landmark",
  "roadside",
  "other",
] as const;
export const PoiCategory = z.enum(POI_CATEGORIES);
export type PoiCategory = z.infer<typeof PoiCategory>;

export const Poi = z
  .object({
    id: z.string(),
    /** The road or route the spot belongs to; null for a standalone spot (a car park meet-up, a garage). */
    parent: z.object({ type: z.enum(["location", "variant"]), id: z.string() }).nullable(),
    name: z.string().min(2).max(80),
    /** true = community nickname, not an authoritative place name */
    communityLabel: z.boolean().default(false),
    coordinates: LngLat,
    category: PoiCategory,
    description: z.string().max(600),
    publication: PublicationStatus,
    provenance: Provenance,
    createdBy: Actor,
  })
  .extend(Timestamps.shape);
export type Poi = z.infer<typeof Poi>;

// ---- Media ------------------------------------------------------------------
// Photos and clips attach to a road record (location), one of its variants, or a POI.
// Seed media come from Wikimedia Commons (real, openly licensed, attributed).
// Local uploads live in this browser only (IndexedDB) until a storage backend exists.

export const MediaKind = z.enum(["photo", "clip"]);
export type MediaKind = z.infer<typeof MediaKind>;

export const MediaItem = z.object({
  id: z.string(),
  attachedTo: z.object({ type: z.enum(["location", "variant", "poi"]), id: z.string() }),
  kind: MediaKind,
  /** commons = seed file on Wikimedia Commons; local = this browser only (demo mode); upload = shared storage */
  source: z.enum(["commons", "local", "upload"]),
  title: z.string(),
  /** Display URL (Commons) — local items resolve an object URL at runtime. */
  url: z.string().optional(),
  thumbUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  caption: z.string().max(500).default(""),
  credit: z.string(),
  license: z.string(),
  licenseUrl: z.string().nullable().optional(),
  sourceUrl: z.string().optional(),
  capturedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  /** Media publish immediately (no pre-moderation) but can be reported. */
  status: z.enum(["published", "reported", "removed"]).default("published"),
});
export type MediaItem = z.infer<typeof MediaItem>;

// ---- Contributions ----------------------------------------------------------

export const ContributionKind = z.enum(["new_variant", "geometry_correction", "new_poi", "description_edit", "report"]);
export type ContributionKind = z.infer<typeof ContributionKind>;

export const NewLocationDraft = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  summary: z.string().trim().max(600),
  countries: z.array(z.string().length(2)).min(1, "Pick at least one country"),
  regions: z.array(z.string()),
  continent: Continent,
});
export type NewLocationDraft = z.infer<typeof NewLocationDraft>;

export const VariantDraft = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  description: z.string().trim().max(2000),
  activity: ActivityType,
  direction: Direction,
  surface: z.string().trim().max(60).optional(),
  geometry: LineStringGeometry,
});
export type VariantDraft = z.infer<typeof VariantDraft>;

export const Contribution = z.object({
  id: z.string(),
  kind: ContributionKind,
  status: PublicationStatus,
  submittedAt: z.string(),
  submitter: Actor,
  /** Existing entity this contribution targets (variant / location). */
  targetId: z.string().optional(),
  /** For new variants on a new location. */
  newLocation: NewLocationDraft.optional(),
  locationId: z.string().optional(),
  variant: VariantDraft.optional(),
  /** Geometry corrections keep both so reviewers can compare and reject safely. */
  originalGeometry: LineStringGeometry.optional(),
  proposedGeometry: LineStringGeometry.optional(),
  poi: z
    .object({ name: z.string(), coordinates: LngLat, category: PoiCategory, description: z.string(), communityLabel: z.boolean() })
    .optional(),
  descriptionEdit: z.object({ before: z.string(), after: z.string() }).optional(),
  report: z
    .object({
      subject: z.object({ type: z.enum(["location", "variant", "poi", "media"]), id: z.string() }),
      reason: z.enum(["incorrect_geometry", "duplicate", "wrong_information", "unsafe_or_illegal", "private_location", "copyright", "inappropriate", "other"]),
      details: z.string().max(1000),
    })
    .optional(),
  note: z.string().max(1000).optional(),
  /** Variant ids whose geometry looks similar — flagged for review, never auto-merged. */
  possibleDuplicates: z.array(z.string()).default([]),
});
export type Contribution = z.infer<typeof Contribution>;

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  scenic_drive: "Scenic drive",
  mountain_pass: "Mountain pass",
  hill_climb: "Hill climb",
  rally_stage: "Rally stage",
  circuit: "Circuit",
  drift_spot: "Drift spot",
  touge: "Touge",
  touring: "Touring",
  other: "Other",
};

export const ACTIVITY_CODE: Record<ActivityType, string> = {
  scenic_drive: "SCN",
  mountain_pass: "PAS",
  hill_climb: "HCL",
  rally_stage: "RLY",
  circuit: "CRT",
  drift_spot: "DRF",
  touge: "TGE",
  touring: "TOU",
  other: "OTH",
};

export const POI_LABEL: Record<PoiCategory, string> = {
  drift: "Drift",
  meetup: "Meet-up",
  parking: "Parking",
  garage: "Garage / shop",
  fuel: "Fuel",
  food: "Food / café",
  hairpin: "Hairpin",
  viewpoint: "Viewpoint",
  notable_corner: "Notable corner",
  landmark: "Landmark",
  photo_spot: "Photo spot",
  roadside: "Roadside feature",
  motorsport_facility: "Track / circuit",
  summit: "Summit / col",
  other: "Other",
};

// ---- Direct editing (friends-only shared mode) ------------------------------

export const LocationInput = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  summary: z.string().trim().max(1000),
  countries: z.array(z.string().length(2)).min(1, "Pick at least one country"),
  regions: z.array(z.string().trim().min(1)).max(10),
  continent: Continent,
  center: LngLat,
  tags: z.array(z.string().trim().min(1)).max(20),
  featured: z.boolean(),
});
export type LocationInput = z.infer<typeof LocationInput>;

export const VariantInput = z.object({
  locationId: z.string().min(1, "Choose a road"),
  name: z.string().trim().min(2, "Name is too short").max(120),
  description: z.string().trim().max(2000),
  activity: ActivityType,
  direction: Direction,
  directionNote: z.string().trim().max(200).optional(),
  surface: z.string().trim().max(60).optional(),
  countries: z.array(z.string().length(2)),
  regions: z.array(z.string()),
  geometry: LineStringGeometry,
  waypoints: z.array(LngLat).min(2).max(25).optional(),
  elevation: ElevationStats.optional(),
  detectedHairpins: z.array(LngLat).optional(),
  toScout: z.boolean().optional(),
});
export type VariantInput = z.infer<typeof VariantInput>;

/** A spot: a point members drop on the map (a corner, a viewpoint…) attached to a road or one of its routes. */
export const PoiInput = z.object({
  parent: z.object({ type: z.enum(["location", "variant"]), id: z.string().min(1) }).nullable(),
  name: z.string().trim().min(2, "Name is too short").max(80),
  category: PoiCategory,
  description: z.string().trim().max(600),
  communityLabel: z.boolean(),
  coordinates: LngLat,
});
export type PoiInput = z.infer<typeof PoiInput>;

export const PhotoUpdate = z.object({
  caption: z.string().trim().max(500),
  credit: z.string().trim().max(120),
  license: z.string().trim().min(1).max(60),
  capturedAt: z.string().nullable().optional(),
  attachedTo: z.object({ type: z.enum(["location", "variant", "poi"]), id: z.string() }),
});
export type PhotoUpdate = z.infer<typeof PhotoUpdate>;
