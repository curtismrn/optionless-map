// Basemap styles.
//
// Providers (all free for development, attribution required):
//  * OpenFreeMap — OpenMapTiles-schema vector tiles + glyphs, no key.
//    https://openfreemap.org  (data © OpenStreetMap contributors, ODbL)
//  * AWS Terrain Tiles (Mapzen terrarium) — global DEM for hillshade, 3D terrain
//    and contours, no key. https://registry.opendata.aws/terrain-tiles/
//  * MapTiler — satellite imagery, requires NEXT_PUBLIC_MAPTILER_KEY.
//
// DARK and TOPOGRAPHIC are hand-built here; CLASSIC is OpenFreeMap's "liberty".

import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from "maplibre-gl";

export type StyleId = "dark" | "topo" | "satellite" | "classic";

export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

export const STYLE_META: Record<StyleId, { label: string; code: string; note: string; available: boolean; unavailableReason?: string }> = {
  dark: { label: "Dark", code: "DRK", note: "OpenFreeMap vectors · AWS terrain", available: true },
  topo: { label: "Topographic", code: "TOP", note: "Contours from AWS terrain DEM", available: true },
  satellite: {
    label: "Satellite",
    code: "SAT",
    note: "MapTiler satellite imagery",
    available: MAPTILER_KEY.length > 0,
    unavailableReason: "Set NEXT_PUBLIC_MAPTILER_KEY to enable",
  },
  classic: { label: "Classic", code: "CLS", note: "OpenFreeMap Liberty", available: true },
};

const OFM_SOURCE = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const DEM_ATTRIBUTION =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Terrain: Mapzen / AWS Terrain Tiles</a>';

const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];
const FONT_ITALIC = ["Noto Sans Italic"];

const NAME: ExpressionSpecification = ["coalesce", ["get", "name:latin"], ["get", "name_en"], ["get", "name"]];

type Palette = {
  bg: string;
  water: string;
  waterway: string;
  forest: string;
  grass: string;
  ice: string;
  urban: string;
  roadMajor: string;
  roadMid: string;
  roadMinor: string;
  roadCase: string;
  rail: string;
  boundary: string;
  label: string;
  labelStrong: string;
  halo: string;
  hillShadow: string;
  hillHighlight: string;
  hillExaggeration: number;
};

const DARK: Palette = {
  bg: "#15191d",
  water: "#06090c",
  waterway: "#0d1b23",
  forest: "#131a17",
  grass: "#161b1e",
  ice: "#20272c",
  urban: "#1a1f24",
  roadMajor: "#4a535c",
  roadMid: "#363e46",
  roadMinor: "#262d34",
  roadCase: "#0b0e11",
  rail: "#2a3138",
  boundary: "#56606a",
  label: "#7b8791",
  labelStrong: "#aab4bc",
  halo: "#0b0e11",
  hillShadow: "#000000",
  hillHighlight: "#3b454e",
  hillExaggeration: 0.55,
};

const TOPO: Palette = {
  bg: "#171a14",
  water: "#0a1418",
  waterway: "#18303a",
  forest: "#141a12",
  grass: "#151a13",
  ice: "#20261f",
  urban: "#181b16",
  roadMajor: "#6b6550",
  roadMid: "#504c3d",
  roadMinor: "#35342b",
  roadCase: "#11140f",
  rail: "#3a3a30",
  boundary: "#6d6a58",
  label: "#8c8a74",
  labelStrong: "#c2bea2",
  halo: "#11140f",
  hillShadow: "#030402",
  hillHighlight: "#3a4232",
  hillExaggeration: 0.6,
};

function baseLayers(p: Palette, opts: { contours: boolean }): LayerSpecification[] {
  const roads = (id: string, classes: string[], color: string, w: [number, number][], minzoom = 5): LayerSpecification => ({
    id,
    type: "line",
    source: "openmaptiles",
    "source-layer": "transportation",
    minzoom,
    filter: ["match", ["get", "class"], classes, true, false],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], ...w.flat()] as unknown as ExpressionSpecification,
    },
  });

  const layers: LayerSpecification[] = [
    { id: "bg", type: "background", paint: { "background-color": p.bg } },
    {
      id: "landcover-forest",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "wood"],
      paint: { "fill-color": p.forest, "fill-opacity": 0.9 },
    },
    {
      id: "landcover-grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["grass", "farmland", "wetland"], true, false],
      paint: { "fill-color": p.grass, "fill-opacity": 0.6 },
    },
    {
      id: "landcover-ice",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["ice", "rock"], true, false],
      paint: { "fill-color": p.ice, "fill-opacity": 0.8 },
    },
    {
      id: "landuse-urban",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["residential", "commercial", "industrial", "retail"], true, false],
      paint: { "fill-color": p.urban, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 12, 0.9] },
    },
    { id: "hillshade", type: "hillshade", source: "dem-hillshade", paint: {
      "hillshade-shadow-color": p.hillShadow,
      "hillshade-highlight-color": p.hillHighlight,
      "hillshade-accent-color": p.hillShadow,
      "hillshade-exaggeration": p.hillExaggeration,
    } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": p.water } },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      minzoom: 8,
      paint: { "line-color": p.waterway, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2] },
    },
  ];

  if (opts.contours) {
    layers.push(
      {
        id: "contours",
        type: "line",
        source: "contours",
        "source-layer": "contours",
        paint: {
          "line-color": ["case", [">", ["get", "level"], 0], "#8a9a66", "#56633f"],
          "line-width": ["case", [">", ["get", "level"], 0], 1.1, 0.6],
          "line-opacity": 0.9,
        },
      },
      {
        id: "contour-labels",
        type: "symbol",
        source: "contours",
        "source-layer": "contours",
        filter: [">", ["get", "level"], 0],
        layout: {
          "symbol-placement": "line",
          "text-field": ["concat", ["number-format", ["get", "ele"], {}], " m"],
          "text-font": FONT,
          "text-size": 9,
          "symbol-spacing": 400,
        },
        paint: { "text-color": "#a3b27c", "text-halo-color": p.halo, "text-halo-width": 1.2 },
      },
    );
  }

  layers.push(
    {
      id: "boundary-country",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["all", ["<=", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      paint: {
        "line-color": p.boundary,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 10, 1.4],
        "line-dasharray": [3, 2],
      },
    },
    {
      id: "boundary-region",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      minzoom: 5,
      filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": p.boundary, "line-opacity": 0.45, "line-width": 0.6, "line-dasharray": [1, 2] },
    },
    roads("road-minor", ["minor", "service", "track"], p.roadMinor, [[11, 0.3], [16, 3]], 11),
    roads("road-tertiary", ["tertiary"], p.roadMid, [[9, 0.3], [16, 4]], 9),
    roads("road-secondary", ["secondary"], p.roadMid, [[7, 0.4], [16, 5]], 7),
    roads("road-primary", ["primary", "trunk"], p.roadMajor, [[5, 0.4], [16, 6]], 5),
    roads("road-motorway", ["motorway"], p.roadMajor, [[4, 0.5], [16, 7]], 4),
    {
      id: "rail",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 10,
      filter: ["==", ["get", "class"], "rail"],
      paint: { "line-color": p.rail, "line-width": 0.8, "line-dasharray": [4, 3] },
    },
    {
      id: "road-labels",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 12,
      layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FONT, "text-size": 10 },
      paint: { "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.2 },
    },
    {
      id: "water-labels",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      minzoom: 8,
      layout: { "text-field": NAME, "text-font": FONT_ITALIC, "text-size": 10 },
      paint: { "text-color": "#3f6273", "text-halo-color": p.halo, "text-halo-width": 1 },
    },
    {
      id: "peaks",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "mountain_peak",
      minzoom: 10,
      filter: ["has", "ele"],
      layout: {
        "text-field": ["concat", "▲ ", NAME, "\n", ["to-string", ["get", "ele"]], " m"],
        "text-font": FONT,
        "text-size": 9,
        "text-anchor": "top",
        "text-max-width": 8,
      },
      paint: { "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.2 },
    },
    {
      id: "place-minor",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      minzoom: 9,
      filter: ["match", ["get", "class"], ["village", "hamlet", "suburb"], true, false],
      layout: { "text-field": NAME, "text-font": FONT, "text-size": 10 },
      paint: { "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.4 },
    },
    {
      id: "place-town",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      minzoom: 6,
      filter: ["match", ["get", "class"], ["town", "city"], true, false],
      layout: {
        "text-field": NAME,
        "text-font": FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 12, 13],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.08,
      },
      paint: { "text-color": p.labelStrong, "text-halo-color": p.halo, "text-halo-width": 1.4 },
    },
    {
      id: "place-country",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      maxzoom: 7,
      filter: ["==", ["get", "class"], "country"],
      layout: {
        "text-field": NAME,
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 9, 6, 13],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.2,
      },
      paint: { "text-color": "#5d6871", "text-halo-color": p.halo, "text-halo-width": 1.2 },
    },
  );
  return layers;
}

const SKY_DARK = {
  "sky-color": "#06090c",
  "horizon-color": "#18222b",
  "fog-color": "#0b0e11",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.8,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 5, 0.6, 8, 0] as ExpressionSpecification,
};

function demSources(): StyleSpecification["sources"] {
  return {
    "dem-hillshade": { type: "raster-dem", tiles: [TERRARIUM], encoding: "terrarium", tileSize: 256, maxzoom: 14, attribution: DEM_ATTRIBUTION },
    "dem-terrain": { type: "raster-dem", tiles: [TERRARIUM], encoding: "terrarium", tileSize: 256, maxzoom: 14 },
  };
}

export function buildVectorStyle(id: "dark" | "topo", contourTilesUrl?: string): StyleSpecification {
  const p = id === "topo" ? TOPO : DARK;
  const sources: StyleSpecification["sources"] = {
    openmaptiles: { type: "vector", url: OFM_SOURCE },
    ...demSources(),
  };
  if (id === "topo" && contourTilesUrl) {
    sources.contours = { type: "vector", tiles: [contourTilesUrl], maxzoom: 15, attribution: DEM_ATTRIBUTION };
  }
  return {
    version: 8,
    name: `optionless-${id}`,
    glyphs: GLYPHS,
    projection: { type: "globe" },
    sky: SKY_DARK,
    sources,
    layers: baseLayers(p, { contours: id === "topo" && !!contourTilesUrl }),
  };
}

export function buildSatelliteStyle(): StyleSpecification {
  const overlay: LayerSpecification[] = baseLayers(DARK, { contours: false }).filter((l) =>
    ["boundary-country", "road-labels", "place-minor", "place-town", "place-country", "peaks"].includes(l.id),
  );
  return {
    version: 8,
    name: "optionless-satellite",
    glyphs: GLYPHS,
    projection: { type: "globe" },
    sky: SKY_DARK,
    sources: {
      satellite: {
        type: "raster",
        url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${MAPTILER_KEY}`,
        tileSize: 512,
      },
      openmaptiles: { type: "vector", url: OFM_SOURCE },
      ...demSources(),
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0b0e11" } },
      { id: "satellite", type: "raster", source: "satellite", paint: { "raster-saturation": -0.25, "raster-contrast": 0.05 } },
      ...overlay,
    ],
  };
}

/** OpenFreeMap Liberty with globe + DEM sources added so terrain works everywhere. */
export async function buildClassicStyle(): Promise<StyleSpecification> {
  const res = await fetch("https://tiles.openfreemap.org/styles/liberty");
  if (!res.ok) throw new Error(`Classic style unavailable (${res.status})`);
  const style = (await res.json()) as StyleSpecification;
  return {
    ...style,
    projection: { type: "globe" },
    sky: { ...SKY_DARK, "sky-color": "#0b1520", "horizon-color": "#9fb6c8", "fog-color": "#dfe6ea" },
    sources: { ...style.sources, ...demSources() },
  };
}

/** Whether the style is visually light — overlay colours adapt for contrast. */
export const IS_LIGHT: Record<StyleId, boolean> = { dark: false, topo: false, satellite: false, classic: true };
