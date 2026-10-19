"use client";

import { useEffect, useRef } from "react";
import {
  Map as MLMap,
  setWorkerUrl,
  addProtocol,
  AttributionControl,
  ScaleControl,
  type MapMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mlcontour from "maplibre-contour";
import { app, view, type AppState } from "@/lib/store";
import { bboxOf, type BBox, type Coord } from "@/lib/geo";
import { buildVectorStyle, buildSatelliteStyle, buildClassicStyle, IS_LIGHT, TERRARIUM, type StyleId } from "./styles";
import { addOverlay, buildCollections, buildDraft, setData, HIT_LAYERS, LOCATION_LAYERS, POI_LAYERS } from "./overlay";
import { setMapInstance, GLOBAL_VIEW, globalZoom, focusLocation, focusVariant, focusPoint } from "./controller";

setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

// Contours are generated client-side from the same terrarium DEM.
let contourUrl: string | null = null;
function contourTiles(): string {
  if (contourUrl) return contourUrl;
  const dem = new mlcontour.DemSource({ url: TERRARIUM, encoding: "terrarium", maxzoom: 13, worker: true });
  dem.setupMaplibre({ addProtocol: addProtocol as never });
  const url = dem.contourProtocolUrl({
    multiplier: 1,
    thresholds: { 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [25, 100], 14: [20, 100] },
    elevationKey: "ele",
    levelKey: "level",
    contourLayer: "contours",
  });
  contourUrl = url;
  return url;
}

async function styleFor(id: StyleId): Promise<StyleSpecification> {
  if (id === "satellite") return buildSatelliteStyle();
  if (id === "classic") return buildClassicStyle();
  return buildVectorStyle(id, id === "topo" ? contourTiles() : undefined);
}

export default function MapView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let map: MLMap;
    try {
      map = new MLMap({
        container: ref.current,
        style: buildVectorStyle("dark"),
        center: GLOBAL_VIEW.center,
        zoom: globalZoom(),
        minZoom: 0.4,
        maxZoom: 18,
        maxPitch: 75,
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
      });
    } catch (e) {
      app.set({ mapError: e instanceof Error ? e.message : "Map failed to initialise (WebGL2 required)." });
      return;
    }
    setMapInstance(map);
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-left");

    let currentStyle: StyleId = "dark";
    let bboxes = new Map<string, BBox>();
    let hovered: { source: string; id: string | number } | null = null;
    let dragIndex: number | null = null;

    const light = () => IS_LIGHT[currentStyle];

    // ---------- sync store → map ----------
    const pushData = () => {
      const s = app.get();
      if (!s.data || !map.getSource("om-variants")) return;
      const c = buildCollections(s.data, s.filters, s.selection);
      setData(map, "om-variants", c.variants);
      setData(map, "om-locations", c.locations);
      setData(map, "om-density", c.density);
      setData(map, "om-pois", c.pois);
      setData(map, "om-hairpins", c.hairpins);
      setData(map, "om-selected", c.selected);
      setData(map, "om-endpoints", c.endpoints);
      setData(map, "om-sel-labelpts", c.selectedLabels);
      setData(map, "om-var-labelpts", c.variantLabels);
      bboxes = new Map(c.variants.features.map((f) => [String(f.id), bboxOf(f.geometry.coordinates as Coord[])]));
      updateVisible();
    };
    const pushDraft = () => {
      if (!map.getSource("om-draft-line")) return;
      const d = buildDraft(app.get().draw);
      setData(map, "om-draft-line", d.line);
      setData(map, "om-draft-vertices", d.vertices);
      setData(map, "om-draft-reference", d.reference);
    };
    const applyLayers = () => {
      const { layers } = app.get();
      const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      vis("hillshade", layers.hillshade);
      vis("om-density", layers.density);
      vis("om-poi", layers.pois);
      vis("om-poi-labels", layers.pois);
      vis("om-hairpins", layers.hairpins);
      try {
        map.setTerrain(layers.terrain && map.getSource("dem-terrain") ? { source: "dem-terrain", exaggeration: 1.35 } : null);
      } catch {
        /* terrain not ready during style swap */
      }
    };
    const updateVisible = () => {
      const b = map.getBounds();
      const [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const ids: string[] = [];
      const wraps = e - w >= 360;
      for (const [id, [bw, bs, be, bn]] of bboxes) {
        if (bn < s || bs > n) continue;
        if (!wraps && (be < w || bw > e)) continue;
        ids.push(id);
      }
      const c = map.getCenter();
      view.set({ zoom: map.getZoom(), center: [c.lng, c.lat], pitch: map.getPitch(), bearing: map.getBearing(), visibleVariantIds: ids });
    };

    const onStyleLoad = () => {
      addOverlay(map, light());
      pushData();
      pushDraft();
      applyLayers();
    };
    map.on("style.load", onStyleLoad);

    const pushProfileCursor = () => {
      const c = view.get().profileCursor;
      setData(map, "om-profile-cursor", {
        type: "FeatureCollection",
        features: c ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } }] : [],
      });
    };
    let lastCursor = view.get().profileCursor;
    const unsubView = view.subscribe(() => {
      const c = view.get().profileCursor;
      if (c !== lastCursor) {
        lastCursor = c;
        pushProfileCursor();
      }
    });

    let last: AppState = app.get();
    const unsub = app.subscribe(() => {
      const s = app.get();
      if (s.data !== last.data || s.filters !== last.filters || s.selection !== last.selection) pushData();
      if (s.draw !== last.draw) {
        pushDraft();
        map.getCanvas().style.cursor = s.draw.active ? "crosshair" : "";
      }
      if (s.layers !== last.layers) applyLayers();
      if (s.style !== last.style) {
        const next = s.style;
        styleFor(next)
          .then((style) => {
            currentStyle = next;
            map.setStyle(style, { diff: false });
          })
          .catch((err: unknown) => {
            app.set({ style: currentStyle, toast: `Style unavailable: ${err instanceof Error ? err.message : "error"}` });
          });
      }
      last = s;
    });

    // ---------- interactions ----------
    const setHover = (source: string | null, id?: string | number) => {
      if (hovered) map.setFeatureState(hovered, { hover: false });
      hovered = source && id !== undefined ? { source, id } : null;
      if (hovered) map.setFeatureState(hovered, { hover: true });
    };

    let raf = 0;
    map.on("mousemove", (e: MapMouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => view.set({ cursor: [e.lngLat.lng, e.lngLat.lat] }));

      const s = app.get();
      if (s.draw.active) {
        if (dragIndex !== null) {
          const coords = s.draw.coords.slice();
          coords[dragIndex] = [e.lngLat.lng, e.lngLat.lat];
          app.set({ draw: { ...s.draw, coords } });
          return;
        }
        const v = map.queryRenderedFeatures(e.point, { layers: ["om-draft-vertices"] })[0];
        setHover(v ? "om-draft-vertices" : null, v?.id);
        map.getCanvas().style.cursor = v ? "move" : "crosshair";
        return;
      }

      const layers = [...POI_LAYERS, ...LOCATION_LAYERS, ...HIT_LAYERS].filter((l) => map.getLayer(l));
      const f = map.queryRenderedFeatures(e.point, { layers })[0];
      if (!f) {
        setHover(null);
        if (s.hover) app.set({ hover: null });
        map.getCanvas().style.cursor = "";
        return;
      }
      map.getCanvas().style.cursor = "pointer";
      if (f.layer.id === "om-loc-cluster") {
        setHover(null);
        app.set({ hover: null });
        return;
      }
      const source = f.layer.id === "om-var-hit" ? "om-variants" : f.layer.id === "om-poi" ? "om-pois" : "om-locations";
      const type = source === "om-variants" ? "variant" : source === "om-pois" ? "poi" : "location";
      setHover(source, f.id);
      app.set({ hover: { type, id: String(f.properties.id), x: e.point.x, y: e.point.y } });
    });
    map.on("mouseout", () => {
      setHover(null);
      view.set({ cursor: null });
      app.set({ hover: null });
    });

    map.on("mousedown", "om-draft-vertices", (e) => {
      if (!app.get().draw.active || e.originalEvent.button !== 0) return;
      e.preventDefault();
      dragIndex = Number(e.features?.[0]?.properties.i);
      map.dragPan.disable();
    });
    map.on("mouseup", () => {
      if (dragIndex !== null) {
        dragIndex = null;
        map.dragPan.enable();
      }
    });
    map.on("contextmenu", (e) => {
      const s = app.get();
      if (!s.draw.active) return;
      const v = map.queryRenderedFeatures(e.point, { layers: ["om-draft-vertices"] })[0];
      if (!v) return;
      const i = Number(v.properties.i);
      app.set({ draw: { ...s.draw, coords: s.draw.coords.filter((_, k) => k !== i) } });
    });

    map.on("click", async (e) => {
      const s = app.get();
      if (s.draw.active) {
        if (map.queryRenderedFeatures(e.point, { layers: ["om-draft-vertices"] }).length) return;
        const c: Coord = [+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)];
        app.set({ draw: { ...s.draw, coords: s.draw.purpose === "poi" ? [c] : [...s.draw.coords, c] } });
        return;
      }
      const layers = [...POI_LAYERS, ...LOCATION_LAYERS, ...HIT_LAYERS].filter((l) => map.getLayer(l));
      const f = map.queryRenderedFeatures(e.point, { layers })[0];
      if (!f) {
        if (s.selection) app.set({ selection: null });
        return;
      }
      if (f.layer.id === "om-loc-cluster") {
        const src = map.getSource("om-locations") as unknown as { getClusterExpansionZoom(id: number): Promise<number> };
        const zoom = await src.getClusterExpansionZoom(Number(f.properties.cluster_id));
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5, duration: 900 });
        return;
      }
      const id = String(f.properties.id);
      if (f.layer.id === "om-poi") {
        app.set({ selection: { type: "poi", id }, contribute: null });
        focusPoint((f.geometry as GeoJSON.Point).coordinates as Coord, Math.max(map.getZoom(), 14));
      } else if (f.layer.id === "om-loc-point") {
        app.set({ selection: { type: "location", id }, contribute: null });
        focusLocation(id);
      } else {
        app.set({ selection: { type: "variant", id }, contribute: null });
        if (map.getZoom() < 10) focusVariant(id);
      }
    });

    map.on("moveend", updateVisible);
    map.on("load", updateVisible);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);

    return () => {
      unsub();
      unsubView();
      ro.disconnect();
      setMapInstance(null);
      map.remove();
    };
  }, []);

  // Inline sizing: maplibre-gl.css (unlayered) sets `.maplibregl-map { position: relative }`,
  // which beats Tailwind's layered utilities.
  return <div ref={ref} style={{ position: "absolute", inset: 0 }} aria-label="Interactive map" role="region" />;
}
