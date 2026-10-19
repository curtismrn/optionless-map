// Curated demonstration dataset.
//
// * Route geometry comes from src/data/generated/routes.json, built by
//   scripts/fetch-routes.mjs: OSRM routes over OpenStreetMap data between
//   OSM-geocoded anchors. It follows real roads but is NOT surveyed: endpoints
//   are approximate and nothing here has been verified by a moderator.
// * Descriptive text is editorial demo copy limited to widely documented facts.
// * Anything conceptual (e.g. the Ibardin hill-climb format) is marked
//   provenance "illustrative".
// * No ratings, popularity, users, events, results or media are invented.

import routesJson from "./generated/routes.json";
import type { Location, Poi, Variant, Provenance, Actor, ElevationStats, LngLat } from "@/lib/domain/schema";
import { sliceByDistance, lineLength, type Coord } from "@/lib/geo";

type GeneratedRoute = {
  coordinates: Coord[];
  lengthM: number;
  elevation: { gainM: number; lossM: number; minM: number; maxM: number; profile: [number, number][] };
  hairpins: Coord[];
};
const ROUTES = (routesJson as unknown as { routes: Record<string, GeneratedRoute>; generatedAt: string }).routes;
export const ROUTES_GENERATED_AT = (routesJson as { generatedAt: string }).generatedAt;

const SEED_DATE = "2026-10-19T00:00:00.000Z";
const SEED_ACTOR: Actor = { kind: "system", name: "OPTIONLESS demo seed" };
const stamps = { createdAt: SEED_DATE, updatedAt: SEED_DATE };

const OSM_GEOMETRY: Provenance = {
  kind: "osm",
  source: "OpenStreetMap contributors · routed via OSRM between OSM-geocoded anchors",
  license: "ODbL 1.0",
  note: "Follows mapped roads; endpoints approximate. Not surveyed or moderator-verified.",
};
const DEMO_TEXT: Provenance = { kind: "demo", source: "OPTIONLESS editorial demo copy" };
const OSM_POINT: Provenance = { kind: "osm", source: "OpenStreetMap (Nominatim lookup)", license: "ODbL 1.0" };

const DEM_SOURCE = "AWS Terrain Tiles (Mapzen terrarium) · 25 m sampling · smoothed";

function route(id: string, extra?: { caveat?: string }): Pick<Variant, "geometry" | "elevation" | "detectedHairpins"> {
  const r = ROUTES[id];
  if (!r) throw new Error(`missing generated route ${id} — run npm run data:fetch`);
  const elevation: ElevationStats = { ...r.elevation, source: DEM_SOURCE, caveat: extra?.caveat };
  return { geometry: { type: "LineString", coordinates: r.coordinates as LngLat[] }, elevation, detectedHairpins: r.hairpins as LngLat[] };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export const SEED_LOCATIONS: Location[] = [
  {
    id: "loc-ibardin",
    slug: "col-d-ibardin",
    name: "Col d'Ibardin",
    summary:
      "Low Basque pass on the France–Spain border between Urrugne (Lapurdi) and Bera (Navarre). The col is lined with the Ibardin ventas, roadside shops on the Spanish side. Several distinct roads and drives meet here.",
    countries: ["FR", "ES"],
    regions: ["Pyrénées-Atlantiques", "Navarra", "Basque Country"],
    continent: "Europe",
    center: [-1.68444, 43.30966],
    cover: { kind: "placeholder" },
    tags: ["basque", "border", "pyrenees", "col"],
    featured: true,
    publication: "published",
    provenance: DEMO_TEXT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "loc-stelvio",
    slug: "passo-dello-stelvio",
    name: "Passo dello Stelvio",
    summary:
      "One of the highest paved passes in the Alps (2,757 m), linking Bormio in Valtellina with Prato allo Stelvio in Val Venosta. The north-eastern ramp is known for its long run of numbered hairpins.",
    countries: ["IT"],
    regions: ["Lombardia", "South Tyrol"],
    continent: "Europe",
    center: [10.45321, 46.52862],
    cover: { kind: "placeholder" },
    tags: ["alps", "hairpins", "high-altitude", "seasonal"],
    featured: true,
    publication: "published",
    provenance: DEMO_TEXT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "loc-transfagarasan",
    slug: "transfagarasan",
    name: "Transfăgărășan (DN7C)",
    summary:
      "High mountain road across the Făgăraș Mountains, reaching about 2,040 m at Bâlea Lac. The high section is usually closed by snow for much of the year — check seasonal opening before travelling.",
    countries: ["RO"],
    regions: ["Sibiu", "Argeș"],
    continent: "Europe",
    center: [24.61705, 45.60331],
    cover: { kind: "placeholder" },
    tags: ["carpathians", "high-altitude", "seasonal", "tunnel"],
    featured: true,
    publication: "published",
    provenance: DEMO_TEXT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "loc-turini",
    slug: "col-de-turini",
    name: "Col de Turini",
    summary:
      "Pass at about 1,600 m in the Alpes-Maritimes hinterland, widely associated with the Rallye Monte-Carlo, which has used the col in its special stages. Open public road outside of closed events.",
    countries: ["FR"],
    regions: ["Alpes-Maritimes"],
    continent: "Europe",
    center: [7.3916, 43.97757],
    cover: { kind: "placeholder" },
    tags: ["alps", "rally-history", "col"],
    featured: false,
    publication: "published",
    provenance: DEMO_TEXT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "loc-irohazaka",
    slug: "irohazaka",
    name: "Irohazaka",
    summary:
      "Pair of one-way mountain roads linking Nikkō with Lake Chūzenji: the First Irohazaka carries descending traffic, the Second ascending. Its curves are traditionally marked with the characters of the iroha poem.",
    countries: ["JP"],
    regions: ["Tochigi"],
    continent: "Asia",
    center: [139.515, 36.735],
    cover: { kind: "placeholder" },
    tags: ["touge", "one-way", "nikko", "hairpins"],
    featured: false,
    publication: "published",
    provenance: DEMO_TEXT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "loc-haruna",
    slug: "mount-haruna",
    name: "Mount Haruna",
    summary:
      "Volcano above Ikaho Onsen with a caldera lake at its summit area. Its winding access roads are strongly associated with touge culture in Japanese automotive media and manga.",
    countries: ["JP"],
    regions: ["Gunma"],
    continent: "Asia",
    center: [138.88, 36.48],
    cover: { kind: "placeholder" },
    tags: ["touge", "volcano", "onsen"],
    featured: false,
    publication: "published",
    provenance: DEMO_TEXT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "loc-pikes",
    slug: "pikes-peak-highway",
    name: "Pikes Peak Highway",
    summary:
      "Toll road climbing to the 4,302 m summit of Pikes Peak, Colorado. The upper part of the road is the venue of the Pikes Peak International Hill Climb, run annually on the closed road.",
    countries: ["US"],
    regions: ["Colorado"],
    continent: "North America",
    center: [-105.02, 38.87],
    cover: { kind: "placeholder" },
    tags: ["toll-road", "high-altitude", "hill-climb-venue"],
    featured: false,
    publication: "published",
    provenance: DEMO_TEXT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "loc-dragon",
    slug: "deals-gap-us129",
    name: "Deals Gap — US 129",
    summary:
      "Section of US 129 north-west of Deals Gap, running from the North Carolina line into Tennessee. Known for its dense sequence of curves; heavily patrolled and shared with large motorcycle traffic.",
    countries: ["US"],
    regions: ["Tennessee", "North Carolina"],
    continent: "North America",
    center: [-83.955, 35.5],
    cover: { kind: "placeholder" },
    tags: ["appalachians", "curves", "motorcycles"],
    featured: false,
    publication: "published",
    provenance: DEMO_TEXT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
];

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

function variant(v: Omit<Variant, "createdBy" | "createdAt" | "updatedAt" | "publication" | "verification" | "provenance"> & Partial<Pick<Variant, "provenance" | "verification" | "publication">>): Variant {
  return {
    publication: "published",
    verification: "unverified",
    provenance: OSM_GEOMETRY,
    createdBy: SEED_ACTOR,
    ...stamps,
    ...v,
  };
}

const ibardinFr = route("ibardin-fr");
const ibardinFrCoords = ibardinFr.geometry.coordinates as Coord[];
const ibardinFrLen = lineLength(ibardinFrCoords);
const hillclimbCoords = sliceByDistance(ibardinFrCoords, ibardinFrLen - 3200, ibardinFrLen) as LngLat[];

export const SEED_VARIANTS: Variant[] = [
  variant({
    id: "var-ibardin-fr",
    locationId: "loc-ibardin",
    slug: "olhette-ascent",
    name: "Olhette ascent — French side",
    description: "Climb from the hamlet of Olhette (Urrugne) through Basque woodland to the col.",
    activity: "mountain_pass",
    ...ibardinFr,
    countries: ["FR"],
    regions: ["Pyrénées-Atlantiques"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-ibardin-es",
    locationId: "loc-ibardin",
    slug: "bera-ascent",
    name: "Bera ascent — Spanish side",
    description: "Climb from Bera (Vera de Bidasoa) in Navarre up to the ventas at the col.",
    activity: "mountain_pass",
    ...route("ibardin-es"),
    countries: ["ES"],
    regions: ["Navarra"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-ibardin-traverse",
    locationId: "loc-ibardin",
    slug: "ibardin-lizuniaga-traverse",
    name: "Ibardin – Lizuniaga traverse",
    description:
      "Border-crossing touring drive: Urrugne over the Col d'Ibardin, down to Bera, then back into France over the Col de Lizuniaga to Sare.",
    activity: "touring",
    ...route("ibardin-loop"),
    countries: ["FR", "ES"],
    regions: ["Pyrénées-Atlantiques", "Navarra"],
    direction: "recommended",
    directionNote: "Drawn Urrugne → Sare; equally drivable in reverse.",
    surface: "Asphalt",
  }),
  variant({
    id: "var-ibardin-hillclimb",
    locationId: "loc-ibardin",
    slug: "upper-french-ramp-hillclimb-concept",
    name: "Upper French ramp — hill-climb format (concept)",
    description:
      "Concept entry showing how a closed-road hill-climb stage would be modelled as its own variant. No documented event is represented; any competitive use requires an authorised, closed-road event.",
    activity: "hill_climb",
    geometry: { type: "LineString", coordinates: hillclimbCoords },
    countries: ["FR"],
    regions: ["Pyrénées-Atlantiques"],
    direction: "one_way",
    directionNote: "Uphill, as a hill-climb would run.",
    detectedHairpins: [],
    provenance: {
      kind: "illustrative",
      source: "Last 3.2 km of the OSM-derived French-side geometry",
      note: "Conceptual stage extent — not a real event course.",
    },
  }),
  variant({
    id: "var-stelvio-bormio",
    locationId: "loc-stelvio",
    slug: "bormio-ramp",
    name: "Bormio ramp — south-west",
    description: "Climb from Bormio through the galleries of the Valtellina side to the pass.",
    activity: "mountain_pass",
    ...route("stelvio-bormio"),
    countries: ["IT"],
    regions: ["Lombardia"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-stelvio-prato",
    locationId: "loc-stelvio",
    slug: "prato-ramp",
    name: "Prato ramp — north-east",
    description: "The classic hairpin staircase from Prato allo Stelvio via Trafoi to the pass.",
    activity: "mountain_pass",
    ...route("stelvio-prato"),
    countries: ["IT"],
    regions: ["South Tyrol"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-transfagarasan-north",
    locationId: "loc-transfagarasan",
    slug: "north-ramp-balea",
    name: "North ramp to Bâlea Lac",
    description: "From Cârțișoara up the glacial valley to the lake and the summit tunnel portal.",
    activity: "mountain_pass",
    ...route("transfagarasan-north"),
    countries: ["RO"],
    regions: ["Sibiu"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-transfagarasan-full",
    locationId: "loc-transfagarasan",
    slug: "full-crossing-vidraru",
    name: "Full crossing to Vidraru Dam",
    description: "North ramp, summit tunnel, then the long southern descent along Lake Vidraru to the dam.",
    activity: "touring",
    ...route("transfagarasan-full", {
      caveat: "DEM sampling ignores the summit tunnel, so the maximum reflects the ridge above it.",
    }),
    countries: ["RO"],
    regions: ["Sibiu", "Argeș"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-turini-bollene",
    locationId: "loc-turini",
    slug: "la-bollene-ramp",
    name: "La Bollène-Vésubie ramp — west",
    description: "Western approach from La Bollène-Vésubie through the forest of Turini.",
    activity: "mountain_pass",
    ...route("turini-bollene"),
    countries: ["FR"],
    regions: ["Alpes-Maritimes"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-turini-sospel",
    locationId: "loc-turini",
    slug: "sospel-moulinet-ramp",
    name: "Sospel – Moulinet ramp — east",
    description: "Eastern approach from Sospel via the village of Moulinet.",
    activity: "mountain_pass",
    ...route("turini-sospel"),
    countries: ["FR"],
    regions: ["Alpes-Maritimes"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-irohazaka-second",
    locationId: "loc-irohazaka",
    slug: "second-irohazaka",
    name: "Second Irohazaka — uphill",
    description: "Ascending one-way road from the valley junction, via the Akechidaira plateau, to Lake Chūzenji.",
    activity: "touge",
    ...route("irohazaka-second"),
    countries: ["JP"],
    regions: ["Tochigi"],
    direction: "one_way",
    directionNote: "Ascending traffic only.",
    surface: "Asphalt",
  }),
  variant({
    id: "var-irohazaka-first",
    locationId: "loc-irohazaka",
    slug: "first-irohazaka",
    name: "First Irohazaka — downhill",
    description: "Descending one-way road from Lake Chūzenji down to Umagaeshi.",
    activity: "touge",
    ...route("irohazaka-first"),
    countries: ["JP"],
    regions: ["Tochigi"],
    direction: "one_way",
    directionNote: "Descending traffic only.",
    surface: "Asphalt",
  }),
  variant({
    id: "var-haruna-ikaho",
    locationId: "loc-haruna",
    slug: "ikaho-to-lake-haruna",
    name: "Ikaho to Lake Haruna",
    description: "Winding climb from the Ikaho Onsen area up to the caldera lake.",
    activity: "touge",
    ...route("haruna-ikaho"),
    countries: ["JP"],
    regions: ["Gunma"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-pikes-highway",
    locationId: "loc-pikes",
    slug: "highway-gate-to-summit",
    name: "Highway gate to summit",
    description:
      "Public toll drive from the gate above Cascade to the summit. The hill-climb course uses only the upper portion of this road and is not drawn here.",
    activity: "scenic_drive",
    ...route("pikes-highway"),
    countries: ["US"],
    regions: ["Colorado"],
    direction: "both",
    surface: "Asphalt",
  }),
  variant({
    id: "var-dragon-us129",
    locationId: "loc-dragon",
    slug: "us129-deals-gap-north-west",
    name: "US 129 — Deals Gap north-west",
    description: "From Deals Gap at the state line north-west along the Little Tennessee watershed.",
    activity: "touring",
    ...route("dragon-us129"),
    countries: ["US"],
    regions: ["Tennessee", "North Carolina"],
    direction: "both",
    surface: "Asphalt",
  }),
];

// ---------------------------------------------------------------------------
// Points of interest
// ---------------------------------------------------------------------------

const firstHairpin = (ibardinFr.detectedHairpins[0] ?? ibardinFrCoords[Math.floor(ibardinFrCoords.length / 2)]!) as LngLat;

export const SEED_POIS: Poi[] = [
  {
    id: "poi-ibardin-col",
    parent: { type: "location", id: "loc-ibardin" },
    name: "Col d'Ibardin",
    communityLabel: false,
    coordinates: [-1.68444, 43.30966],
    category: "summit",
    description: "Mapped mountain-pass node.",
    publication: "published",
    provenance: OSM_POINT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "poi-ibardin-ventas",
    parent: { type: "location", id: "loc-ibardin" },
    name: "Ibardin ventas",
    communityLabel: false,
    coordinates: [-1.68928, 43.31062],
    category: "landmark",
    description: "Roadside shopping area at the col, on the Spanish side of the border.",
    publication: "published",
    provenance: OSM_POINT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "poi-ibardin-nickname-demo",
    parent: { type: "variant", id: "var-ibardin-fr" },
    name: "Virage de la mort",
    communityLabel: true,
    coordinates: firstHairpin,
    category: "notable_corner",
    description:
      "Demonstration of a community-submitted nickname attached to a detected hairpin. Not an official or verified place name.",
    publication: "pending_review",
    provenance: { kind: "illustrative", source: "Demo community label on a geometry-detected hairpin" },
    createdBy: { kind: "anonymous", name: "Demo contributor" },
    ...stamps,
  },
  {
    id: "poi-stelvio-pass",
    parent: { type: "location", id: "loc-stelvio" },
    name: "Passo dello Stelvio — summit",
    communityLabel: false,
    coordinates: [10.45321, 46.52862],
    category: "summit",
    description: "Mapped mountain-pass node, 2,757 m.",
    publication: "published",
    provenance: OSM_POINT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "poi-balea-lac",
    parent: { type: "variant", id: "var-transfagarasan-north" },
    name: "Bâlea Lac",
    communityLabel: false,
    coordinates: [24.61705, 45.60331],
    category: "landmark",
    description: "Glacial lake at the top of the northern ramp.",
    publication: "published",
    provenance: OSM_POINT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "poi-vidraru",
    parent: { type: "variant", id: "var-transfagarasan-full" },
    name: "Vidraru Dam",
    communityLabel: false,
    coordinates: [24.63147, 45.36631],
    category: "landmark",
    description: "Arch dam at the southern end of the reservoir.",
    publication: "published",
    provenance: OSM_POINT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "poi-turini-col",
    parent: { type: "location", id: "loc-turini" },
    name: "Col de Turini",
    communityLabel: false,
    coordinates: [7.3916, 43.97757],
    category: "summit",
    description: "Mapped mountain-pass node.",
    publication: "published",
    provenance: OSM_POINT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "poi-pikes-summit",
    parent: { type: "location", id: "loc-pikes" },
    name: "Pikes Peak summit",
    communityLabel: false,
    coordinates: [-105.04395, 38.8404],
    category: "summit",
    description: "Mapped peak, 4,302 m.",
    publication: "published",
    provenance: OSM_POINT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
  {
    id: "poi-deals-gap",
    parent: { type: "location", id: "loc-dragon" },
    name: "Deals Gap",
    communityLabel: false,
    coordinates: [-83.92082, 35.47395],
    category: "summit",
    description: "Mapped gap on the Tennessee–North Carolina line.",
    publication: "published",
    provenance: OSM_POINT,
    createdBy: SEED_ACTOR,
    ...stamps,
  },
];

export const COUNTRY_NAMES: Record<string, string> = {
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  RO: "Romania",
  JP: "Japan",
  US: "United States",
  DE: "Germany",
  CH: "Switzerland",
  AT: "Austria",
  GB: "United Kingdom",
  PT: "Portugal",
  NO: "Norway",
  AU: "Australia",
  NZ: "New Zealand",
  CA: "Canada",
};
