"use client";

import { useMemo } from "react";
import { X, ArrowLeft, Video, Camera, Plus, PencilLine, Spline, MapPinPlus, Clapperboard, Info, ImageOff } from "lucide-react";
import { app, useApp, view } from "@/lib/store";
import {
  ACTIVITY_LABEL,
  POI_LABEL,
  type Location,
  type Poi,
  type Variant,
  type Contribution,
} from "@/lib/domain/schema";
import { formatCoord, formatKm, lineLength, sliceByDistance, type Coord } from "@/lib/geo";
import { focusLocation, focusPoint, focusVariant } from "@/components/map/controller";
import { variantCodes } from "@/components/map/overlay";
import { ElevationProfile } from "@/components/ElevationProfile";
import { ActivityTag } from "@/components/ExplorePanel";
import { Badge, Button, cn, ProvenanceBadge, PublicationBadge, Section, Stat, VerificationBadge } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";

const date = (iso: string) => iso.slice(0, 10);
const countries = (cs: string[]) => cs.map((c) => COUNTRY_NAMES[c] ?? c).join(" / ");

export function PanelShell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <aside
      aria-label={label}
      className={cn(
        "om-panel om-ticks pointer-events-auto absolute z-20 flex animate-sheet flex-col",
        "inset-x-0 bottom-[30px] max-h-[62vh] md:inset-x-auto md:top-[68px] md:right-3 md:bottom-[42px] md:max-h-none md:w-[428px]",
      )}
    >
      {children}
    </aside>
  );
}

function CloseBtn() {
  return (
    <button onClick={() => app.set({ selection: null })} className="p-1 text-fg-faint hover:text-fg" aria-label="Close detail panel">
      <X className="size-4" />
    </button>
  );
}

export function DetailPanel() {
  const selection = useApp((s) => s.selection);
  const data = useApp((s) => s.data);
  if (!selection || !data) return null;

  if (selection.type === "location") {
    const l = data.locations.find((x) => x.id === selection.id);
    return l ? <LocationDetail key={l.id} l={l} /> : null;
  }
  if (selection.type === "variant") {
    const v = data.variants.find((x) => x.id === selection.id);
    return v ? <VariantDetail key={v.id} v={v} /> : null;
  }
  const p = data.pois.find((x) => x.id === selection.id);
  return p ? <PoiDetail key={p.id} p={p} /> : null;
}

// ---------------------------------------------------------------------------

function CoverPlaceholder({ center, label }: { center: Coord; label: string }) {
  return (
    <div className="om-hatch relative flex h-28 items-end justify-between border-b border-line px-3 py-2">
      <div className="absolute top-2 left-3 flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.12em] text-fg-faint">
        <ImageOff className="size-3" /> NO COVER IMAGE · MEDIA UPLOADS PLANNED
      </div>
      <span className="font-mono text-[10px] text-fg-dim">{formatCoord(center, 4)}</span>
      <span className="font-mono text-[10px] text-fg-faint">{label}</span>
    </div>
  );
}

function History({ contributions, created }: { contributions: Contribution[]; created: { by: string; at: string } }) {
  return (
    <ol className="space-y-1.5 font-mono text-[10.5px] text-fg-dim">
      <li className="flex gap-2">
        <span className="text-fg-faint">{date(created.at)}</span>
        <span>Created by {created.by}</span>
      </li>
      {contributions.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-2">
          <span className="text-fg-faint">{date(c.submittedAt)}</span>
          <span className="text-community">{c.kind.replace("_", " ")}</span>
          <span>by {c.submitter.name}</span>
          <PublicationBadge status={c.status} />
        </li>
      ))}
    </ol>
  );
}

function LocationDetail({ l }: { l: Location }) {
  const data = useApp((s) => s.data)!;
  const variants = data.variants.filter((v) => v.locationId === l.id && v.publication !== "rejected");
  const codes = variantCodes(data.variants);
  const pois = data.pois.filter((p) => p.parent.type === "location" && p.parent.id === l.id && p.publication !== "rejected");
  const totalKm = variants.reduce((a, v) => a + lineLength(v.geometry.coordinates as Coord[]), 0);
  const activities = [...new Set(variants.map((v) => v.activity))];
  const contributions = data.contributions.filter((c) => c.locationId === l.id || c.targetId === l.id);

  return (
    <PanelShell label={`Location: ${l.name}`}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="om-label flex items-center gap-2">
          <span className={cn("size-2 rounded-full", l.featured ? "bg-amber" : "bg-ice")} />
          Location · parent of {variants.length} variant{variants.length === 1 ? "" : "s"}
        </span>
        <CloseBtn />
      </div>
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        <CoverPlaceholder center={l.center} label={l.countries.join("·")} />
        <div className="px-3 pt-3 pb-3">
          <h2 className="font-display text-[30px] leading-[1.02] font-semibold tracking-[0.02em] text-white">{l.name}</h2>
          <p className="mt-1 font-mono text-[10.5px] tracking-[0.06em] text-fg-dim uppercase">
            {countries(l.countries)} · {l.regions.join(", ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {l.featured && <Badge tone="amber" title="Selected by the editors of this demo — not a popularity signal">Featured · editorial</Badge>}
            {l.countries.length > 1 && <Badge tone="ice">Border location</Badge>}
            <ProvenanceBadge kind={l.provenance.kind} />
            <PublicationBadge status={l.publication} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-fg">{l.summary}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 border-t border-line px-3 py-3">
          <Stat label="Variants" value={variants.length} />
          <Stat label="Mapped" value={(totalKm / 1000).toFixed(1)} unit="km" />
          <Stat label="Points" value={pois.length + data.pois.filter((p) => p.parent.type === "variant" && variants.some((v) => v.id === p.parent.id)).length} />
        </div>

        <Section title="Activities">
          <div className="flex flex-wrap gap-1.5">
            {activities.map((a) => (
              <span key={a} className="flex items-center gap-1.5 text-[12px] text-fg-dim">
                <ActivityTag activity={a} /> {ACTIVITY_LABEL[a]}
              </span>
            ))}
          </div>
        </Section>

        <Section
          title="Route variants"
          aside={
            <button
              onClick={() => app.set({ contribute: { kind: "new_variant", locationId: l.id }, selection: null })}
              className="flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-ice uppercase hover:text-white"
            >
              <Plus className="size-3" /> Propose variant
            </button>
          }
        >
          <ul className="-mx-1 space-y-1">
            {variants.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => {
                    app.set({ selection: { type: "variant", id: v.id } });
                    focusVariant(v.id);
                  }}
                  className="group flex w-full items-start gap-2.5 border border-line/0 px-1 py-2 text-left hover:border-line hover:bg-panel-2"
                >
                  <span className="mt-0.5 w-6 font-mono text-[11px] text-fg-faint group-hover:text-white">{codes.get(v.id)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug text-fg">{v.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <ActivityTag activity={v.activity} />
                      <span className="font-mono text-[10px] text-fg-dim tabular-nums">
                        {formatKm(lineLength(v.geometry.coordinates as Coord[]))}
                        {v.elevation && ` · +${v.elevation.gainM} m`}
                      </span>
                      {v.provenance.kind === "illustrative" && <ProvenanceBadge kind="illustrative" />}
                      <PublicationBadge status={v.publication} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>

        {pois.length > 0 && (
          <Section title="Location points">
            <PoiList pois={pois} />
          </Section>
        )}

        <Section title="Contribution history">
          <History contributions={contributions} created={{ by: l.createdBy.name, at: l.createdAt }} />
        </Section>
      </div>
      <div className="flex gap-2 border-t border-line p-2">
        <Button className="flex-1" onClick={() => app.set({ contribute: { kind: "new_variant", locationId: l.id }, selection: null })}>
          <Spline className="size-3.5" /> Propose variant
        </Button>
        <Button className="flex-1" onClick={() => app.set({ contribute: { kind: "new_poi", targetId: l.id }, selection: null })}>
          <MapPinPlus className="size-3.5" /> Add point
        </Button>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

function VariantDetail({ v }: { v: Variant }) {
  const data = useApp((s) => s.data)!;
  const loc = data.locations.find((l) => l.id === v.locationId);
  const codes = variantCodes(data.variants);
  const siblings = data.variants.filter((x) => x.locationId === v.locationId && x.publication !== "rejected");
  const coords = v.geometry.coordinates as Coord[];
  const lengthM = useMemo(() => lineLength(coords), [coords]);
  const pois = data.pois.filter((p) => p.parent.type === "variant" && p.parent.id === v.id && p.publication !== "rejected");
  const contributions = data.contributions.filter((c) => c.targetId === v.id || `var-${c.id}` === v.id);
  const pendingCorrections = contributions.filter((c) => c.kind === "geometry_correction" && c.status === "pending_review");

  const onProfileHover = (km: number | null) => {
    if (km === null) return view.set({ profileCursor: null });
    const seg = sliceByDistance(coords, 0, km * 1000);
    view.set({ profileCursor: seg.at(-1) ?? null });
  };

  return (
    <PanelShell label={`Variant: ${v.name}`}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <button
          onClick={() => {
            if (!loc) return;
            app.set({ selection: { type: "location", id: loc.id } });
            focusLocation(loc.id);
          }}
          className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-fg-dim uppercase hover:text-ice"
          title="Back to parent location"
        >
          <ArrowLeft className="size-3.5 shrink-0" />
          <span className="truncate">{loc?.name ?? "Unknown location"}</span>
          <span className="text-fg-faint">/ {codes.get(v.id)}</span>
        </button>
        <CloseBtn />
      </div>

      {siblings.length > 1 && (
        <nav aria-label="Variants of this location" className="flex gap-px overflow-x-auto border-b border-line bg-line/40">
          {siblings.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                app.set({ selection: { type: "variant", id: s.id } });
                focusVariant(s.id);
              }}
              title={s.name}
              className={cn(
                "shrink-0 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em]",
                s.id === v.id ? "bg-panel text-white" : "bg-panel-2 text-fg-faint hover:text-fg",
              )}
            >
              {codes.get(s.id)} <span className="text-fg-faint">{s.activity === v.activity ? "" : "·"}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-3">
          <div className="mb-1.5 flex items-center gap-2">
            <ActivityTag activity={v.activity} />
            <span className="om-label">{ACTIVITY_LABEL[v.activity]} · route variant</span>
          </div>
          <h2 className="font-display text-[26px] leading-[1.05] font-semibold tracking-[0.02em] text-white">{v.name}</h2>
          <div className="mt-2 flex flex-wrap gap-1">
            <ProvenanceBadge kind={v.provenance.kind} />
            <VerificationBadge status={v.verification} />
            <PublicationBadge status={v.publication} />
            {v.countries.length > 1 && <Badge tone="ice">Cross-border</Badge>}
            {v.direction === "one_way" && <Badge tone="dim">One-way</Badge>}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-fg">{v.description}</p>
        </div>

        <div className="grid grid-cols-4 gap-2 border-t border-line px-3 py-3">
          <Stat label="Length" value={(lengthM / 1000).toFixed(1)} unit="km" hint="Computed from geometry" />
          {v.elevation ? (
            <>
              <Stat label="Gain" value={`+${v.elevation.gainM}`} unit="m" hint="DEM estimate" />
              <Stat label="Loss" value={`−${v.elevation.lossM}`} unit="m" hint="DEM estimate" />
              <Stat label="Max" value={v.elevation.maxM} unit="m" hint="DEM estimate" />
            </>
          ) : (
            <div className="col-span-3 self-center text-[11px] text-fg-faint">Elevation not computed — requires server-side DEM processing.</div>
          )}
        </div>

        {v.elevation && (
          <Section title="Elevation profile" aside={<span className="om-label">DEM estimate</span>}>
            <ElevationProfile profile={v.elevation.profile} onHover={onProfileHover} />
            <p className="mt-1.5 text-[10.5px] leading-snug text-fg-faint">
              {v.elevation.source}.{v.elevation.caveat ? ` ${v.elevation.caveat}` : ""}
            </p>
          </Section>
        )}

        <Section title="Geography">
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
            <dt className="om-label pt-px">Country</dt>
            <dd className="text-fg">{countries(v.countries)}</dd>
            <dt className="om-label pt-px">Region</dt>
            <dd className="text-fg">{v.regions.join(", ") || "—"}</dd>
            <dt className="om-label pt-px">Start</dt>
            <dd className="font-mono text-[11px] text-fg-dim">{formatCoord(coords[0]!)}</dd>
            <dt className="om-label pt-px">Finish</dt>
            <dd className="font-mono text-[11px] text-fg-dim">{formatCoord(coords.at(-1)!)}</dd>
            <dt className="om-label pt-px">Direction</dt>
            <dd className="text-fg">
              {v.direction === "both" ? "Both directions" : v.direction === "one_way" ? "One-way (as drawn)" : "Recommended as drawn"}
              {v.directionNote && <span className="block text-[11px] text-fg-faint">{v.directionNote}</span>}
            </dd>
            <dt className="om-label pt-px">Surface</dt>
            <dd className="text-fg">{v.surface ?? "Unknown"}</dd>
            {v.detectedHairpins.length > 0 && (
              <>
                <dt className="om-label pt-px">Hairpins</dt>
                <dd className="text-fg">
                  {v.detectedHairpins.length} detected
                  <span className="block text-[11px] text-fg-faint">Turns ≥150° found by a geometry heuristic; not an official count.</span>
                </dd>
              </>
            )}
          </dl>
        </Section>

        <Section title="Points of interest" aside={
          <button
            onClick={() => app.set({ contribute: { kind: "new_poi", targetId: v.id }, selection: null })}
            className="flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-ice uppercase hover:text-white"
          >
            <Plus className="size-3" /> Add point
          </button>
        }>
          {pois.length ? <PoiList pois={pois} /> : <p className="text-[12px] text-fg-faint">No points on this variant yet.</p>}
        </Section>

        <Section title="Media" aside={<Badge tone="dim" dashed>Planned</Badge>}>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              [Camera, "Photos"],
              [Video, "Onboard"],
              [Clapperboard, "Clips"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Camera;
              return (
                <div key={label as string} className="om-hatch flex aspect-[4/3] flex-col items-center justify-center gap-1 border border-line text-fg-faint">
                  <I className="size-4" />
                  <span className="font-mono text-[9px] tracking-[0.12em] uppercase">{label as string}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-fg-faint">
            Uploads need a storage backend with moderation and EXIF location stripping. Uploaded times or videos will never be treated as verified automatically.
          </p>
        </Section>

        <Section title="Source & provenance">
          <div className="space-y-1 text-[12px] text-fg-dim">
            <p className="text-fg">{v.provenance.source}</p>
            {v.provenance.license && <p className="font-mono text-[10.5px]">License: {v.provenance.license}</p>}
            {v.provenance.note && (
              <p className="flex gap-1.5 text-[11.5px] text-fg-faint">
                <Info className="mt-0.5 size-3 shrink-0" />
                {v.provenance.note}
              </p>
            )}
          </div>
        </Section>

        <Section title="Contribution history">
          {pendingCorrections.length > 0 && (
            <p className="mb-2 text-[11.5px] text-amber">
              {pendingCorrections.length} geometry correction{pendingCorrections.length > 1 ? "s" : ""} pending review — the live geometry is unchanged.
            </p>
          )}
          <History contributions={contributions} created={{ by: v.createdBy.name, at: v.createdAt }} />
        </Section>
      </div>

      <div className="grid grid-cols-3 gap-1.5 border-t border-line p-2">
        <Button variant="solid" onClick={() => focusVariant(v.id, true)} title="Pitched camera along the route">
          <Video className="size-3.5" /> Route cam
        </Button>
        <Button
          onClick={() => app.set({ contribute: { kind: "geometry_correction", variantId: v.id }, selection: null })}
          title="Propose a corrected geometry"
        >
          <Spline className="size-3.5" /> Correct
        </Button>
        <Button onClick={() => app.set({ contribute: { kind: "description_edit", variantId: v.id }, selection: null })} title="Improve the description">
          <PencilLine className="size-3.5" /> Edit text
        </Button>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

function PoiList({ pois }: { pois: Poi[] }) {
  return (
    <ul className="-mx-1">
      {pois.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => {
              app.set({ selection: { type: "poi", id: p.id } });
              focusPoint(p.coordinates as Coord);
            }}
            className="flex w-full items-center gap-2 px-1 py-1.5 text-left hover:bg-panel-2"
          >
            <span className={cn("size-2 shrink-0 rounded-full", p.communityLabel || p.provenance.kind === "community" ? "bg-community" : "bg-amber")} />
            <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", p.communityLabel ? "text-community italic" : "text-fg")}>
              {p.communityLabel ? `“${p.name}”` : p.name}
            </span>
            <span className="font-mono text-[9.5px] text-fg-faint uppercase">{POI_LABEL[p.category]}</span>
            <PublicationBadge status={p.publication} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PoiDetail({ p }: { p: Poi }) {
  const data = useApp((s) => s.data)!;
  const parentName =
    p.parent.type === "location" ? data.locations.find((l) => l.id === p.parent.id)?.name : data.variants.find((v) => v.id === p.parent.id)?.name;
  return (
    <PanelShell label={`Point: ${p.name}`}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <button
          onClick={() => {
            app.set({ selection: { type: p.parent.type, id: p.parent.id } });
            if (p.parent.type === "variant") focusVariant(p.parent.id);
            else focusLocation(p.parent.id);
          }}
          className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-fg-dim uppercase hover:text-ice"
        >
          <ArrowLeft className="size-3.5 shrink-0" />
          <span className="truncate">{parentName}</span>
          <span className="text-fg-faint">/ {p.parent.type}</span>
        </button>
        <CloseBtn />
      </div>
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <span className="om-label">Point of interest · {POI_LABEL[p.category]}</span>
        <h2 className={cn("mt-1 font-display text-[26px] leading-tight font-semibold tracking-[0.02em]", p.communityLabel ? "text-community" : "text-white")}>
          {p.communityLabel ? `“${p.name}”` : p.name}
        </h2>
        <div className="mt-2 flex flex-wrap gap-1">
          <ProvenanceBadge kind={p.provenance.kind} />
          {p.communityLabel && <Badge tone="community" dashed>Community label</Badge>}
          <PublicationBadge status={p.publication} />
        </div>
        {p.communityLabel && (
          <p className="mt-3 border-l-2 border-community/50 pl-2 text-[11.5px] text-fg-dim">
            Community nickname, not an authoritative geographic name.
          </p>
        )}
        <p className="mt-3 text-[13px] leading-relaxed text-fg">{p.description}</p>
        <dl className="mt-4 grid grid-cols-[96px_1fr] gap-y-1.5 text-[12px]">
          <dt className="om-label pt-px">Coordinates</dt>
          <dd className="font-mono text-[11px] text-fg-dim">{formatCoord(p.coordinates as Coord, 5)}</dd>
          <dt className="om-label pt-px">Source</dt>
          <dd className="text-fg-dim">{p.provenance.source}</dd>
          <dt className="om-label pt-px">Added by</dt>
          <dd className="text-fg-dim">
            {p.createdBy.name} · {date(p.createdAt)}
          </dd>
        </dl>
      </div>
    </PanelShell>
  );
}
