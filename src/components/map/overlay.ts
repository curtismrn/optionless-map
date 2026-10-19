// Route overlay: sources, layers and GeoJSON builders.
//
// Zoom bands
//   0–6   density heatmap + clustered location pins (regional indicators)
//   4–12  location pins with variant counts
//   5.5+  variant geometry (lines fade in), hover & selection
//   11+   route labels, POIs, detected hairpins, direction chevrons

import type { Map as MLMap, ExpressionSpecification, GeoJSONSource, LayerSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { MOTORSPORT_ACTIVITIES, ACTIVITY_CODE, type Location, type Poi, type Variant } from "@/lib/domain/schema";
import { samplePoints, sliceByDistance, lineLength, type Coord } from "@/lib/geo";
import { variantPasses, locationPasses, mediaIndex, type Filters } from "@/lib/search";
import type { AppState } from "@/lib/store";

export const C = {
  ice: "#8fd6ea",
  amber: "#e6a43c",
  signal: "#e0664c",
  white: "#f4f6f7",
  community: "#b8a6f2",
  ink: "#0b0e11",
};

export const HIT_LAYERS = ["om-var-hit"];
export const LOCATION_LAYERS = ["om-loc-point", "om-loc-cluster"];
export const POI_LAYERS = ["om-poi"];
const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

type Data = NonNullable<AppState["data"]>;

const fc = <G extends LineString | Point>(features: Feature<G>[]): FeatureCollection<G> => ({ type: "FeatureCollection", features });

/** Variant code within its location: V1, V2 … by declaration order. */
export function variantCodes(variants: Variant[]): Map<string, string> {
  const counters = new Map<string, number>();
  const out = new Map<string, string>();
  for (const v of variants) {
    const n = (counters.get(v.locationId) ?? 0) + 1;
    counters.set(v.locationId, n);
    out.set(v.id, `V${n}`);
  }
  return out;
}

export function buildCollections(data: Data, filters: Filters, selection: AppState["selection"]) {
  const locById = new Map(data.locations.map((l) => [l.id, l]));
  const codes = variantCodes(data.variants);
  const withMedia = mediaIndex(data.media);
  const visibleVariants = data.variants.filter((v) => variantPasses(v, locById.get(v.locationId), filters, withMedia));
  const mediaCount = new Map<string, number>();
  const variantLoc = new Map(data.variants.map((v) => [v.id, v.locationId]));
  for (const m of data.media) {
    if (m.status === "removed") continue;
    const locId = m.attachedTo.type === "location" ? m.attachedTo.id : variantLoc.get(m.attachedTo.id);
    if (locId) mediaCount.set(locId, (mediaCount.get(locId) ?? 0) + 1);
  }

  const variantProps = (v: Variant) => {
    const loc = locById.get(v.locationId);
    return {
      id: v.id,
      locationId: v.locationId,
      name: v.name,
      code: codes.get(v.id) ?? "",
      activityCode: ACTIVITY_CODE[v.activity],
      motorsport: MOTORSPORT_ACTIVITIES.includes(v.activity),
      dashed: v.publication !== "published" || v.provenance.kind === "illustrative",
      community: v.provenance.kind === "community",
      oneWay: v.direction !== "both",
      featured: !!loc?.featured,
    };
  };

  const primaryIds = new Set(
    selection?.type === "variant"
      ? [selection.id]
      : selection?.type === "location"
        ? data.variants.filter((v) => v.locationId === selection.id).map((v) => v.id)
        : [],
  );
  const variants = fc<LineString>(
    visibleVariants.map((v) => ({
      type: "Feature",
      id: v.id,
      properties: { ...variantProps(v), labelled: primaryIds.has(v.id) },
      geometry: { type: "LineString", coordinates: v.geometry.coordinates },
    })),
  );

  const locations = fc<Point>(
    data.locations
      .filter((l) => locationPasses(l, data.variants, filters, withMedia))
      .map((l) => ({
        type: "Feature",
        id: l.id,
        properties: {
          id: l.id,
          name: l.name.toUpperCase(),
          count: visibleVariants.filter((v) => v.locationId === l.id).length,
          media: mediaCount.get(l.id) ?? 0,
          featured: l.featured,
          pending: l.publication !== "published",
        },
        geometry: { type: "Point", coordinates: l.center },
      })),
  );

  const density = fc<Point>(
    visibleVariants.flatMap((v) =>
      samplePoints(v.geometry.coordinates as Coord[], 1500).map((c) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: c },
      })),
    ),
  );

  const visibleIds = new Set(visibleVariants.map((v) => v.id));
  const pois = fc<Point>(
    data.pois
      .filter((p) => p.publication !== "rejected")
      .filter((p) => (p.parent.type === "variant" ? visibleIds.has(p.parent.id) : true))
      .map((p: Poi) => ({
        type: "Feature",
        id: p.id,
        properties: {
          id: p.id,
          name: p.communityLabel ? `“${p.name}”` : p.name,
          community: p.communityLabel || p.provenance.kind === "community",
          pending: p.publication !== "published",
        },
        geometry: { type: "Point", coordinates: p.coordinates },
      })),
  );

  const hairpins = fc<Point>(
    visibleVariants.flatMap((v) =>
      v.detectedHairpins.map((c, i) => ({
        type: "Feature" as const,
        properties: { n: i + 1, variantId: v.id },
        geometry: { type: "Point" as const, coordinates: c },
      })),
    ),
  );

  // Selection: a variant (primary) plus its siblings, or all variants of a location.
  let selLocationId: string | null = null;
  let selVariantId: string | null = null;
  if (selection?.type === "variant") {
    selVariantId = selection.id;
    selLocationId = data.variants.find((v) => v.id === selection.id)?.locationId ?? null;
  } else if (selection?.type === "location") selLocationId = selection.id;
  else if (selection?.type === "poi") {
    const p = data.pois.find((x) => x.id === selection.id);
    if (p?.parent.type === "variant") selVariantId = p.parent.id;
    selLocationId = p?.parent.type === "location" ? p.parent.id : data.variants.find((v) => v.id === selVariantId)?.locationId ?? null;
  }
  // Unapproved suggestions stay out of the atlas unless explicitly opened or opted into.
  const selectedSet = data.variants.filter(
    (v) => v.locationId === selLocationId && (v.publication === "published" || v.id === selVariantId || (filters.includePending && v.publication === "pending_review")),
  );
  const selected = fc<LineString>(
    selectedSet.map((v) => ({
      type: "Feature",
      id: v.id,
      properties: { ...variantProps(v), primary: selVariantId ? v.id === selVariantId : true, group: !selVariantId },
      geometry: { type: "LineString", coordinates: v.geometry.coordinates },
    })),
  );
  const primary = selVariantId ? data.variants.find((v) => v.id === selVariantId) : undefined;
  const endpoints = fc<Point>(
    primary
      ? [
          { type: "Feature", properties: { kind: "start", label: "START" }, geometry: { type: "Point", coordinates: primary.geometry.coordinates[0]! } },
          { type: "Feature", properties: { kind: "end", label: "FINISH" }, geometry: { type: "Point", coordinates: primary.geometry.coordinates.at(-1)! } },
        ]
      : [],
  );

  // Mountain roads are too tortuous for line-placed text, so labels sit on each route midpoint.
  const midpoint = (coords: Coord[]): Coord => {
    const half = lineLength(coords) / 2;
    return sliceByDistance(coords, 0, half).at(-1) ?? coords[0]!;
  };
  const labelPoint = (f: Feature<LineString>): Feature<Point> => ({
    type: "Feature",
    properties: f.properties,
    geometry: { type: "Point", coordinates: midpoint(f.geometry.coordinates as Coord[]) },
  });
  const variantLabels = fc<Point>(variants.features.map(labelPoint));
  const selectedLabels = fc<Point>(selected.features.map(labelPoint));

  return { variants, locations, density, pois, hairpins, selected, endpoints, variantLabels, selectedLabels, visibleCount: visibleVariants.length };
}

export function buildDraft(draw: AppState["draw"]) {
  return {
    line: fc<LineString>(
      draw.coords.length >= 2
        ? [{ type: "Feature", properties: { snapped: draw.snapStatus === "snapped" }, geometry: { type: "LineString", coordinates: draw.coords } }]
        : [],
    ),
    vertices: fc<Point>(
      draw.waypoints.map((c, i) => ({
        type: "Feature",
        id: i,
        properties: { i, first: i === 0, last: i === draw.waypoints.length - 1 && i > 0 },
        geometry: { type: "Point", coordinates: c },
      })),
    ),
    reference: fc<LineString>(
      draw.reference && draw.reference.length >= 2
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: draw.reference } }]
        : [],
    ),
  };
}

function chevronImage(): ImageData {
  const s = 24;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d")!;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(8, 5);
  ctx.lineTo(16, 12);
  ctx.lineTo(8, 19);
  ctx.stroke();
  return ctx.getImageData(0, 0, s, s);
}

const WIDTH_STOPS = [5, 1, 9, 2, 13, 3.4, 17, 7] as const;

/** Zoom-interpolated width; `at` turns each stop base width into a (possibly data-driven) value. */
const zoomWidth = (at: (base: number) => number | ExpressionSpecification): ExpressionSpecification => {
  const stops: (number | ExpressionSpecification)[] = [];
  for (let i = 0; i < WIDTH_STOPS.length; i += 2) stops.push(WIDTH_STOPS[i]!, at(WIDTH_STOPS[i + 1]!));
  return ["interpolate", ["exponential", 1.4], ["zoom"], ...stops] as unknown as ExpressionSpecification;
};
const lineWidth = (k = 1) => zoomWidth((b) => b * k);

export function addOverlay(map: MLMap, light: boolean) {
  const empty = fc([]);
  const add = (id: string, extra: Record<string, unknown> = {}) => {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty, ...extra } as never);
  };
  // Low tolerance: winding passes must not collapse into straight chords at regional zooms.
  add("om-variants", { promoteId: "id", tolerance: 0.08 });
  add("om-locations", { promoteId: "id", cluster: true, clusterMaxZoom: 4, clusterRadius: 46 });
  add("om-density");
  add("om-pois", { promoteId: "id" });
  add("om-hairpins");
  add("om-selected", { promoteId: "id", tolerance: 0.05 });
  add("om-endpoints");
  add("om-draft-line");
  add("om-draft-vertices", { promoteId: "i" });
  add("om-draft-reference");
  add("om-profile-cursor");
  add("om-sel-labelpts");
  add("om-var-labelpts");

  if (!map.hasImage("om-chevron")) map.addImage("om-chevron", chevronImage(), { sdf: true });

  // Insert route lines beneath the basemap's first label layer so place names stay legible.
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol" && !l.id.startsWith("om-"))?.id;
  const casing = light ? "#ffffff" : C.ink;
  const routeColor: ExpressionSpecification = [
    "case",
    ["boolean", ["get", "community"], false], C.community,
    ["boolean", ["get", "motorsport"], false], C.signal,
    light ? "#0f7f9c" : C.ice,
  ];
  const hovering: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
  const hoverWidth = (k: number, add = 0) => zoomWidth((b) => ["case", hovering, b * k * 1.6 + add, b * k + add]);

  const below: LayerSpecification[] = [
    {
      id: "om-density",
      type: "heatmap",
      source: "om-density",
      maxzoom: 8,
      paint: {
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 10, 4, 22, 7, 40],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 6, 1.4],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(143,214,234,0)",
          0.2, "rgba(143,214,234,0.12)",
          0.6, "rgba(143,214,234,0.28)",
          1, "rgba(230,164,60,0.45)",
        ],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 5, 1, 8, 0],
      },
    },
    {
      id: "om-var-casing",
      type: "line",
      source: "om-variants",
      minzoom: 5,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": casing,
        "line-width": hoverWidth(1, 2.5),
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6.5, 0.85],
      },
    },
    {
      id: "om-var-line",
      type: "line",
      source: "om-variants",
      minzoom: 5,
      filter: ["!", ["get", "dashed"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case", ["boolean", ["feature-state", "hover"], false], light ? "#004e63" : "#d6f3fb", routeColor],
        "line-width": hoverWidth(1),
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6.5, 0.95],
      },
    },
    {
      id: "om-var-dashed",
      type: "line",
      source: "om-variants",
      minzoom: 5,
      filter: ["get", "dashed"],
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["case", ["boolean", ["feature-state", "hover"], false], light ? "#004e63" : "#d6f3fb", routeColor],
        "line-width": hoverWidth(1),
        "line-dasharray": [1.6, 1.4],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6.5, 0.95],
      },
    },
    // selection: group (location) and primary (variant)
    {
      id: "om-sel-glow",
      type: "line",
      source: "om-selected",
      filter: ["get", "primary"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": light ? "#0f7f9c" : C.ice, "line-width": lineWidth(4.2), "line-blur": 6, "line-opacity": 0.35 },
    },
    {
      id: "om-sel-casing",
      type: "line",
      source: "om-selected",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": casing, "line-width": zoomWidth((b) => b * 1.5 + 3), "line-opacity": ["case", ["get", "primary"], 1, 0.6] },
    },
    {
      id: "om-sel-line",
      type: "line",
      source: "om-selected",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case", ["get", "primary"], light ? "#111" : C.white, routeColor],
        "line-width": zoomWidth((b) => ["case", ["get", "primary"], b * 1.5, b * 1.1]),
        "line-opacity": ["case", ["get", "primary"], 1, ["get", "group"], 0.95, 0.55],
      },
    },
  ];
  for (const l of below) if (!map.getLayer(l.id)) map.addLayer(l, firstSymbol);

  const above: LayerSpecification[] = [
    {
      id: "om-var-hit",
      type: "line",
      source: "om-variants",
      minzoom: 5.5,
      paint: { "line-color": "#000", "line-width": 16, "line-opacity": 0.001 },
    },
    {
      id: "om-sel-arrows",
      type: "symbol",
      source: "om-selected",
      filter: ["any", ["get", "primary"], ["get", "oneWay"]],
      minzoom: 9,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 9, 60, 15, 110],
        "icon-image": "om-chevron",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.35, 15, 0.6],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-color": light ? "#fff" : C.ink, "icon-opacity": 0.95 },
    },
    {
      id: "om-var-arrows",
      type: "symbol",
      source: "om-variants",
      filter: ["get", "oneWay"],
      minzoom: 11,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 90,
        "icon-image": "om-chevron",
        "icon-size": 0.4,
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
      },
      paint: { "icon-color": light ? "#0f7f9c" : C.ice, "icon-opacity": 0.8 },
    },
    {
      id: "om-sel-labels",
      type: "symbol",
      source: "om-sel-labelpts",
      filter: ["get", "primary"],
      minzoom: 8,
      layout: {
        "text-field": ["concat", ["get", "code"], " · ", ["upcase", ["get", "name"]]],
        "text-font": FONT_BOLD,
        "text-size": 10.5,
        "text-letter-spacing": 0.08,
        "text-max-width": 14,
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 0.9,
        "text-justify": "auto",
      },
      paint: {
        "text-color": light ? "#111" : C.white,
        "text-halo-color": casing,
        "text-halo-width": 1.6,
        "text-opacity": ["case", ["get", "primary"], 1, 0.75],
      },
    },
    {
      id: "om-var-labels",
      type: "symbol",
      source: "om-var-labelpts",
      filter: ["!", ["get", "labelled"]],
      minzoom: 10.5,
      layout: {
        "text-field": ["upcase", ["get", "name"]],
        "text-font": FONT,
        "text-size": 10,
        "text-letter-spacing": 0.06,
        "text-max-width": 14,
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 0.8,
      },
      paint: { "text-color": light ? "#0f5d72" : C.ice, "text-halo-color": casing, "text-halo-width": 1.5 },
    },
    {
      id: "om-hairpins",
      type: "circle",
      source: "om-hairpins",
      minzoom: 12,
      paint: {
        "circle-radius": 3,
        "circle-color": casing,
        "circle-stroke-color": light ? "#0f7f9c" : C.ice,
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.9,
      },
    },
    {
      id: "om-endpoints",
      type: "circle",
      source: "om-endpoints",
      paint: {
        "circle-radius": 6,
        "circle-color": ["match", ["get", "kind"], "start", casing, light ? "#111" : C.white],
        "circle-stroke-color": light ? "#111" : C.white,
        "circle-stroke-width": 2,
      },
    },
    {
      id: "om-endpoint-labels",
      type: "symbol",
      source: "om-endpoints",
      layout: {
        "text-field": ["get", "label"],
        "text-font": FONT_BOLD,
        "text-size": 9,
        "text-letter-spacing": 0.15,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
      },
      paint: { "text-color": light ? "#111" : C.white, "text-halo-color": casing, "text-halo-width": 1.5 },
    },
    {
      id: "om-poi",
      type: "circle",
      source: "om-pois",
      minzoom: 10,
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 6, 4.5],
        "circle-color": ["case", ["get", "community"], C.community, C.amber],
        "circle-stroke-color": casing,
        "circle-stroke-width": ["case", ["get", "pending"], 2.5, 1.5],
        "circle-opacity": ["case", ["get", "pending"], 0.6, 1],
      },
    },
    {
      id: "om-poi-labels",
      type: "symbol",
      source: "om-pois",
      minzoom: 11,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["case", ["get", "community"], ["literal", ["Noto Sans Italic"]], ["literal", FONT]],
        "text-size": 10,
        "text-offset": [0.9, 0],
        "text-anchor": "left",
        "text-optional": true,
      },
      paint: {
        "text-color": ["case", ["get", "community"], C.community, light ? "#7a4d00" : "#e8c48a"],
        "text-halo-color": casing,
        "text-halo-width": 1.4,
      },
    },
    // locations
    {
      id: "om-loc-cluster",
      type: "circle",
      source: "om-locations",
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 13, 10, 22],
        "circle-color": "rgba(143,214,234,0.14)",
        "circle-stroke-color": C.ice,
        "circle-stroke-width": 1,
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "om-loc-cluster-count",
      type: "symbol",
      source: "om-locations",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count"]],
        "text-font": FONT_BOLD,
        "text-size": 11,
        "text-allow-overlap": true,
      },
      paint: { "text-color": C.ice },
    },
    {
      id: "om-loc-ring",
      type: "circle",
      source: "om-locations",
      filter: ["!", ["has", "point_count"]],
      maxzoom: 12.5,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 9, 10, 13],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": ["case", ["get", "featured"], C.amber, light ? "#0f7f9c" : C.ice],
        "circle-stroke-width": 1,
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 12.5, 0],
      },
    },
    {
      id: "om-loc-point",
      type: "circle",
      source: "om-locations",
      filter: ["!", ["has", "point_count"]],
      maxzoom: 12.5,
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 6.5, 4.5],
        "circle-color": ["case", ["get", "featured"], C.amber, light ? "#0f7f9c" : C.ice],
        "circle-stroke-color": casing,
        "circle-stroke-width": 1.5,
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10, 1, 12.5, 0],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 10, 1, 12.5, 0],
      },
    },
    {
      id: "om-loc-label",
      type: "symbol",
      source: "om-locations",
      filter: ["!", ["has", "point_count"]],
      maxzoom: 12,
      layout: {
        "text-field": [
          "concat",
          ["get", "name"],
          ["case", [">", ["get", "media"], 0], ["concat", "\n", ["to-string", ["get", "media"]], " PHOTOS & CLIPS"], ""],
        ],
        "text-justify": "left",
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 9, 12],
        "text-letter-spacing": 0.1,
        "text-anchor": "left",
        "text-offset": [1.2, 0],
        "text-optional": true,
      },
      paint: {
        "text-color": ["case", ["get", "featured"], light ? "#8a5a00" : "#f0c98a", light ? "#0f5d72" : "#cdeef7"],
        "text-halo-color": casing,
        "text-halo-width": 1.6,
      },
    },
    // draft (contribution drawing)
    {
      id: "om-draft-reference",
      type: "line",
      source: "om-draft-reference",
      paint: { "line-color": C.amber, "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.8 },
    },
    {
      id: "om-draft-line",
      type: "line",
      source: "om-draft-line",
      layout: { "line-join": "round", "line-cap": "round" },
      // Snapped routes draw solid; unsnapped straight segments stay dashed so they read as provisional.
      paint: { "line-color": ["case", ["get", "snapped"], C.white, C.amber], "line-width": 3.5, "line-opacity": 0.95 },
    },
    {
      id: "om-draft-vertices",
      type: "circle",
      source: "om-draft-vertices",
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 8, 6],
        "circle-color": ["case", ["get", "first"], C.white, ["get", "last"], C.amber, C.ink],
        "circle-stroke-color": C.white,
        "circle-stroke-width": 2,
      },
    },
  ];
  above.push({
    id: "om-profile-cursor",
    type: "circle",
    source: "om-profile-cursor",
    paint: { "circle-radius": 6, "circle-color": C.ink, "circle-stroke-color": C.white, "circle-stroke-width": 2.5 },
  });
  for (const l of above) if (!map.getLayer(l.id)) map.addLayer(l);
}

export function setData(map: MLMap, id: string, data: FeatureCollection) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

export function locationOf(data: Data, id: string): Location | undefined {
  return data.locations.find((l) => l.id === id);
}
