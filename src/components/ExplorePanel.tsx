"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Route, CircleDot, Layers, SlidersHorizontal, List, Star } from "lucide-react";
import { app, useApp, useView } from "@/lib/store";
import {
  ACTIVITY_CODE,
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  MOTORSPORT_ACTIVITIES,
  type Continent,
  type Location,
  type Variant,
} from "@/lib/domain/schema";
import { search, variantPasses, locationPasses, DEFAULT_FILTERS, type Filters, type SearchHit } from "@/lib/search";
import { formatKm, lineLength, type Coord } from "@/lib/geo";
import { focusLocation, focusPoint, focusVariant } from "@/components/map/controller";
import { variantCodes } from "@/components/map/overlay";
import { StyleSelector } from "@/components/TopBar";
import { Chip, cn, PublicationBadge, Badge } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";

type Tab = "index" | "filters" | "layers";

const CONTINENTS: Continent[] = ["Europe", "Asia", "North America", "South America", "Africa", "Oceania"];

function selectVariant(id: string) {
  app.set({ selection: { type: "variant", id }, contribute: null });
  focusVariant(id);
}
function selectLocation(id: string) {
  app.set({ selection: { type: "location", id }, contribute: null });
  focusLocation(id);
}

function activeFilterCount(f: Filters) {
  return (
    f.activities.length +
    f.continents.length +
    (f.verification !== "all" ? 1 : 0) +
    (f.entity !== "all" ? 1 : 0) +
    (f.withMedia ? 1 : 0) +
    (!f.includePending ? 1 : 0)
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
    { id: "index", label: query ? "Results" : "Atlas", icon: <List className="size-3.5" /> },
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
        {tab === "index" && (query ? <Results /> : <AtlasIndex />)}
        {tab === "filters" && <FiltersPane />}
        {tab === "layers" && <LayersPane />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function Results() {
  const query = useApp((s) => s.query);
  const filters = useApp((s) => s.filters);
  const data = useApp((s) => s.data);
  const hits = useMemo(() => (data ? search(query, data, filters) : []), [query, data, filters]);
  const nFilters = activeFilterCount(filters);

  const go = (h: SearchHit) => {
    if (h.type === "location") selectLocation(h.id);
    else if (h.type === "variant") selectVariant(h.id);
    else {
      app.set({ selection: { type: "poi", id: h.id }, contribute: null });
      focusPoint(h.poi.coordinates as Coord);
    }
  };

  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="om-label">
          {hits.length} match{hits.length === 1 ? "" : "es"} in dataset
        </span>
        {nFilters > 0 && <span className="om-label text-ice">{nFilters} filter{nFilters > 1 ? "s" : ""} active</span>}
      </div>
      {hits.length === 0 && (
        <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-fg-faint">
          Nothing in the atlas matches “{query}”.
          <br />
          Search covers only mapped locations — there is no external geocoder in this prototype.
        </p>
      )}
      <ul>
        {hits.map((h) => (
          <li key={`${h.type}-${h.id}`}>
            <button onClick={() => go(h)} className="group flex w-full items-start gap-2.5 px-2 py-2 text-left hover:bg-panel-2">
              <span className="mt-0.5 text-fg-faint group-hover:text-ice">
                {h.type === "location" ? <MapPin className="size-3.5" /> : h.type === "variant" ? <Route className="size-3.5" /> : <CircleDot className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] text-fg">{h.type === "location" ? h.location.name : h.type === "variant" ? h.variant.name : h.poi.name}</span>
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] tracking-[0.06em] text-fg-faint">
                  {h.type === "location" && `LOCATION · ${h.location.countries.join("/")} · ${h.location.regions.slice(0, 2).join(", ")}`}
                  {h.type === "variant" && `VARIANT OF ${h.location?.name.toUpperCase() ?? "—"} · ${ACTIVITY_LABEL[h.variant.activity].toUpperCase()}`}
                  {h.type === "poi" && `POINT · ${h.poi.communityLabel ? "COMMUNITY LABEL" : h.poi.category.replace("_", " ").toUpperCase()}`}
                </span>
              </span>
              {h.type === "variant" && <PublicationBadge status={h.variant.publication} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AtlasIndex() {
  const data = useApp((s) => s.data);
  const filters = useApp((s) => s.filters);
  const selection = useApp((s) => s.selection);
  const visibleIds = useView((s) => s.visibleVariantIds);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "loc-ibardin": true });

  if (!data) return <div className="px-3 py-6 font-mono text-[10px] text-fg-faint">LOADING DATASET…</div>;
  const codes = variantCodes(data.variants);
  const locs = data.locations.filter((l) => locationPasses(l, data.variants, filters));
  const featured = locs.filter((l) => l.featured);
  const rest = locs.filter((l) => !l.featured);
  const visibleSet = new Set(visibleIds);
  const inView = data.variants.filter((v) => visibleSet.has(v.id));
  const recent = data.contributions.slice().reverse().slice(0, 5);
  const selLoc =
    selection?.type === "location" ? selection.id : selection?.type === "variant" ? data.variants.find((v) => v.id === selection.id)?.locationId : undefined;

  const renderLoc = (l: Location) => {
    const vs = data.variants.filter((v) => v.locationId === l.id && variantPasses(v, l, filters));
    const isOpen = expanded[l.id] ?? selLoc === l.id;
    const totalKm = vs.reduce((a, v) => a + lineLength(v.geometry.coordinates as Coord[]), 0);
    return (
      <li key={l.id} className={cn("border-b border-line/60", selLoc === l.id && "bg-panel-2/60")}>
        <div className="flex items-stretch">
          <button
            onClick={() => setExpanded((e) => ({ ...e, [l.id]: !isOpen }))}
            className="px-2 text-fg-faint hover:text-fg"
            aria-label={isOpen ? "Collapse variants" : "Expand variants"}
            aria-expanded={isOpen}
          >
            <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
          </button>
          <button onClick={() => selectLocation(l.id)} className="group min-w-0 flex-1 py-2 pr-3 text-left">
            <span className="flex items-center gap-1.5">
              <MapPin className={cn("size-3.5 shrink-0", l.featured ? "text-amber" : "text-ice")} />
              <span className="truncate font-display text-[16px] font-semibold tracking-[0.03em] text-fg group-hover:text-white">
                {l.name}
              </span>
              <PublicationBadge status={l.publication} />
            </span>
            <span className="mt-0.5 flex items-center gap-2 pl-5 font-mono text-[10px] tracking-[0.06em] text-fg-faint">
              <span>{l.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(" / ").toUpperCase()}</span>
              <span className="text-line-strong">|</span>
              <span className="tabular-nums">{vs.length} VAR</span>
              <span className="text-line-strong">|</span>
              <span className="tabular-nums">{formatKm(totalKm).toUpperCase()}</span>
            </span>
          </button>
        </div>
        {isOpen && (
          <ul className="relative mb-2 ml-[22px] border-l border-line-strong pl-0">
            {vs.map((v) => (
              <VariantRow key={v.id} v={v} code={codes.get(v.id) ?? ""} active={selection?.type === "variant" && selection.id === v.id} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div>
      {featured.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
            <Star className="size-3 text-amber" />
            <span className="om-label">Featured · editorial selection</span>
          </div>
          <ul>{featured.map(renderLoc)}</ul>
        </>
      )}
      <div className="px-3 pt-4 pb-1.5">
        <span className="om-label">All locations · {locs.length}</span>
      </div>
      <ul>{rest.map(renderLoc)}</ul>
      {locs.length === 0 && <p className="px-3 py-4 text-[12px] text-fg-faint">No locations match the active filters.</p>}

      <div className="mt-2 flex items-center justify-between border-t border-line px-3 pt-3 pb-1.5">
        <span className="om-label">In current view</span>
        <span className="om-label tabular-nums">{inView.length}</span>
      </div>
      <ul className="pb-2">
        {inView.slice(0, 8).map((v) => (
          <li key={v.id}>
            <button onClick={() => selectVariant(v.id)} className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-panel-2">
              <ActivityTag activity={v.activity} />
              <span className="truncate text-[12px] text-fg-dim">{v.name}</span>
            </button>
          </li>
        ))}
        {inView.length > 8 && <li className="px-3 py-1 font-mono text-[10px] text-fg-faint">+{inView.length - 8} MORE — ZOOM IN</li>}
      </ul>

      <div className="flex items-center justify-between border-t border-line px-3 pt-3 pb-1.5">
        <span className="om-label">Recent contributions · this browser</span>
      </div>
      {recent.length === 0 ? (
        <p className="px-3 pb-4 text-[12px] leading-relaxed text-fg-faint">
          None yet. Use <span className="text-fg-dim">Add road</span> to draw a route — it will appear here as pending review.
        </p>
      ) : (
        <ul className="pb-3">
          {recent.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => app.set({ contribute: { kind: "review" }, selection: null })}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-panel-2"
              >
                <span className="font-mono text-[10px] text-community">{c.kind.replace("_", " ").toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg-dim">{c.variant?.name ?? c.poi?.name ?? c.targetId}</span>
                <PublicationBadge status={c.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ActivityTag({ activity }: { activity: Variant["activity"] }) {
  const ms = MOTORSPORT_ACTIVITIES.includes(activity);
  return (
    <span
      title={ACTIVITY_LABEL[activity]}
      className={cn("w-8 shrink-0 border px-0.5 text-center font-mono text-[9px] leading-[15px] tracking-[0.06em]", ms ? "border-signal/50 text-signal" : "border-ice/40 text-ice")}
    >
      {ACTIVITY_CODE[activity]}
    </span>
  );
}

function VariantRow({ v, code, active }: { v: Variant; code: string; active: boolean }) {
  const km = lineLength(v.geometry.coordinates as Coord[]);
  return (
    <li className="relative">
      <span className="absolute top-1/2 left-0 h-px w-2.5 bg-line-strong" />
      <button
        onClick={() => selectVariant(v.id)}
        className={cn("ml-2.5 flex w-[calc(100%-10px)] items-center gap-2 py-1.5 pr-3 pl-1.5 text-left", active ? "bg-ice/8" : "hover:bg-panel-2")}
      >
        <span className={cn("w-5 font-mono text-[10px]", active ? "text-white" : "text-fg-faint")}>{code}</span>
        <ActivityTag activity={v.activity} />
        <span className={cn("min-w-0 flex-1 truncate text-[12px]", active ? "text-white" : "text-fg-dim")}>{v.name}</span>
        {v.provenance.kind === "illustrative" && <Badge tone="signal" dashed>Concept</Badge>}
        {v.publication !== "published" && <Badge tone="amber" dashed>Pending</Badge>}
        <span className="font-mono text-[10px] text-fg-faint tabular-nums">{(km / 1000).toFixed(1)}</span>
      </button>
    </li>
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
            Include pending
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
