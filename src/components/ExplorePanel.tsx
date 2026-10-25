"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Route, CircleDot, Layers, SlidersHorizontal, Compass, Star, Camera, LocateFixed, MapPin, Plus } from "lucide-react";
import { app, useApp, useView, openDetail } from "@/lib/store";
import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  type Continent,
  type Location,
  type MediaItem,
  type Poi,
  POI_LABEL,
} from "@/lib/domain/schema";
import { search, locationPasses, mediaIndex, DEFAULT_FILTERS, type Filters, type SearchHit } from "@/lib/search";
import { bboxOf, haversine, type Coord } from "@/lib/geo";
import { roadMedia } from "@/lib/media";
import { focusLocation, focusPoint, focusVariant, getMap } from "@/components/map/controller";
import { openLightbox } from "@/components/media/MediaGallery";
import { StyleSelector } from "@/components/TopBar";
import { Chip, cn } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";

type Tab = "index" | "filters" | "layers";

const CONTINENTS: Continent[] = ["Europe", "Asia", "North America", "South America", "Africa", "Oceania"];

function selectVariant(id: string) {
  openDetail({ type: "variant", id });
  focusVariant(id);
}
function selectLocation(id: string) {
  openDetail({ type: "location", id });
  focusLocation(id);
}

function activeFilterCount(f: Filters) {
  return (
    f.activities.length +
    f.continents.length +
    (f.verification !== "all" ? 1 : 0) +
    (f.entity !== "all" ? 1 : 0) +
    (f.withMedia ? 1 : 0) +
    (f.includePending ? 1 : 0)
  );
}

export function ExplorePanel() {
  const open = useApp((s) => s.exploreOpen);
  const query = useApp((s) => s.query);
  const filters = useApp((s) => s.filters);
  const [tab, setTab] = useState<Tab>("index");
  const nFilters = activeFilterCount(filters);

  if (!open) {
    return (
      <aside className="pointer-events-auto absolute top-[68px] left-3 z-20 hidden flex-col gap-1 md:flex">
        <button
          onClick={() => app.set({ exploreOpen: true })}
          className="grid size-8 place-items-center border border-line bg-panel/90 text-fg-dim hover:text-fg"
          aria-label="Open exploration panel"
          title="Open exploration panel"
        >
          <ChevronRight className="size-4" />
        </button>
      </aside>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "index", label: query ? "Results" : "Discover", icon: <Compass className="size-3.5" /> },
    { id: "filters", label: "Filters", icon: <SlidersHorizontal className="size-3.5" />, badge: nFilters },
    { id: "layers", label: "Layers", icon: <Layers className="size-3.5" /> },
  ];

  return (
    <aside
      className={cn(
        "om-panel om-ticks pointer-events-auto absolute z-20 flex animate-in flex-col",
        // desktop: left column; mobile: bottom drawer
        "inset-x-0 bottom-[30px] max-h-[58vh] md:inset-x-auto md:top-[68px] md:bottom-[42px] md:left-3 md:max-h-none md:w-[348px]",
      )}
      aria-label="Explore"
    >
      <div className="flex h-9 items-stretch border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors",
              tab === t.id ? "text-fg" : "text-fg-faint hover:text-fg-dim",
            )}
          >
            {t.icon}
            {t.label}
            {!!t.badge && <span className="text-ice tabular-nums">{t.badge}</span>}
            {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-px bg-ice" />}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => app.set({ exploreOpen: false })}
          className="px-2.5 text-fg-faint hover:text-fg"
          aria-label="Collapse panel"
          title="Collapse panel"
        >
          <ChevronLeft className="size-4 max-md:rotate-[-90deg]" />
        </button>
      </div>
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === "index" && (query ? <Results /> : <Discover />)}
        {tab === "filters" && <FiltersPane />}
        {tab === "layers" && <LayersPane />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

type Data = NonNullable<ReturnType<typeof app.get>["data"]>;

function coverOf(data: Data, locationId: string): MediaItem | undefined {
  const media = roadMedia(data, locationId);
  return media.find((m) => m.kind === "photo" && (m.width ?? 4) >= (m.height ?? 3)) ?? media[0];
}

function Thumb({ m, className }: { m?: MediaItem; className?: string }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-panel-3", !m && "om-hatch", className)}>
      {m && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.thumbUrl ?? m.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      )}
    </span>
  );
}

/** A road record as a card: cover, name, where, how many routes and media. */
function RoadRow({ l, data, distanceKm, active }: { l: Location; data: Data; distanceKm?: number; active?: boolean }) {
  const media = roadMedia(data, l.id);
  const routes = data.variants.filter((v) => v.locationId === l.id && v.publication === "published").length;
  return (
    <button
      onClick={() => selectLocation(l.id)}
      className={cn("group flex w-full items-center gap-3 px-3 py-2 text-left", active ? "bg-ice/8" : "hover:bg-panel-2")}
    >
      <Thumb m={coverOf(data, l.id)} className="h-12 w-16" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {l.featured && <Star className="size-3 shrink-0 fill-amber text-amber" />}
          <span className="truncate font-display text-[16px] leading-tight font-semibold tracking-[0.02em] text-fg group-hover:text-white">{l.name}</span>
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] tracking-[0.04em] text-fg-faint uppercase">
          {l.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(" / ")}
          {distanceKm !== undefined && ` · ${Math.round(distanceKm)} km away`}
        </span>
        <span className="mt-0.5 flex items-center gap-2.5 font-mono text-[10px] text-fg-dim tabular-nums">
          <span>{routes} route{routes === 1 ? "" : "s"}</span>
          {media.length > 0 ? (
            <span className="flex items-center gap-1 text-ice">
              <Camera className="size-3" /> {media.length} photo{media.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-fg-faint">no photos yet</span>
          )}
        </span>
      </span>
    </button>
  );
}

/** The road a spot belongs to (directly, or through its route). */
function spotRoadId(data: Data, p: Poi): string | undefined {
  return p.parent.type === "location" ? p.parent.id : data.variants.find((v) => v.id === p.parent.id)?.locationId;
}

function spotMedia(data: Data, id: string): MediaItem[] {
  return data.media.filter((m) => m.status !== "removed" && m.attachedTo.type === "poi" && m.attachedTo.id === id);
}

function selectSpot(p: Poi) {
  openDetail({ type: "poi", id: p.id });
  focusPoint(p.coordinates as Coord);
}

/** A spot as a card: its own cover, name, type, road and photo count. */
function SpotRow({ p, data, active }: { p: Poi; data: Data; active?: boolean }) {
  const media = spotMedia(data, p.id);
  const road = data.locations.find((l) => l.id === spotRoadId(data, p));
  return (
    <button onClick={() => selectSpot(p)} className={cn("group flex w-full items-center gap-3 px-3 py-2 text-left", active ? "bg-ice/8" : "hover:bg-panel-2")}>
      {media.length ? (
        <Thumb m={media[0]} className="h-12 w-16" />
      ) : (
        <span className="grid h-12 w-16 shrink-0 place-items-center border border-line text-fg-faint group-hover:text-ice">
          <MapPin className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[16px] leading-tight font-semibold tracking-[0.02em] text-fg group-hover:text-white">{p.name}</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] tracking-[0.04em] text-fg-faint uppercase">
          {POI_LABEL[p.category]}
          {road && ` · ${road.name}`}
        </span>
        <span className="mt-0.5 flex items-center gap-2.5 font-mono text-[10px] text-fg-dim tabular-nums">
          {media.length > 0 ? (
            <span className="flex items-center gap-1 text-ice">
              <Camera className="size-3" /> {media.length} photo{media.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-fg-faint">no photos yet</span>
          )}
        </span>
      </span>
    </button>
  );
}

function SpotsList({ data }: { data: Data }) {
  const selection = useApp((s) => s.selection);
  const isMember = useApp((s) => s.auth.status === "member");
  const visibleIds = useView((s) => s.visibleVariantIds);
  const count = (id: string) => spotMedia(data, id).length;
  const spots = data.pois.filter((p) => p.publication === "published").sort((a, b) => count(b.id) - count(a.id) || a.name.localeCompare(b.name));
  // in view = the spot's route (or a route of its road) is on screen
  const visibleSet = new Set(visibleIds);
  const inView = spots.filter((p) => data.variants.some((v) => (p.parent.type === "variant" ? v.id === p.parent.id : v.locationId === p.parent.id) && visibleSet.has(v.id)));
  const active = selection?.type === "poi" ? selection.id : undefined;
  return (
    <div className="pb-3">
      {isMember && (
        <div className="px-3 pt-3">
          <button
            onClick={() => app.set({ contribute: { kind: "edit_poi", parent: selection && selection.type !== "poi" ? { type: selection.type, id: selection.id } : undefined } })}
            className="flex h-8 w-full items-center justify-center gap-1.5 border border-dashed border-line-strong text-[12px] text-fg-dim hover:border-ice hover:text-ice"
          >
            <Plus className="size-3.5" /> Drop a spot on the map
          </button>
        </div>
      )}
      {inView.length > 0 && inView.length < spots.length && (
        <>
          <div className="flex items-center justify-between px-3 pt-4 pb-1">
            <span className="om-label">In the current view</span>
            <span className="om-label tabular-nums">{inView.length}</span>
          </div>
          <ul>
            {inView.slice(0, 6).map((p) => (
              <li key={p.id}>
                <SpotRow p={p} data={data} active={active === p.id} />
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="px-3 pt-4 pb-1">
        <span className="om-label">All spots · {spots.length}</span>
      </div>
      {spots.length === 0 ? (
        <p className="px-3 py-4 text-[12px] leading-relaxed text-fg-faint">
          No spots yet — a drift corner, a viewpoint, a meet-up car park.{isMember ? " Drop the first one above, then add your photos to it." : ""}
        </p>
      ) : (
        <ul>
          {spots.map((p) => (
            <li key={p.id}>
              <SpotRow p={p} data={data} active={active === p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Results() {
  const query = useApp((s) => s.query);
  const filters = useApp((s) => s.filters);
  const data = useApp((s) => s.data);
  const hits = useMemo(() => (data ? search(query, data, filters) : []), [query, data, filters]);
  const nFilters = activeFilterCount(filters);
  if (!data) return null;

  const go = (h: SearchHit) => {
    if (h.type === "location") selectLocation(h.id);
    else if (h.type === "variant") selectVariant(h.id);
    else {
      openDetail({ type: "poi", id: h.id });
      focusPoint(h.poi.coordinates as Coord);
    }
  };

  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="om-label">
          {hits.length} match{hits.length === 1 ? "" : "es"}
        </span>
        {nFilters > 0 && <span className="om-label text-ice">{nFilters} filter{nFilters > 1 ? "s" : ""} active</span>}
      </div>
      {hits.length === 0 && (
        <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-fg-faint">
          No road in the atlas matches “{query}”.
          <br />
          Search covers mapped roads only. Missing one?{" "}
          <button className="text-ice hover:underline" onClick={() => app.set({ contribute: { kind: "new_variant" }, selection: null })}>
            Suggest it
          </button>
          .
        </p>
      )}
      <ul>
        {hits.map((h) => (
          <li key={`${h.type}-${h.id}`}>
            {h.type === "location" ? (
              <RoadRow l={h.location} data={data} />
            ) : (
              <button onClick={() => go(h)} className="group flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel-2">
                <span className="grid h-12 w-16 shrink-0 place-items-center border border-line text-fg-faint group-hover:text-ice">
                  {h.type === "variant" ? <Route className="size-4" /> : <CircleDot className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{h.type === "variant" ? h.variant.name : h.poi.name}</span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] tracking-[0.04em] text-fg-faint uppercase">
                    {h.type === "variant" && `Route on ${h.location?.name ?? "—"} · ${ACTIVITY_LABEL[h.variant.activity]}`}
                    {h.type === "poi" && `Point · ${h.poi.communityLabel ? "local nickname" : h.poi.category.replace("_", " ")}`}
                  </span>
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const REGIONS: { id: Continent; label: string }[] = [
  { id: "Europe", label: "Europe" },
  { id: "Asia", label: "Japan & Asia" },
  { id: "North America", label: "North America" },
  { id: "South America", label: "South America" },
  { id: "Oceania", label: "Oceania" },
  { id: "Africa", label: "Africa" },
];

function flyToRegion(data: Data, continent: Continent) {
  const ids = new Set(data.locations.filter((l) => l.continent === continent && l.publication === "published").map((l) => l.id));
  const coords = data.variants.filter((v) => ids.has(v.locationId)).flatMap((v) => v.geometry.coordinates as Coord[]);
  if (!coords.length) return;
  const [w, s, e, n] = bboxOf(coords);
  getMap()?.fitBounds([[w, s], [e, n]], { padding: { top: 120, bottom: 80, left: 400, right: 80 }, maxZoom: 9, duration: 2000 });
}

function Discover() {
  const data = useApp((s) => s.data);
  const filters = useApp((s) => s.filters);
  const selection = useApp((s) => s.selection);
  const visibleIds = useView((s) => s.visibleVariantIds);
  const [near, setNear] = useState<{ status: "idle" | "locating" | "ok" | "denied"; at?: Coord }>({ status: "idle" });
  const [view, setView] = useState<"roads" | "spots">("roads");

  if (!data) return <div className="px-3 py-6 font-mono text-[10px] text-fg-faint">LOADING ATLAS…</div>;
  const withMedia = mediaIndex(data.media);
  const locs = data.locations.filter((l) => locationPasses(l, data.variants, filters, withMedia));
  const featured = locs.filter((l) => l.featured);
  const visibleSet = new Set(visibleIds);
  const inViewLocs = locs.filter((l) => data.variants.some((v) => v.locationId === l.id && visibleSet.has(v.id)));
  const selLoc =
    selection?.type === "location" ? selection.id : selection?.type === "variant" ? data.variants.find((v) => v.id === selection.id)?.locationId : undefined;
  const regionCounts = new Map<Continent, number>();
  for (const l of locs) regionCounts.set(l.continent, (regionCounts.get(l.continent) ?? 0) + 1);
  // member uploads (shared) and this browser's photos (demo) first, newest first; then dated Commons photos
  const latest = [
    ...data.media.filter((m) => m.source !== "commons").sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    ...data.media.filter((m) => m.source === "commons" && m.capturedAt).sort((a, b) => (b.capturedAt ?? "").localeCompare(a.capturedAt ?? "")),
  ]
    .filter((m) => m.status !== "removed")
    .slice(0, 6);
  const nSpots = data.pois.filter((p) => p.publication === "published").length;
  const viewToggle = (
    <div className="flex border-b border-line px-3 pt-2.5">
      {(["roads", "spots"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={cn(
            "relative mr-4 pb-2 font-display text-[15px] font-semibold tracking-[0.04em] uppercase transition-colors",
            view === v ? "text-fg" : "text-fg-faint hover:text-fg-dim",
          )}
        >
          {v === "roads" ? "Roads" : "Spots"} <span className="font-mono text-[10px] text-fg-faint tabular-nums">{v === "roads" ? locs.length : nSpots}</span>
          {view === v && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-ice" />}
        </button>
      ))}
    </div>
  );
  if (view === "spots")
    return (
      <>
        {viewToggle}
        <SpotsList data={data} />
      </>
    );

  const locate = () => {
    if (!navigator.geolocation) return setNear({ status: "denied" });
    setNear({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (p) => setNear({ status: "ok", at: [p.coords.longitude, p.coords.latitude] }),
      () => setNear({ status: "denied" }),
      { timeout: 10000, maximumAge: 300000 },
    );
  };
  const nearby =
    near.status === "ok" && near.at
      ? locs.map((l) => ({ l, d: haversine(near.at!, l.center) / 1000 })).sort((a, b) => a.d - b.d).slice(0, 3)
      : [];

  return (
    <div className="pb-3">
      {viewToggle}
      <div className="px-3 pt-3">
        <div className="om-label mb-2">Explore by region</div>
        <div className="flex flex-wrap gap-1">
          {REGIONS.filter((r) => regionCounts.has(r.id)).map((r) => (
            <Chip key={r.id} onClick={() => flyToRegion(data, r.id)}>
              {r.label} <span className="text-fg-faint">{regionCounts.get(r.id)}</span>
            </Chip>
          ))}
          <Chip onClick={locate} className="flex items-center gap-1">
            <LocateFixed className="size-3" /> {near.status === "locating" ? "Locating…" : "Near me"}
          </Chip>
        </div>
        {near.status === "denied" && <p className="mt-1.5 text-[11px] text-fg-faint">Location unavailable or permission denied.</p>}
      </div>
      {nearby.length > 0 && (
        <>
          <div className="px-3 pt-4 pb-1">
            <span className="om-label">Closest to you</span>
          </div>
          <ul>
            {nearby.map(({ l, d }) => (
              <li key={l.id}>
                <RoadRow l={l} data={data} distanceKm={d} active={selLoc === l.id} />
              </li>
            ))}
          </ul>
          <p className="px-3 text-[10.5px] text-fg-faint">The demo atlas is small — the closest road may still be far away.</p>
        </>
      )}

      {featured.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-4 pb-1">
            <span className="om-label">Featured roads</span>
          </div>
          <ul>
            {featured.map((l) => (
              <li key={l.id}>
                <RoadRow l={l} data={data} active={selLoc === l.id} />
              </li>
            ))}
          </ul>
        </>
      )}

      {latest.length > 0 && (
        <>
          <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
            <span className="om-label">Latest photos</span>
          </div>
          <div className="grid grid-cols-3 gap-1 px-3">
            {latest.map((m, i) => {
              const spot = m.attachedTo.type === "poi" ? data.pois.find((p) => p.id === m.attachedTo.id) : undefined;
              const locId = spot ? spotRoadId(data, spot) : m.attachedTo.type === "location" ? m.attachedTo.id : data.variants.find((v) => v.id === m.attachedTo.id)?.locationId;
              const l = data.locations.find((x) => x.id === locId);
              return (
                <button
                  key={m.id}
                  onClick={() => openLightbox(latest, i)}
                  className="group relative aspect-square overflow-hidden bg-panel-3"
                  aria-label={`Photo — ${spot?.name ?? l?.name ?? ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.thumbUrl ?? m.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform group-hover:scale-105" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute right-1 bottom-1 left-1 truncate font-mono text-[8.5px] tracking-[0.06em] text-white/85 uppercase">{spot?.name ?? l?.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center justify-between px-3 pt-4 pb-1">
        <span className="om-label">In the current view</span>
        <span className="om-label tabular-nums">{inViewLocs.length}</span>
      </div>
      {inViewLocs.length === 0 ? (
        <p className="px-3 pb-2 text-[12px] text-fg-faint">No mapped road here yet — pan the map or pick a region.</p>
      ) : (
        <ul>
          {inViewLocs.slice(0, 6).map((l) => (
            <li key={l.id}>
              <RoadRow l={l} data={data} active={selLoc === l.id} />
            </li>
          ))}
        </ul>
      )}

      <div className="px-3 pt-4 pb-1">
        <span className="om-label">All roads · {locs.length}</span>
      </div>
      <ul>
        {locs
          .filter((l) => !l.featured)
          .map((l) => (
            <li key={l.id}>
              <RoadRow l={l} data={data} active={selLoc === l.id} />
            </li>
          ))}
      </ul>
      {locs.length === 0 && (
        <p className="px-3 py-4 text-[12px] leading-relaxed text-fg-faint">
          {data.locations.length === 0 ? "The atlas is empty. Members can add the first road from Edit → New road." : "No roads match the active filters."}
        </p>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------

function FiltersPane() {
  const f = useApp((s) => s.filters);
  const set = (patch: Partial<Filters>) => app.set({ filters: { ...f, ...patch } });
  const toggle = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);

  return (
    <div className="space-y-5 px-3 py-3">
      <div>
        <div className="om-label mb-2">Activity</div>
        <div className="flex flex-wrap gap-1">
          {ACTIVITY_TYPES.map((a) => (
            <Chip key={a} active={f.activities.includes(a)} onClick={() => set({ activities: toggle(f.activities, a) })}>
              {ACTIVITY_LABEL[a]}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <div className="om-label mb-2">Region</div>
        <div className="flex flex-wrap gap-1">
          {CONTINENTS.map((c) => (
            <Chip key={c} active={f.continents.includes(c)} onClick={() => set({ continents: toggle(f.continents, c) })}>
              {c}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <div className="om-label mb-2">Geometry verification</div>
        <div className="flex gap-1">
          {(["all", "verified", "unverified"] as const).map((v) => (
            <Chip key={v} active={f.verification === v} onClick={() => set({ verification: v })}>
              {v}
            </Chip>
          ))}
        </div>
        {f.verification === "verified" && (
          <p className="mt-1.5 text-[11px] text-fg-faint">No route in the demo dataset has been verified by a moderator yet.</p>
        )}
      </div>
      <div>
        <div className="om-label mb-2">Search scope</div>
        <div className="flex gap-1">
          {(
            [
              ["all", "All"],
              ["locations", "Locations"],
              ["variants", "Variants & points"],
            ] as const
          ).map(([v, l]) => (
            <Chip key={v} active={f.entity === v} onClick={() => set({ entity: v })}>
              {l}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <div className="om-label mb-2">Content</div>
        <div className="flex flex-wrap gap-1">
          <Chip active={f.withMedia} onClick={() => set({ withMedia: !f.withMedia })}>
            Has media
          </Chip>
          <Chip active={f.includePending} onClick={() => set({ includePending: !f.includePending })}>
            Show my pending suggestions
          </Chip>
        </div>
        {f.withMedia && <p className="mt-1.5 text-[11px] text-fg-faint">Media uploads are not live yet, so no route has media.</p>}
      </div>
      <button onClick={() => app.set({ filters: DEFAULT_FILTERS })} className="font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase hover:text-fg">
        Reset filters
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LayersPane() {
  const layers = useApp((s) => s.layers);
  const style = useApp((s) => s.style);
  const set = (k: keyof typeof layers) => app.set({ layers: { ...layers, [k]: !layers[k] } });
  const rows: [keyof typeof layers, string, string][] = [
    ["terrain", "3D terrain", "Elevation mesh from AWS Terrain Tiles"],
    ["hillshade", "Hillshade relief", style === "classic" || style === "satellite" ? "Not part of this style" : "Shaded relief under the basemap"],
    ["density", "Route density", "Aggregated activity at global & regional scale"],
    ["pois", "Points of interest", "Corners, viewpoints, landmarks"],
    ["hairpins", "Detected hairpins", "≥150° turns found from geometry (heuristic)"],
  ];
  return (
    <div className="px-3 py-3">
      <div className="om-label mb-2">Basemap</div>
      <StyleSelector className="mb-5 w-full [&>button]:flex-1" />
      <div className="om-label mb-1">Overlays</div>
      <ul>
        {rows.map(([k, label, hint]) => (
          <li key={k}>
            <label className="flex cursor-pointer items-start gap-2.5 py-2">
              <input type="checkbox" checked={layers[k]} onChange={() => set(k)} className="mt-0.5 accent-[#8fd6ea]" />
              <span>
                <span className="block text-[12px] text-fg">{label}</span>
                <span className="block text-[11px] text-fg-faint">{hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="om-label mt-4 mb-2">Legend</div>
      <ul className="space-y-1.5 text-[11px] text-fg-dim">
        <LegendLine color="#8fd6ea" label="Road / drive variant" />
        <LegendLine color="#e0664c" label="Motorsport format (hill climb, rally, circuit, drift)" />
        <LegendLine color="#b8a6f2" label="Community-submitted" />
        <LegendLine color="#f4f6f7" label="Selected" width={4} />
        <LegendLine color="#8fd6ea" dashed label="Pending review or illustrative" />
        <li className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-amber" /> Featured location
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-ice" /> Location
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full border border-ice" /> Detected hairpin
        </li>
      </ul>
    </div>
  );
}

function LegendLine({ color, label, dashed, width = 2.5 }: { color: string; label: string; dashed?: boolean; width?: number }) {
  return (
    <li className="flex items-center gap-2">
      <svg width="26" height="8" aria-hidden>
        <line x1="1" y1="4" x2="25" y2="4" stroke={color} strokeWidth={width} strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </li>
  );
}
