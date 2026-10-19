"use client";

// Map chrome: status bar, floating camera controls, hover card, toast.

import { useState } from "react";
import { Plus, Minus, Compass, Globe2, Mountain, LocateFixed, PanelLeft } from "lucide-react";
import { app, useApp, useView, toast } from "@/lib/store";
import { ACTIVITY_LABEL, POI_LABEL } from "@/lib/domain/schema";
import { formatCoord, formatKm, lineLength, type Coord } from "@/lib/geo";
import { zoomBy, resetNorth, resetGlobal, getMap } from "@/components/map/controller";
import { STYLE_META } from "@/components/map/styles";
import { IconButton, cn } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";

export function StatusBar() {
  const zoom = useView((s) => s.zoom);
  const cursor = useView((s) => s.cursor);
  const center = useView((s) => s.center);
  const pitch = useView((s) => s.pitch);
  const bearing = useView((s) => s.bearing);
  const visible = useView((s) => s.visibleVariantIds.length);
  const total = useApp((s) => s.data?.variants.filter((v) => v.publication !== "rejected").length ?? 0);
  const style = useApp((s) => s.style);
  const region = useApp((s) => {
    const sel = s.selection;
    if (!sel || !s.data) return null;
    const locId =
      sel.type === "location"
        ? sel.id
        : sel.type === "variant"
          ? s.data.variants.find((v) => v.id === sel.id)?.locationId
          : (() => {
              const p = s.data.pois.find((x) => x.id === sel.id);
              return p?.parent.type === "location" ? p.parent.id : s.data.variants.find((v) => v.id === p?.parent.id)?.locationId;
            })();
    const l = s.data.locations.find((x) => x.id === locId);
    return l ? `${l.regions[0] ?? ""} · ${l.countries.map((c) => COUNTRY_NAMES[c] ?? c).join("/")}` : null;
  });

  const pos = cursor ?? center;
  return (
    <footer className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex h-[30px] items-center gap-4 overflow-hidden border-t border-line bg-ink/92 px-3 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-fg-faint backdrop-blur-md">
      <span title={cursor ? "Cursor position" : "Map centre"}>
        <span className="text-fg-faint">{cursor ? "CUR" : "CTR"}</span> <span className="text-fg-dim tabular-nums">{formatCoord(pos as Coord, 4)}</span>
      </span>
      <span>
        Z <span className="text-fg-dim tabular-nums">{zoom.toFixed(1)}</span>
      </span>
      <span className="hidden sm:inline">
        PITCH <span className="text-fg-dim tabular-nums">{Math.round(pitch)}°</span> BRG{" "}
        <span className="text-fg-dim tabular-nums">{Math.round((bearing + 360) % 360)}°</span>
      </span>
      <span className="hidden md:inline">
        ROUTES IN VIEW <span className="text-fg-dim tabular-nums">{visible}</span>/<span className="tabular-nums">{total}</span>
      </span>
      {region && (
        <span className="hidden truncate lg:inline">
          REGION <span className="text-fg-dim uppercase">{region}</span>
        </span>
      )}
      <span className="flex-1" />
      <span className="hidden md:inline">
        BASEMAP <span className="text-fg-dim">{STYLE_META[style].code}</span>
      </span>
      <span className="hidden lg:inline" title="Seed geometry from OpenStreetMap via OSRM; contributions stored in this browser">
        DATA <span className="text-fg-dim">OSM-DERIVED DEMO SET + LOCAL</span>
      </span>
    </footer>
  );
}

export function MapControls() {
  const terrain = useApp((s) => s.layers.terrain);
  const rightOpen = useApp((s) => !!s.selection || !!s.contribute);
  const exploreOpen = useApp((s) => s.exploreOpen);
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) return toast("Geolocation is not available in this browser.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        getMap()?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 10, duration: 1800 });
      },
      () => {
        setLocating(false);
        toast("Location permission denied or unavailable.");
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute top-[68px] z-20 flex flex-col gap-1 transition-[right] duration-200",
        rightOpen ? "right-3 md:right-[452px]" : "right-3",
      )}
    >
      {!exploreOpen && (
        <IconButton label="Open explorer" onClick={() => app.set({ exploreOpen: true })} className="md:hidden">
          <PanelLeft className="size-4" />
        </IconButton>
      )}
      <IconButton label="Zoom in" onClick={() => zoomBy(1)}>
        <Plus className="size-4" />
      </IconButton>
      <IconButton label="Zoom out" onClick={() => zoomBy(-1)}>
        <Minus className="size-4" />
      </IconButton>
      <IconButton label="Reset north & pitch" onClick={resetNorth}>
        <Compass className="size-4" />
      </IconButton>
      <div className="h-1" />
      <IconButton label="Return to global view" onClick={resetGlobal}>
        <Globe2 className="size-4" />
      </IconButton>
      <IconButton label={terrain ? "Disable 3D terrain" : "Enable 3D terrain"} active={terrain} onClick={() => app.set({ layers: { ...app.get().layers, terrain: !terrain } })}>
        <Mountain className="size-4" />
      </IconButton>
      <IconButton label="Go to my location" onClick={locate} className={locating ? "animate-pulse" : undefined}>
        <LocateFixed className="size-4" />
      </IconButton>
    </div>
  );
}

export function HoverCard() {
  const hover = useApp((s) => s.hover);
  const data = useApp((s) => s.data);
  const drawing = useApp((s) => s.draw.active);
  if (!hover || !data || drawing) return null;

  let kicker = "", title = "", meta = "";
  if (hover.type === "variant") {
    const v = data.variants.find((x) => x.id === hover.id);
    if (!v) return null;
    const loc = data.locations.find((l) => l.id === v.locationId);
    kicker = `${loc?.name ?? ""} · variant`;
    title = v.name;
    meta = `${ACTIVITY_LABEL[v.activity]} · ${formatKm(lineLength(v.geometry.coordinates as Coord[]))}${v.elevation ? ` · +${v.elevation.gainM} m` : ""}`;
  } else if (hover.type === "location") {
    const l = data.locations.find((x) => x.id === hover.id);
    if (!l) return null;
    const n = data.variants.filter((v) => v.locationId === l.id && v.publication !== "rejected").length;
    kicker = `Location · ${l.countries.join("/")}`;
    title = l.name;
    meta = `${n} variant${n === 1 ? "" : "s"} · ${l.regions.slice(0, 2).join(", ")}`;
  } else {
    const p = data.pois.find((x) => x.id === hover.id);
    if (!p) return null;
    kicker = p.communityLabel ? "Community label" : "Point of interest";
    title = p.communityLabel ? `“${p.name}”` : p.name;
    meta = POI_LABEL[p.category];
  }

  return (
    <div
      className="pointer-events-none absolute z-40 max-w-[260px] border border-line-strong bg-ink/95 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      <div className="font-mono text-[9px] tracking-[0.12em] text-fg-faint uppercase">{kicker}</div>
      <div className="text-[12.5px] leading-snug text-white">{title}</div>
      <div className="font-mono text-[10px] text-fg-dim">{meta}</div>
    </div>
  );
}

export function Toast() {
  const msg = useApp((s) => s.toast);
  if (!msg) return null;
  return (
    <div role="status" className="pointer-events-none absolute bottom-12 left-1/2 z-50 -translate-x-1/2 animate-in border border-ice/40 bg-ink/95 px-3 py-2 text-[12px] text-fg">
      {msg}
    </div>
  );
}

export function MapError() {
  const err = useApp((s) => s.mapError);
  if (!err) return null;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-ink">
      <div className="max-w-md border border-line p-5 text-center">
        <div className="om-label mb-2 text-signal">Map unavailable</div>
        <p className="text-[13px] text-fg-dim">{err}</p>
        <p className="mt-2 text-[12px] text-fg-faint">OPTIONLESS MAP needs a browser with WebGL2 enabled.</p>
      </div>
    </div>
  );
}
