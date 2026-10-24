// Route overlay: sources, layers and GeoJSON builders.
//
// Visual hierarchy (see lib/selection.ts for roles):
//   nothing selected   → calm cyan lines, location pins + names, no route labels until z13
//   location selected  → its routes full cyan, everything else faded, pins of other places dimmed
//   variant selected   → the route drawn white with endpoints and its name; siblings cyan; rest faded
//
// Zoom bands
//   0–7    density glow + clustered location pins
//   5+     route lines fade in
//   ≤12.5  location pins and names (amber = featured)
//   12+    points of interest; 13+ secondary route labels and one-way chevrons

import type { Map as MLMap, ExpressionSpecification, GeoJSONSource, LayerSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Poi, Variant } from "@/lib/domain/schema";
import { samplePoints, sliceByDistance, lineLength, type Coord } from "@/lib/geo";
import { variantPasses, locationPasses, mediaIndex, type Filters } from "@/lib/search";
import { selectionContext, routeRole } from "@/lib/selection";
import type { AppState } from "@/lib/store";
import type { RouteTheme } from "@/lib/look";

export const C = {
  ice: "#8fd6ea",
  amber: "#e6a43c",
  white: "#f4f6f7",
  ink: "#0b0e11",
};

export const HIT_LAYERS = ["om-var-hit"];
export const LOCATION_LAYERS = ["om-loc-point", "om-loc-cluster"];
export const POI_LAYERS = ["om-poi"];
const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

type Data = NonNullable<AppState["data"]>;

const fc = <G extends LineString | Point>(features: Feature<G>[]): FeatureCollection<G> => ({ type: "FeatureCollection", features });

/** Mountain roads are too tortuous for line-placed text, so labels sit on each route's midpoint. */
function midpoint(coords: Coord[]): Coord {
  return sliceByDistance(coords, 0, lineLength(coords) / 2).at(-1) ?? coords[0]!;
}

export function buildCollections(data: Data, filters: Filters, selection: AppState["selection"]) {
  const locById = new Map(data.locations.map((l) => [l.id, l]));
  const withMedia = mediaIndex(data.media);
  const ctx = selectionContext(selection, data.variants, data.pois);

  // The selected route is always drawn, even if a filter or its pending status would hide it.
  const visibleVariants = data.variants.filter((v) => v.id === ctx.variantId || variantPasses(v, locById.get(v.locationId), filters, withMedia));

  const variantFeature = (v: Variant): Feature<LineString> => ({
    type: "Feature",
    id: v.id,
    properties: {
      id: v.id,
      locationId: v.locationId,
      name: v.name,
      role: routeRole(v, ctx),
      dashed: v.publication !== "published" || v.provenance.kind === "illustrative",
      oneWay: v.direction !== "both",
    },
    geometry: { type: "LineString", coordinates: v.geometry.coordinates },
  });
  const variants = fc<LineString>(visibleVariants.map(variantFeature));

  const locations = fc<Point>(
    data.locations
      .filter((l) => l.id === ctx.locationId || locationPasses(l, data.variants, filters, withMedia))
      .map((l) => ({
        type: "Feature",
        id: l.id,
        properties: {
          id: l.id,
          name: l.name,
          featured: l.featured,
          active: l.id === ctx.locationId,
          dimmed: !!ctx.locationId && l.id !== ctx.locationId,
          // featured first, then alphabetical — drives label collision priority
          sort: l.id === ctx.locationId ? 0 : l.featured ? 1 : 2,
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
  const variantLoc = new Map(data.variants.map((v) => [v.id, v.locationId]));
  const pois = fc<Point>(
    data.pois
      .filter((p) => p.publication !== "rejected")
      .filter((p) => (p.parent.type === "variant" ? visibleIds.has(p.parent.id) : true))
      .map((p: Poi) => {
        const locId = p.parent.type === "location" ? p.parent.id : variantLoc.get(p.parent.id);
        return {
          type: "Feature",
          id: p.id,
          properties: {
            id: p.id,
            name: p.communityLabel ? `“${p.name}”` : p.name,
            community: p.communityLabel || p.provenance.kind === "community",
            pending: p.publication !== "published",
            active: !!ctx.locationId && locId === ctx.locationId,
          },
          geometry: { type: "Point", coordinates: p.coordinates },
        };
      }),
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

  const primary = ctx.variantId ? data.variants.find((v) => v.id === ctx.variantId) : undefined;
  const selected = fc<LineString>(primary ? [variantFeature(primary)] : []);
  const endpoints = fc<Point>(
    primary
      ? [
          { type: "Feature", properties: { kind: "start", label: "Start" }, geometry: { type: "Point", coordinates: primary.geometry.coordinates[0]! } },
          { type: "Feature", properties: { kind: "end", label: "Finish" }, geometry: { type: "Point", coordinates: primary.geometry.coordinates.at(-1)! } },
        ]
      : [],
  );

  const labels = fc<Point>(
    variants.features.map((f) => ({
      type: "Feature",
      properties: f.properties,
      geometry: { type: "Point", coordinates: midpoint(f.geometry.coordinates as Coord[]) },
    })),
  );

  return { variants, locations, density, pois, hairpins, selected, endpoints, labels, visibleCount: visibleVariants.length };
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

const WIDTH_STOPS = [5, 0.8, 9, 1.6, 13, 3, 17, 6] as const;

/** Zoom-interpolated width; `at` turns each stop base width into a (possibly data-driven) value. */
const zoomWidth = (at: (base: number) => number | ExpressionSpecification): ExpressionSpecification => {
  const stops: (number | ExpressionSpecification)[] = [];
  for (let i = 0; i < WIDTH_STOPS.length; i += 2) stops.push(WIDTH_STOPS[i]!, at(WIDTH_STOPS[i + 1]!));
  return ["interpolate", ["exponential", 1.4], ["zoom"], ...stops] as unknown as ExpressionSpecification;
};

const role = (none: number, sibling: number, faded: number, primary = sibling): ExpressionSpecification => [
  "match", ["get", "role"], "none", none, "sibling", sibling, "faded", faded, "primary", primary, none,
];
const hovering: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];

/** Fade lines in from z5 to z7 while respecting their role opacity. */
const fadeIn = (o: ExpressionSpecification): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 5, 0, 7, o];

export function addOverlay(map: MLMap, t: RouteTheme) {
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
  add("om-route-labels");

  if (!map.hasImage("om-chevron")) map.addImage("om-chevron", chevronImage(), { sdf: true });

  // Route lines go beneath the basemap's first label layer so place names stay legible.
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol" && !l.id.startsWith("om-"))?.id;
  const casing = t.casing;
  const cyan = t.route;
  const lineColor: ExpressionSpecification = ["case", hovering, t.routeHover, cyan];
  // primary is drawn by the om-sel-* layers; the base line underneath stays out of the way
  const lineOpacity = fadeIn(["case", hovering, 1, role(0.7, 1, 0.22, 0)]);
  const lineWidth = zoomWidth((b) => ["case", hovering, b * 1.8, role(b, b * 1.25, b * 0.8)] as ExpressionSpecification);

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
          0.2, "rgba(143,214,234,0.10)",
          0.6, "rgba(143,214,234,0.22)",
          1, "rgba(230,164,60,0.38)",
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
        "line-width": zoomWidth((b) => role(b + 2, b * 1.25 + 2.5, b + 1)),
        "line-opacity": fadeIn(role(0.6, 0.85, 0.25, 0)),
      },
    },
    {
      id: "om-var-line",
      type: "line",
      source: "om-variants",
      minzoom: 5,
      filter: ["!", ["get", "dashed"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": lineColor, "line-width": lineWidth, "line-opacity": lineOpacity },
    },
    {
      id: "om-var-dashed",
      type: "line",
      source: "om-variants",
      minzoom: 5,
      filter: ["get", "dashed"],
      layout: { "line-join": "round" },
      paint: { "line-color": lineColor, "line-width": lineWidth, "line-dasharray": [1.6, 1.4], "line-opacity": lineOpacity },
    },
    // the selected route: glow, casing, white line
    {
      id: "om-sel-glow",
      type: "line",
      source: "om-selected",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": t.glow, "line-width": zoomWidth((b) => b * 4.5), "line-blur": 6, "line-opacity": t.glowOpacity },
    },
    {
      id: "om-sel-casing",
      type: "line",
      source: "om-selected",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": casing, "line-width": zoomWidth((b) => b * 1.7 + 3) },
    },
    {
      id: "om-sel-line",
      type: "line",
      source: "om-selected",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": t.selected, "line-width": zoomWidth((b) => b * 1.7) },
    },
  ];
  for (const l of below) if (!map.getLayer(l.id)) map.addLayer(l, firstSymbol);

  const above: LayerSpecification[] = [
    {
      id: "om-var-hit",
      type: "line",
      source: "om-variants",
      minzoom: 5.5,
      paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0.001 },
    },
    {
      id: "om-sel-arrows",
      type: "symbol",
      source: "om-selected",
      minzoom: 10,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 10, 70, 15, 120],
        "icon-image": "om-chevron",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 15, 0.6],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-color": t.selectedIcon, "icon-opacity": 0.95 },
    },
    {
      id: "om-var-arrows",
      type: "symbol",
      source: "om-variants",
      filter: ["all", ["get", "oneWay"], ["match", ["get", "role"], ["none", "sibling"], true, false]],
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 110,
        "icon-image": "om-chevron",
        "icon-size": 0.4,
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
      },
      paint: { "icon-color": cyan, "icon-opacity": 0.7 },
    },
    {
      id: "om-poi",
      type: "circle",
      source: "om-pois",
      minzoom: 12,
      paint: {
        "circle-radius": ["case", hovering, 6, 4],
        "circle-color": ["case", ["get", "community"], t.selected, t.poi],
        "circle-stroke-color": casing,
        "circle-stroke-width": 1.5,
        "circle-opacity": ["case", ["get", "pending"], 0.6, 0.95],
      },
    },
    {
      id: "om-poi-labels",
      type: "symbol",
      source: "om-pois",
      minzoom: 13,
      filter: ["any", ["get", "active"], [">=", ["zoom"], 14.5]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["case", ["get", "community"], ["literal", ["Noto Sans Italic"]], ["literal", FONT]],
        "text-size": 11,
        "text-offset": [0.9, 0],
        "text-anchor": "left",
        "text-optional": true,
        "symbol-sort-key": 30,
      },
      paint: { "text-color": t.poiLabel, "text-halo-color": casing, "text-halo-width": 1.4 },
    },
    {
      id: "om-hairpins",
      type: "circle",
      source: "om-hairpins",
      minzoom: 13,
      paint: { "circle-radius": 3, "circle-color": casing, "circle-stroke-color": cyan, "circle-stroke-width": 1.2 },
    },
    // Route names: the selected route always; other routes only when zoomed in close.
    {
      id: "om-route-labels",
      type: "symbol",
      source: "om-route-labels",
      filter: [
        "case",
        ["==", ["get", "role"], "primary"], [">=", ["zoom"], 7],
        ["==", ["get", "role"], "faded"], false,
        [">=", ["zoom"], 13],
      ],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["case", ["==", ["get", "role"], "primary"], ["literal", FONT_BOLD], ["literal", FONT]],
        "text-size": ["case", ["==", ["get", "role"], "primary"], 13, 11],
        "text-max-width": 12,
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 1,
        "text-justify": "auto",
        "text-padding": 6,
        "symbol-sort-key": ["case", ["==", ["get", "role"], "primary"], 0, 20],
      },
      paint: {
        "text-color": ["case", ["==", ["get", "role"], "primary"], t.selected, t.routeLabel],
        "text-halo-color": casing,
        "text-halo-width": 1.8,
        "text-opacity": ["case", ["==", ["get", "role"], "primary"], 1, 0.8],
      },
    },
    {
      id: "om-endpoints",
      type: "circle",
      source: "om-endpoints",
      paint: {
        "circle-radius": 6,
        "circle-color": ["match", ["get", "kind"], "start", casing, t.selected],
        "circle-stroke-color": t.selected,
        "circle-stroke-width": 2,
      },
    },
    {
      id: "om-endpoint-labels",
      type: "symbol",
      source: "om-endpoints",
      minzoom: 10,
      layout: {
        "text-field": ["get", "label"],
        "text-font": FONT_BOLD,
        "text-size": 10,
        "text-offset": [0, 1.3],
        "text-anchor": "top",
        "text-optional": true,
        "symbol-sort-key": 5,
      },
      paint: { "text-color": t.selected, "text-halo-color": casing, "text-halo-width": 1.5 },
    },
    // locations
    {
      id: "om-loc-cluster",
      type: "circle",
      source: "om-locations",
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 13, 10, 22],
        "circle-color": t.clusterFill,
        "circle-stroke-color": t.cluster,
        "circle-stroke-width": 1,
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "om-loc-cluster-count",
      type: "symbol",
      source: "om-locations",
      filter: ["has", "point_count"],
      layout: { "text-field": ["to-string", ["get", "point_count"]], "text-font": FONT_BOLD, "text-size": 11, "text-allow-overlap": true },
      paint: { "text-color": t.cluster },
    },
    {
      id: "om-loc-point",
      type: "circle",
      source: "om-locations",
      filter: ["!", ["has", "point_count"]],
      maxzoom: 12.5,
      paint: {
        "circle-radius": ["case", hovering, 7, ["get", "active"], 6.5, 5],
        "circle-color": ["case", ["get", "featured"], t.pinFeatured, t.pin],
        "circle-stroke-color": ["case", ["get", "active"], t.pinActive, casing],
        "circle-stroke-width": ["case", ["get", "active"], 2, 1.5],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "dimmed"], 0.35, 1], 12.5, 0],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "dimmed"], 0.35, 1], 12.5, 0],
      },
    },
    {
      id: "om-loc-label",
      type: "symbol",
      source: "om-locations",
      filter: ["!", ["has", "point_count"]],
      maxzoom: 12,
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 9, 13],
        "text-letter-spacing": 0.04,
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": 1,
        "text-optional": true,
        "text-padding": 8,
        "symbol-sort-key": ["get", "sort"],
      },
      paint: {
        "text-color": ["case", ["get", "featured"], t.labelFeatured, t.label],
        "text-halo-color": casing,
        "text-halo-width": 1.6,
        "text-opacity": ["case", ["get", "dimmed"], 0.45, 1],
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
      // Snapped routes draw white; unsnapped straight segments amber so they read as provisional.
      paint: { "line-color": ["case", ["get", "snapped"], C.white, C.amber], "line-width": 3.5, "line-opacity": 0.95 },
    },
    {
      id: "om-draft-vertices",
      type: "circle",
      source: "om-draft-vertices",
      paint: {
        "circle-radius": ["case", hovering, 8, 6],
        "circle-color": ["case", ["get", "first"], C.white, ["get", "last"], C.amber, C.ink],
        "circle-stroke-color": C.white,
        "circle-stroke-width": 2,
      },
    },
    {
      id: "om-profile-cursor",
      type: "circle",
      source: "om-profile-cursor",
      paint: { "circle-radius": 6, "circle-color": C.ink, "circle-stroke-color": C.white, "circle-stroke-width": 2.5 },
    },
  ];
  for (const l of above) if (!map.getLayer(l.id)) map.addLayer(l);
}

export function setData(map: MLMap, id: string, data: FeatureCollection) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}
