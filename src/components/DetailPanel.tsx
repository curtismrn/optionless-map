"use client";

import { useMemo, useState } from "react";
import { X, ArrowLeft, Video, Camera, Info, Flag, Spline, PencilLine, MapPinPlus, Route as RouteIcon, Maximize2, ShieldCheck, Clock } from "lucide-react";
import { app, useApp, view, openDetail, type DetailTab } from "@/lib/store";
import {
  ACTIVITY_LABEL,
  POI_LABEL,
  type Location,
  type Poi,
  type Variant,
  type Contribution,
  type MediaItem,
} from "@/lib/domain/schema";
import { formatCoord, formatKm, lineLength, sliceByDistance, type Coord } from "@/lib/geo";
import { focusLocation, focusPoint, focusVariant } from "@/components/map/controller";
import { variantCodes } from "@/components/map/overlay";
import { ElevationProfile } from "@/components/ElevationProfile";
import { ActivityTag } from "@/components/ExplorePanel";
import { MediaGrid, MediaStrip, openLightbox, EmptyMedia } from "@/components/media/MediaGallery";
import { PanelShell } from "@/components/PanelShell";
import { Badge, Button, cn, ProvenanceBadge, PublicationBadge, Section, Stat, VerificationBadge } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";
import { roadMedia, variantMedia } from "@/lib/media";

const date = (iso: string) => iso.slice(0, 10);
const countries = (cs: string[]) => cs.map((c) => COUNTRY_NAMES[c] ?? c).join(" / ");
const visibleMedia = (m: MediaItem) => m.status !== "removed";

const isTrusted = (p: { provenance: { kind: string } }) => p.provenance.kind !== "community";

function TrustBadge({ entity }: { entity: { provenance: { kind: string }; publication: string } }) {
  if (isTrusted(entity))
    return (
      <Badge tone="ice" title="Part of the curated atlas database (seed data) — geometry still unverified">
        <ShieldCheck className="mr-1 size-3" /> Atlas record
      </Badge>
    );
  return (
    <Badge tone="amber" dashed title="Community suggestion — not part of the main atlas until reviewed">
      <Clock className="mr-1 size-3" /> Suggestion · {entity.publication === "pending_review" ? "pending review" : entity.publication}
    </Badge>
  );
}

function CloseBtn() {
  return (
    <button onClick={() => app.set({ selection: null })} className="grid size-8 place-items-center text-fg-faint hover:text-fg" aria-label="Close">
      <X className="size-4" />
    </button>
  );
}

function Tabs({ tab, mediaCount }: { tab: DetailTab; mediaCount: number }) {
  const tabs: [DetailTab, string][] = [
    ["overview", "Overview"],
    ["media", `Photos & clips · ${mediaCount}`],
    ["info", "Info"],
  ];
  return (
    <div role="tablist" className="sticky top-0 z-10 flex border-b border-line bg-panel">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          onClick={() => app.set({ detailTab: id, sheet: app.get().sheet === "peek" ? "half" : app.get().sheet })}
          className={cn(
            "relative px-3 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors",
            tab === id ? "text-white" : "text-fg-faint hover:text-fg-dim",
          )}
        >
          {label}
          {tab === id && <span className="absolute inset-x-2 bottom-0 h-px bg-ice" />}
        </button>
      ))}
    </div>
  );
}

function Hero({ media, title, kicker, children }: { media: MediaItem[]; title: string; kicker: string; children?: React.ReactNode }) {
  const cover = media.find((m) => m.kind === "photo" && (m.width ?? 4) >= (m.height ?? 3)) ?? media[0];
  return (
    <div className="relative">
      {cover ? (
        <button onClick={() => openLightbox(media, media.indexOf(cover))} className="group relative block h-44 w-full overflow-hidden bg-panel-3 md:h-52" aria-label="Open photos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover.url ?? cover.thumbUrl} alt={cover.caption || title} className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
          <span className="absolute inset-0 bg-gradient-to-t from-panel via-panel/30 to-transparent" />
          <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-white/90">
            <Maximize2 className="size-2.5" /> {media.length}
          </span>
          <span className="absolute right-3 bottom-1 max-w-[60%] truncate font-mono text-[9px] text-white/50">© {cover.credit} · {cover.license}</span>
        </button>
      ) : (
        <div className="om-hatch h-20 border-b border-line" />
      )}
      <div className={cn("px-3", cover ? "-mt-12 relative" : "pt-3")}>
        <div className="om-label text-fg-dim">{kicker}</div>
        <h2 className="font-display text-[30px] leading-[1.02] font-semibold tracking-[0.02em] text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function SecondaryLinks({ items }: { items: [React.ReactNode, string, () => void][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line px-3 py-3">
      {items.map(([icon, label, fn]) => (
        <button key={label} onClick={fn} className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase hover:text-fg">
          {icon} {label}
        </button>
      ))}
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

function MediaTab({ media, labelFor, onAdd }: { media: MediaItem[]; labelFor: (m: MediaItem) => string | undefined; onAdd: () => void }) {
  const [kind, setKind] = useState<"all" | "photo" | "clip">("all");
  const shown = media.filter((m) => kind === "all" || m.kind === kind);
  const clips = media.filter((m) => m.kind === "clip").length;
  return (
    <div className="px-3 py-3">
      <div className="mb-3 flex items-center gap-1">
        {(
          [
            ["all", `All ${media.length}`],
            ["photo", `Photos ${media.length - clips}`],
            ["clip", `Clips ${clips}`],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn("h-7 border px-2.5 font-mono text-[10px] tracking-[0.08em] uppercase", kind === k ? "border-ice/60 bg-ice/10 text-ice" : "border-line text-fg-dim hover:text-fg")}
          >
            {l}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="solid" onClick={onAdd}>
          <Camera className="size-3" /> Add
        </Button>
      </div>
      {shown.length ? <MediaGrid items={shown} labelFor={labelFor} /> : <EmptyMedia onAdd={onAdd} />}
      {media.some((m) => m.source === "commons") && (
        <p className="mt-3 text-[10.5px] leading-snug text-fg-faint">
          Seed photos and clips are openly licensed files from Wikimedia Commons, credited to their authors. Tap any item for licence and source.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DetailPanel() {
  const selection = useApp((s) => s.selection);
  const data = useApp((s) => s.data);
  if (!selection || !data) return null;
  if (selection.type === "location") {
    const l = data.locations.find((x) => x.id === selection.id);
    return l ? <RoadDetail key={l.id} l={l} /> : null;
  }
  if (selection.type === "variant") {
    const v = data.variants.find((x) => x.id === selection.id);
    return v ? <VariantDetail key={v.id} v={v} /> : null;
  }
  const p = data.pois.find((x) => x.id === selection.id);
  return p ? <PoiDetail key={p.id} p={p} /> : null;
}

function RoadDetail({ l }: { l: Location }) {
  const data = useApp((s) => s.data)!;
  const tab = useApp((s) => s.detailTab);
  const variants = data.variants.filter((v) => v.locationId === l.id && v.publication !== "rejected");
  const codes = variantCodes(data.variants);
  const media = useMemo(() => roadMedia(data, l.id), [data, l.id]);
  const pois = data.pois.filter((p) => p.parent.type === "location" && p.parent.id === l.id && p.publication !== "rejected");
  const totalKm = variants.filter((v) => v.publication === "published").reduce((a, v) => a + lineLength(v.geometry.coordinates as Coord[]), 0);
  const contributions = data.contributions.filter((c) => c.locationId === l.id || c.targetId === l.id || c.report?.subject.id === l.id);
  const addMedia = () => app.set({ contribute: { kind: "add_media", target: { type: "location", id: l.id } } });
  const labelFor = (m: MediaItem) => (m.attachedTo.type === "variant" ? data.variants.find((v) => v.id === m.attachedTo.id)?.name : undefined);

  return (
    <PanelShell label={`Road: ${l.name}`}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line pr-1 pl-3">
        <span className="om-label">
          Road · {l.countries.join(" / ")} · {variants.length} route{variants.length === 1 ? "" : "s"} · {media.length} media
        </span>
        <CloseBtn />
      </div>
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        <Hero media={media} title={l.name} kicker={`${countries(l.countries)} · ${l.regions.slice(0, 2).join(", ")}`}>
          <div className="mt-2 flex flex-wrap gap-1">
            <TrustBadge entity={l} />
            {l.featured && <Badge tone="amber" title="Editorial selection for this demo — not a popularity signal">Featured</Badge>}
            {l.countries.length > 1 && <Badge tone="dim">Border crossing</Badge>}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="solid" className="flex-1" onClick={addMedia}>
              <Camera className="size-3.5" /> Add photo or clip
            </Button>
            <Button onClick={() => focusLocation(l.id)} title="Frame all routes on the map">
              <RouteIcon className="size-3.5" /> Map
            </Button>
          </div>
        </Hero>
        <div className="mt-3">
          <Tabs tab={tab} mediaCount={media.length} />
        </div>

        {tab === "overview" && (
          <>
            <div className="px-3 pt-3 pb-1">
              <p className="text-[13px] leading-relaxed text-fg">{l.summary}</p>
            </div>
            <Section title="Photos & clips" className="mt-2" aside={media.length > 0 && <button onClick={() => app.set({ detailTab: "media" })} className="om-label hover:text-fg">See all</button>}>
              <MediaStrip items={media} onSeeAll={() => app.set({ detailTab: "media" })} onAdd={addMedia} />
            </Section>
            <Section title={`Routes on this road · ${formatKm(totalKm)} mapped`}>
              <ul className="-mx-1 space-y-0.5">
                {variants.map((v) => {
                  const n = data.media.filter((m) => m.attachedTo.type === "variant" && m.attachedTo.id === v.id && visibleMedia(m)).length;
                  return (
                    <li key={v.id}>
                      <button
                        onClick={() => {
                          openDetail({ type: "variant", id: v.id });
                          focusVariant(v.id);
                        }}
                        className="group flex w-full items-center gap-2.5 px-1 py-2 text-left hover:bg-panel-2"
                      >
                        <span className="w-6 font-mono text-[11px] text-fg-faint group-hover:text-white">{codes.get(v.id)}</span>
                        <ActivityTag activity={v.activity} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-fg">{v.name}</span>
                          <span className="font-mono text-[10px] text-fg-faint tabular-nums">
                            {formatKm(lineLength(v.geometry.coordinates as Coord[]))}
                            {v.elevation && ` · +${v.elevation.gainM} m`}
                            {n > 0 && ` · ${n} media`}
                          </span>
                        </span>
                        {v.provenance.kind === "illustrative" && <Badge tone="signal" dashed>Concept</Badge>}
                        {v.publication !== "published" && <Badge tone="amber" dashed>Pending</Badge>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
            {pois.length > 0 && (
              <Section title="Local points">
                <PoiList pois={pois} />
              </Section>
            )}
            <SecondaryLinks
              items={[
                [<MapPinPlus key="p" className="size-3" />, "Add a point", () => app.set({ contribute: { kind: "new_poi", targetId: l.id } })],
                [<Spline key="s" className="size-3" />, "Suggest a missing route", () => app.set({ contribute: { kind: "new_variant", locationId: l.id } })],
                [<Flag key="f" className="size-3" />, "Report a problem", () => app.set({ contribute: { kind: "report", subject: { type: "location", id: l.id } } })],
              ]}
            />
          </>
        )}

        {tab === "media" && <MediaTab media={media} labelFor={labelFor} onAdd={addMedia} />}

        {tab === "info" && (
          <>
            <Section title="Location" className="border-t-0">
              <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                <dt className="om-label pt-px">Countries</dt>
                <dd className="text-fg">{countries(l.countries)}</dd>
                <dt className="om-label pt-px">Regions</dt>
                <dd className="text-fg">{l.regions.join(", ")}</dd>
                <dt className="om-label pt-px">Centre</dt>
                <dd className="font-mono text-[11px] text-fg-dim">{formatCoord(l.center)}</dd>
                <dt className="om-label pt-px">Tags</dt>
                <dd className="text-fg-dim">{l.tags.join(" · ") || "—"}</dd>
              </dl>
            </Section>
            <Section title="Source & trust">
              <div className="flex flex-wrap gap-1">
                <ProvenanceBadge kind={l.provenance.kind} />
                <PublicationBadge status={l.publication} />
              </div>
              <p className="mt-2 text-[12px] text-fg-dim">{l.provenance.source}</p>
              <p className="mt-1 text-[11px] text-fg-faint">
                Route geometry is OSM-derived and unverified. Photos/clips are community media attached to this record — they don&apos;t change it.
              </p>
            </Section>
            <Section title="History">
              <History contributions={contributions} created={{ by: l.createdBy.name, at: l.createdAt }} />
            </Section>
          </>
        )}
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

function VariantDetail({ v }: { v: Variant }) {
  const data = useApp((s) => s.data)!;
  const tab = useApp((s) => s.detailTab);
  const loc = data.locations.find((l) => l.id === v.locationId);
  const codes = variantCodes(data.variants);
  const siblings = data.variants.filter((x) => x.locationId === v.locationId && (x.publication === "published" || x.id === v.id));
  const coords = v.geometry.coordinates as Coord[];
  const lengthM = useMemo(() => lineLength(coords), [coords]);
  const media = useMemo(() => variantMedia(data, v), [data, v]);
  const pois = data.pois.filter((p) => p.parent.type === "variant" && p.parent.id === v.id && p.publication !== "rejected");
  const contributions = data.contributions.filter((c) => c.targetId === v.id || `var-${c.id}` === v.id || c.report?.subject.id === v.id);
  const pendingCorrections = contributions.filter((c) => c.kind === "geometry_correction" && c.status === "pending_review");
  const addMedia = () => app.set({ contribute: { kind: "add_media", target: { type: "variant", id: v.id } } });
  const labelFor = (m: MediaItem) => (m.attachedTo.type === "location" ? "Whole road" : undefined);

  const onProfileHover = (km: number | null) => {
    if (km === null) return view.set({ profileCursor: null });
    view.set({ profileCursor: sliceByDistance(coords, 0, km * 1000).at(-1) ?? null });
  };

  return (
    <PanelShell label={`Route: ${v.name}`}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line pr-1 pl-2">
        <button
          onClick={() => {
            if (!loc) return;
            openDetail({ type: "location", id: loc.id });
            focusLocation(loc.id);
          }}
          className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-fg-dim uppercase hover:text-ice"
          title="Back to the road"
        >
          <ArrowLeft className="size-3.5 shrink-0" />
          <span className="truncate">{loc?.name ?? "Unknown road"}</span>
        </button>
        <CloseBtn />
      </div>
      {siblings.length > 1 && (
        <nav aria-label="Routes on this road" className="flex shrink-0 gap-px overflow-x-auto border-b border-line bg-line/40 [scrollbar-width:none]">
          {siblings.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                openDetail({ type: "variant", id: s.id }, app.get().detailTab);
                focusVariant(s.id);
              }}
              title={s.name}
              className={cn("shrink-0 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em]", s.id === v.id ? "bg-panel text-white" : "bg-panel-2 text-fg-faint hover:text-fg")}
            >
              {codes.get(s.id)} · {ACTIVITY_LABEL[s.activity].split(" ")[0]!.toUpperCase()}
            </button>
          ))}
        </nav>
      )}

      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        <Hero media={media} title={v.name} kicker={`${ACTIVITY_LABEL[v.activity]} · ${countries(v.countries)}`}>
          <div className="mt-2 flex flex-wrap gap-1">
            <TrustBadge entity={v} />
            {v.provenance.kind === "illustrative" && <ProvenanceBadge kind="illustrative" />}
            {v.direction === "one_way" && <Badge tone="dim">One-way</Badge>}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="solid" className="flex-1" onClick={addMedia}>
              <Camera className="size-3.5" /> Add photo or clip
            </Button>
            <Button onClick={() => focusVariant(v.id, true)} title="Pitched camera along the route over 3D terrain">
              <Video className="size-3.5" /> Route cam
            </Button>
          </div>
        </Hero>

        <div className="mt-3 grid grid-cols-4 gap-2 px-3 pb-3">
          <Stat label="Length" value={(lengthM / 1000).toFixed(1)} unit="km" hint="Computed from geometry" />
          {v.elevation ? (
            <>
              <Stat label="Climb" value={`+${v.elevation.gainM}`} unit="m" hint="DEM estimate" />
              <Stat label="Descent" value={`−${v.elevation.lossM}`} unit="m" hint="DEM estimate" />
              <Stat label="Top" value={v.elevation.maxM} unit="m" hint="DEM estimate" />
            </>
          ) : (
            <div className="col-span-3 self-center text-[11px] text-fg-faint">Elevation is computed once a route is accepted into the atlas.</div>
          )}
        </div>
        <Tabs tab={tab} mediaCount={media.length} />

        {tab === "overview" && (
          <>
            <div className="px-3 pt-3">
              <p className="text-[13px] leading-relaxed text-fg">{v.description}</p>
              {v.publication !== "published" && (
                <p className="mt-2 border-l-2 border-amber/60 pl-2 text-[11.5px] text-fg-dim">
                  Your suggestion is only visible to you while it waits for review. Reviewing needs the planned backend (accounts + moderators).
                </p>
              )}
            </div>
            <Section title="Photos & clips" className="mt-3" aside={media.length > 0 && <button onClick={() => app.set({ detailTab: "media" })} className="om-label hover:text-fg">See all</button>}>
              <MediaStrip items={media} onSeeAll={() => app.set({ detailTab: "media" })} onAdd={addMedia} />
            </Section>
            {v.elevation && (
              <Section title="Elevation" aside={<span className="om-label">DEM estimate</span>}>
                <ElevationProfile profile={v.elevation.profile} onHover={onProfileHover} />
                {v.elevation.caveat && <p className="mt-1 text-[10.5px] text-fg-faint">{v.elevation.caveat}</p>}
              </Section>
            )}
            {pois.length > 0 && (
              <Section title="Points on this route">
                <PoiList pois={pois} />
              </Section>
            )}
            <SecondaryLinks
              items={[
                [<MapPinPlus key="p" className="size-3" />, "Add a point", () => app.set({ contribute: { kind: "new_poi", targetId: v.id } })],
                [<PencilLine key="e" className="size-3" />, "Improve text", () => app.set({ contribute: { kind: "description_edit", variantId: v.id } })],
                [<Spline key="c" className="size-3" />, "Fix the route line", () => app.set({ contribute: { kind: "geometry_correction", variantId: v.id } })],
                [<Flag key="f" className="size-3" />, "Report a problem", () => app.set({ contribute: { kind: "report", subject: { type: "variant", id: v.id } } })],
              ]}
            />
          </>
        )}

        {tab === "media" && <MediaTab media={media} labelFor={labelFor} onAdd={addMedia} />}

        {tab === "info" && (
          <>
            <Section title="Geography" className="border-t-0">
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
                      <span className="block text-[11px] text-fg-faint">≥150° turns found by a geometry heuristic — not an official count.</span>
                    </dd>
                  </>
                )}
              </dl>
            </Section>
            <Section title="Source & trust">
              <div className="flex flex-wrap gap-1">
                <ProvenanceBadge kind={v.provenance.kind} />
                <VerificationBadge status={v.verification} />
                <PublicationBadge status={v.publication} />
              </div>
              <p className="mt-2 text-[12px] text-fg">{v.provenance.source}</p>
              {v.provenance.license && <p className="font-mono text-[10.5px] text-fg-dim">Licence: {v.provenance.license}</p>}
              {v.provenance.note && (
                <p className="mt-1 flex gap-1.5 text-[11.5px] text-fg-faint">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  {v.provenance.note}
                </p>
              )}
              {v.elevation && <p className="mt-1 text-[10.5px] text-fg-faint">Elevation: {v.elevation.source}.</p>}
            </Section>
            <Section title="History">
              {pendingCorrections.length > 0 && (
                <p className="mb-2 text-[11.5px] text-amber">
                  {pendingCorrections.length} route-line fix{pendingCorrections.length > 1 ? "es" : ""} pending review — the live line is unchanged.
                </p>
              )}
              <History contributions={contributions} created={{ by: v.createdBy.name, at: v.createdAt }} />
            </Section>
          </>
        )}
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
              openDetail({ type: "poi", id: p.id });
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
  const media = data.media.filter((m) => m.attachedTo.type === "poi" && m.attachedTo.id === p.id && visibleMedia(m));
  const addMedia = () => app.set({ contribute: { kind: "add_media", target: { type: "poi", id: p.id } } });
  return (
    <PanelShell label={`Point: ${p.name}`}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line pr-1 pl-2">
        <button
          onClick={() => {
            openDetail({ type: p.parent.type, id: p.parent.id });
            if (p.parent.type === "variant") focusVariant(p.parent.id);
            else focusLocation(p.parent.id);
          }}
          className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-fg-dim uppercase hover:text-ice"
        >
          <ArrowLeft className="size-3.5 shrink-0" />
          <span className="truncate">{parentName}</span>
        </button>
        <CloseBtn />
      </div>
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <span className="om-label">{POI_LABEL[p.category]}</span>
        <h2 className={cn("mt-1 font-display text-[26px] leading-tight font-semibold tracking-[0.02em]", p.communityLabel ? "text-community" : "text-white")}>
          {p.communityLabel ? `“${p.name}”` : p.name}
        </h2>
        <div className="mt-2 flex flex-wrap gap-1">
          <ProvenanceBadge kind={p.provenance.kind} />
          {p.communityLabel && <Badge tone="community" dashed>Local nickname</Badge>}
          <PublicationBadge status={p.publication} />
        </div>
        {p.communityLabel && (
          <p className="mt-3 border-l-2 border-community/50 pl-2 text-[11.5px] text-fg-dim">Community nickname, not an official place name.</p>
        )}
        <p className="mt-3 text-[13px] leading-relaxed text-fg">{p.description}</p>
        <div className="mt-4">{media.length ? <MediaStrip items={media} onSeeAll={() => openLightbox(media, 0)} onAdd={addMedia} /> : <EmptyMedia onAdd={addMedia} />}</div>
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
      <SecondaryLinks items={[[<Flag key="f" className="size-3" />, "Report", () => app.set({ contribute: { kind: "report", subject: { type: "poi", id: p.id } } })]]} />
    </PanelShell>
  );
}
