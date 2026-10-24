"use client";

// Map chrome: status bar, floating camera controls, hover card, toast.

import { useState } from "react";
import { Plus, Minus, Compass, Globe2, Mountain, LocateFixed, PanelLeft, X } from "lucide-react";
import { app, useApp, useView, toast, openDetail } from "@/lib/store";
import { ACTIVITY_LABEL, POI_LABEL } from "@/lib/domain/schema";
import { formatCoord, formatKm, lineLength, type Coord } from "@/lib/geo";
import { zoomBy, resetNorth, resetGlobal, getMap, focusVariant, highlightRoute } from "@/components/map/controller";
import { STYLE_META } from "@/components/map/styles";
import { IconButton, cn } from "@/components/ui";
import { SHARED_MODE } from "@/lib/supabase";
import { COUNTRY_NAMES } from "@/data/seed";

export function StatusBar() {
  const zoom = useView((s) => s.zoom);
  const cursor = useView((s) => s.cursor);
  const center = useView((s) => s.center);
  const pitch = useView((s) => s.pitch);
  const bearing = useView((s) => s.bearing);
  const visible = useView((s) => s.visibleVariantIds.length);
  const total = useApp((s) => s.data?.variants.filter((v) => v.publication === "published").length ?? 0);
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
        DATA <span className="text-fg-dim">{SHARED_MODE ? "SHARED ATLAS" : "OSM-DERIVED DEMO SET + LOCAL"}</span>
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
        rightOpen ? "right-3 md:right-[460px]" : "right-3",
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
    kicker = `${loc?.name ?? ""} · route`;
    title = v.name;
    meta = `${ACTIVITY_LABEL[v.activity]} · ${formatKm(lineLength(v.geometry.coordinates as Coord[]))}${v.elevation ? ` · +${v.elevation.gainM} m` : ""}`;
  } else if (hover.type === "location") {
    const l = data.locations.find((x) => x.id === hover.id);
    if (!l) return null;
    const n = data.variants.filter((v) => v.locationId === l.id && v.publication !== "rejected").length;
    kicker = `Road · ${l.countries.join("/")}`;
    title = l.name;
    const photos = data.media.filter((m) => m.attachedTo.id === l.id || data.variants.some((v) => v.locationId === l.id && v.id === m.attachedTo.id)).length;
    meta = `${n} route${n === 1 ? "" : "s"}${photos ? ` · ${photos} photos` : ""}`;
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

/** Shown when a tap lands on several overlapping routes: pick one explicitly. */
export function RoutePicker() {
  const pick = useApp((s) => s.pick);
  const data = useApp((s) => s.data);
  if (!pick || !data) return null;
  const w = typeof window === "undefined" ? 1024 : window.innerWidth;
  const h = typeof window === "undefined" ? 768 : window.innerHeight;
  const left = Math.min(Math.max(8, pick.x + 10), w - 268);
  const top = Math.min(Math.max(64, pick.y + 10), h - 60 - pick.ids.length * 48);
  return (
    <div role="menu" aria-label="Choose a route" className="om-panel pointer-events-auto absolute z-40 w-[260px] animate-in shadow-[0_12px_32px_rgba(0,0,0,0.5)]" style={{ left, top }}>
      <div className="flex items-center justify-between border-b border-line py-1 pr-1 pl-3">
        <span className="om-label">{pick.ids.length} routes here</span>
        <button onClick={() => app.set({ pick: null })} className="grid size-8 place-items-center text-fg-faint hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {pick.ids.map((id) => {
        const v = data.variants.find((x) => x.id === id);
        const l = data.locations.find((x) => x.id === v?.locationId);
        if (!v) return null;
        return (
          <button
            key={id}
            role="menuitem"
            onClick={() => {
              openDetail({ type: "variant", id });
              focusVariant(id);
            }}
            onMouseEnter={() => highlightRoute(id)}
            onMouseLeave={() => highlightRoute(null)}
            className="block min-h-12 w-full px-3 py-2 text-left hover:bg-panel-2"
          >
            <span className="block text-[13px] leading-snug text-fg">{v.name}</span>
            <span className="block text-[11px] text-fg-faint">
              {l?.name} · {formatKm(lineLength(v.geometry.coordinates as Coord[]))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Top-left reminder of what is selected, with an obvious way back to exploring. */
export function SelectionChip() {
  const sel = useApp((s) => s.selection);
  const data = useApp((s) => s.data);
  if (!sel || !data || sel.type === "poi") return null;
  const v = sel.type === "variant" ? data.variants.find((x) => x.id === sel.id) : undefined;
  const l = data.locations.find((x) => x.id === (v ? v.locationId : sel.id));
  if (!l) return null;
  return (
    <div className="pointer-events-auto absolute top-[64px] left-1/2 z-20 flex max-w-[calc(100vw-120px)] -translate-x-1/2 items-center border border-line-strong bg-ink/92 backdrop-blur-md md:top-[68px]">
      <span className="min-w-0 truncate py-1.5 pl-3 text-[12.5px]">
        <span className="text-fg-dim">{l.name}</span>
        {v && <span className="text-white"> · {v.name}</span>}
      </span>
      <button
        onClick={() => app.set({ selection: null, pick: null })}
        className="ml-1 grid size-9 shrink-0 place-items-center border-l border-line text-fg-dim hover:text-white"
        aria-label="Clear selection"
        title="Clear selection (Esc)"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
