"use client";

// Road / route / point pages. Priority order, top to bottom:
//   name & place → routes on this road → distance & elevation → photos → (collapsed) details & sources

import { useMemo, useState } from "react";
import { X, ArrowLeft, Video, Camera, Flag, Spline, PencilLine, MapPinPlus, ChevronDown, ChevronRight, Pencil, Plus, Telescope, Check } from "lucide-react";
import { app, useApp, view, openDetail, useCanEdit, runEdit, toast } from "@/lib/store";
import { SHARED_MODE } from "@/lib/supabase";
import { ACTIVITY_LABEL, POI_LABEL, type Location, type Poi, type Variant, type Contribution, type MediaItem } from "@/lib/domain/schema";
import { formatCoord, formatKm, lineLength, sliceByDistance, type Coord } from "@/lib/geo";
import { focusLocation, focusPoint, focusVariant, highlightRoute } from "@/components/map/controller";
import { ElevationProfile } from "@/components/ElevationProfile";
import { MediaGrid, EmptyMedia } from "@/components/media/MediaGallery";
import { PanelShell } from "@/components/PanelShell";
import { Badge, Button, cn, ProvenanceBadge, PublicationBadge, VerificationBadge } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";
import { roadMedia } from "@/lib/media";

const date = (iso: string) => iso.slice(0, 10);
const countries = (cs: string[]) => cs.map((c) => COUNTRY_NAMES[c] ?? c).join(" / ");
const km = (v: Variant) => formatKm(lineLength(v.geometry.coordinates as Coord[]));

// ---------------------------------------------------------------------------
// building blocks

function Header({ kicker, title, subtitle, back }: { kicker?: string; title: string; subtitle: string; back?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-line px-3 pt-2 pb-3">
      <div className="min-w-0 flex-1">
        {back ? (
          <button onClick={back.onClick} className="-ml-1 flex min-h-8 items-center gap-1 px-1 text-[12px] text-fg-dim hover:text-ice">
            <ArrowLeft className="size-3.5 shrink-0" />
            <span className="truncate">{back.label}</span>
          </button>
        ) : (
          kicker && <div className="om-label pt-1.5 pb-0.5">{kicker}</div>
        )}
        <h2 className="font-display text-[26px] leading-[1.05] font-semibold tracking-[0.02em] text-white">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-fg-dim">{subtitle}</p>
      </div>
      <button
        onClick={() => app.set({ selection: null })}
        className="grid size-10 shrink-0 place-items-center text-fg-faint hover:text-fg"
        aria-label="Close and return to the map"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}

function Block({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <header className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-fg-dim uppercase">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Technical metadata lives here, collapsed by default. */
function Details({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="px-3 py-2">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-10 w-full items-center gap-1.5 text-[12px] text-fg-dim hover:text-fg">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Details, sources & contributions
      </button>
      {open && <div className="space-y-4 pt-1 pb-2">{children}</div>}
    </section>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-faint">{k}</dt>
          <dd className="text-fg-dim">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stat({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div>
      <div className="text-[11px] text-fg-faint">{label}</div>
      <div className="font-display text-[22px] leading-tight font-semibold text-fg tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-[12px] font-normal text-fg-dim">{unit}</span>}
      </div>
    </div>
  );
}

function SmallActions({ items }: { items: [React.ReactNode, string, () => void][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map(([icon, label, fn]) => (
        <button key={label} onClick={fn} className="flex min-h-9 items-center gap-1.5 text-[12px] text-fg-faint hover:text-fg">
          {icon} {label}
        </button>
      ))}
    </div>
  );
}

/** Members of the shared atlas edit directly — shown under the header. */
function MemberBar({ items }: { items: [React.ReactNode, string, () => void][] }) {
  const can = useCanEdit();
  if (!can) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
      {items.map(([icon, label, fn]) => (
        <Button key={label} size="sm" onClick={fn}>
          {icon} {label}
        </Button>
      ))}
    </div>
  );
}

function History({ contributions, created }: { contributions: Contribution[]; created: { by: string; at: string } }) {
  return (
    <ol className="space-y-1 text-[11.5px] text-fg-dim">
      <li>
        {date(created.at)} — created by {created.by}
      </li>
      {contributions.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-1.5">
          {date(c.submittedAt)} — {c.kind.replace("_", " ")} by {c.submitter.name} <PublicationBadge status={c.status} />
        </li>
      ))}
    </ol>
  );
}

/** Photos with a show-more toggle; every grid tile says where it belongs when that differs. */
function AddPhotoButton({ onClick }: { onClick: () => void }) {
  const can = useCanEdit();
  if (SHARED_MODE && !can) return null;
  return (
    <Button size="sm" onClick={onClick}>
      <Camera className="size-3" /> Add photo
    </Button>
  );
}

function Photos({ items, labelFor, onAdd, emptyText }: { items: MediaItem[]; labelFor?: (m: MediaItem) => string | undefined; onAdd: () => void; emptyText?: string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <EmptyMedia onAdd={onAdd} text={emptyText} />;
  const shown = all ? items : items.slice(0, 6);
  return (
    <>
      <MediaGrid items={shown} labelFor={labelFor} />
      {items.length > shown.length && (
        <button onClick={() => setAll(true)} className="mt-2 min-h-9 w-full border border-line text-[12px] text-fg-dim hover:border-line-strong hover:text-fg">
          Show all {items.length} photos
        </button>
      )}
    </>
  );
}

function RouteRow({ v, active, onSelect }: { v: Variant; active?: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        onClick={onSelect}
        onMouseEnter={() => highlightRoute(v.id)}
        onMouseLeave={() => highlightRoute(null)}
        className={cn(
          "group flex min-h-12 w-full items-center gap-3 border-l-2 px-2.5 py-2 text-left",
          active ? "border-white bg-white/5" : "border-ice/50 hover:border-ice hover:bg-panel-2",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[13.5px] leading-snug", active ? "text-white" : "text-fg")}>{v.name}</span>
          <span className="mt-0.5 block text-[11.5px] text-fg-faint">
            {ACTIVITY_LABEL[v.activity]} · {km(v)}
            {v.elevation && ` · +${v.elevation.gainM} m`}
            {v.direction === "one_way" && " · one-way"}
          </span>
        </span>
        {v.provenance.kind === "illustrative" && <Badge tone="signal" dashed>Concept</Badge>}
        {v.publication !== "published" && <Badge tone="amber" dashed>Pending</Badge>}
        <ChevronRight className="size-4 shrink-0 text-fg-faint group-hover:text-fg" />
      </button>
    </li>
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
  const all = data.variants.filter((v) => v.locationId === l.id && v.publication === "published");
  const variants = all.filter((v) => !v.toScout);
  const toScout = all.filter((v) => v.toScout);
  const pickRoute = (id: string) => {
    highlightRoute(null);
    openDetail({ type: "variant", id });
    focusVariant(id);
  };
  const photos = useMemo(() => roadMedia(data, l.id), [data, l.id]);
  const pois = data.pois.filter((p) => p.parent?.type === "location" && p.parent.id === l.id && p.publication !== "rejected");
  const contributions = data.contributions.filter((c) => c.locationId === l.id || c.targetId === l.id || c.report?.subject.id === l.id);
  const addPhoto = () => app.set({ contribute: { kind: "add_media", target: { type: "location", id: l.id } } });
  const routeName = (m: MediaItem) => (m.attachedTo.type === "variant" ? data.variants.find((v) => v.id === m.attachedTo.id)?.name : undefined);

  return (
    <PanelShell label={`Place: ${l.name}`}>
      <Header kicker="Place" title={l.name} subtitle={`${countries(l.countries)} · ${l.regions.slice(0, 2).join(", ")}`} />
      <MemberBar
        items={[
          [<Pencil key="e" className="size-3" />, "Edit place", () => app.set({ contribute: { kind: "edit_location", id: l.id } })],
          [<Plus key="a" className="size-3" />, "Add route", () => app.set({ contribute: { kind: "edit_variant", locationId: l.id } })],
          [<MapPinPlus key="s" className="size-3" />, "Add spot", () => app.set({ contribute: { kind: "edit_poi", parent: { type: "location", id: l.id } } })],
        ]}
      />
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        {(variants.length > 0 || toScout.length === 0) && (
          <Block title={`${variants.length} route${variants.length === 1 ? "" : "s"} at this place`} aside={<span className="text-[11px] text-fg-faint">Pick one to highlight it</span>}>
            <ul className="space-y-1">
              {variants.map((v) => (
                <RouteRow key={v.id} v={v} onSelect={() => pickRoute(v.id)} />
              ))}
            </ul>
          </Block>
        )}
        {toScout.length > 0 && (
          <Block title={`To scout · ${toScout.length}`} aside={<span className="text-[11px] text-fg-faint">Not driven yet</span>}>
            <ul className="space-y-1 opacity-80">
              {toScout.map((v) => (
                <RouteRow key={v.id} v={v} onSelect={() => pickRoute(v.id)} />
              ))}
            </ul>
          </Block>
        )}

        <div className="border-b border-line px-3 py-3">
          <p className="text-[13px] leading-relaxed text-fg">{l.summary}</p>
        </div>

        <Block
          title={`Photos · ${photos.length}`}
          aside={<AddPhotoButton onClick={addPhoto} />}
        >
          <Photos items={photos} labelFor={routeName} onAdd={addPhoto} />
        </Block>

        {pois.length > 0 && (
          <Block title={`Spots · ${pois.length}`}>
            <PoiList pois={pois} />
          </Block>
        )}

        <Details>
          <Facts
            rows={[
              ["Countries", countries(l.countries)],
              ["Regions", l.regions.join(", ")],
              ["Centre", <span key="c" className="font-mono text-[11px]">{formatCoord(l.center)}</span>],
              ["Tags", l.tags.join(" · ") || "—"],
              ["Featured", l.featured ? "Yes — editorial demo pick, not a popularity signal" : "No"],
            ]}
          />
          <div className="flex flex-wrap gap-1">
            <ProvenanceBadge kind={l.provenance.kind} />
            <PublicationBadge status={l.publication} />
          </div>
          <p className="text-[11.5px] leading-snug text-fg-faint">
            {l.provenance.source}. Route lines are OSM-derived and unverified. Photos come from Wikimedia Commons (credited on each) or were added in this browser.
          </p>
          <History contributions={contributions} created={{ by: l.createdBy.name, at: l.createdAt }} />
          {!SHARED_MODE && <SmallActions
            items={[
              [<MapPinPlus key="p" className="size-3.5" />, "Add a point", () => app.set({ contribute: { kind: "new_poi", targetId: l.id } })],
              [<Spline key="s" className="size-3.5" />, "Suggest a missing route", () => app.set({ contribute: { kind: "new_variant", locationId: l.id } })],
              [<Flag key="f" className="size-3.5" />, "Report a problem", () => app.set({ contribute: { kind: "report", subject: { type: "location", id: l.id } } })],
            ]}
          />}
        </Details>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

function VariantDetail({ v }: { v: Variant }) {
  const data = useApp((s) => s.data)!;
  const loc = data.locations.find((l) => l.id === v.locationId);
  const siblings = v.locationId ? data.variants.filter((x) => x.locationId === v.locationId && x.id !== v.id && x.publication === "published") : [];
  const coords = v.geometry.coordinates as Coord[];
  const lengthM = useMemo(() => lineLength(coords), [coords]);
  const own = data.media.filter((m) => m.attachedTo.type === "variant" && m.attachedTo.id === v.id && m.status !== "removed");
  const roadWide = v.locationId ? data.media.filter((m) => m.attachedTo.type === "location" && m.attachedTo.id === v.locationId && m.status !== "removed") : [];
  const pois = data.pois.filter((p) => p.parent?.type === "variant" && p.parent.id === v.id && p.publication !== "rejected");
  const contributions = data.contributions.filter((c) => c.targetId === v.id || `var-${c.id}` === v.id || c.report?.subject.id === v.id);
  const addPhoto = () => app.set({ contribute: { kind: "add_media", target: { type: "variant", id: v.id } } });

  const onProfileHover = (k: number | null) => {
    if (k === null) return view.set({ profileCursor: null });
    view.set({ profileCursor: sliceByDistance(coords, 0, k * 1000).at(-1) ?? null });
  };

  return (
    <PanelShell label={`Route: ${v.name}`}>
      <Header
        title={v.name}
        subtitle={`${ACTIVITY_LABEL[v.activity]} · ${countries(v.countries)}${v.direction === "one_way" ? " · one-way" : ""}`}
        back={
          loc && {
            label: `All routes on ${loc.name}`,
            onClick: () => {
              openDetail({ type: "location", id: loc.id });
              focusLocation(loc.id);
            },
          }
        }
      />
      <MemberBar
        items={[
          [<Pencil key="e" className="size-3" />, "Edit route", () => app.set({ contribute: { kind: "edit_variant", id: v.id } })],
          [<MapPinPlus key="s" className="size-3" />, "Add spot", () => app.set({ contribute: { kind: "edit_poi", parent: { type: "variant", id: v.id } } })],
          v.toScout
            ? [
                <Check key="d" className="size-3" />,
                "We drove it",
                // a driven route needs a road: without one, open the form to pick it and untick "To scout"
                () =>
                  v.locationId
                    ? void runEdit((e) => e.setToScout(v.id, false), "Moved to the driven routes.").catch(() => {})
                    : (toast("Pick its place, then untick “To scout”."), app.set({ contribute: { kind: "edit_variant", id: v.id } })),
              ]
            : [<Telescope key="d" className="size-3" />, "Back to scout", () => void runEdit((e) => e.setToScout(v.id, true), "Moved to To scout.").catch(() => {})],
        ]}
      />
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        {v.toScout && (
          <p className="flex gap-2 border-b border-line border-dashed px-3 py-2 text-[12px] leading-snug text-fg-dim">
            <Telescope className="mt-0.5 size-3.5 shrink-0" /> To scout — spotted on the map, nobody has driven it yet.
          </p>
        )}
        {(v.publication !== "published" || v.provenance.kind === "illustrative") && (
          <p className="border-b border-line bg-amber/5 px-3 py-2 text-[12px] leading-snug text-fg-dim">
            {v.publication !== "published"
              ? "Your suggestion — visible only in this browser and not part of the atlas until reviewed (no review system yet)."
              : "Concept entry: illustrates how a hill-climb format would be modelled. No real event is represented."}
          </p>
        )}

        <div className="grid grid-cols-4 gap-2 border-b border-line px-3 py-3">
          <Stat label="Distance" value={(lengthM / 1000).toFixed(1)} unit="km" />
          {v.elevation ? (
            <>
              <Stat label="Climb" value={`+${v.elevation.gainM}`} unit="m" />
              <Stat label="Descent" value={`−${v.elevation.lossM}`} unit="m" />
              <Stat label="High point" value={v.elevation.maxM} unit="m" />
            </>
          ) : (
            <p className="col-span-3 self-center text-[11.5px] text-fg-faint">No elevation data for this route yet.</p>
          )}
        </div>

        {v.elevation && (
          <div className="border-b border-line px-3 py-3">
            <ElevationProfile profile={v.elevation.profile} onHover={onProfileHover} />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-fg-faint">Elevation is a terrain-model estimate.</span>
              <button onClick={() => focusVariant(v.id, true)} className="flex min-h-8 items-center gap-1 text-[12px] text-ice hover:text-white">
                <Video className="size-3.5" /> 3D route view
              </button>
            </div>
          </div>
        )}

        <Block
          title={`Photos of this route · ${own.length}`}
          aside={<AddPhotoButton onClick={addPhoto} />}
        >
          <Photos items={own} onAdd={addPhoto} emptyText="No photo is tied to this exact route yet." />
        </Block>
        {roadWide.length > 0 && loc && (
          <Block title={`More photos from ${loc.name} · ${roadWide.length}`}>
            <Photos items={roadWide} onAdd={addPhoto} />
          </Block>
        )}

        {siblings.length > 0 && (
          <Block title={`Other routes at ${loc?.name ?? "this place"}`}>
            <ul className="space-y-1">
              {siblings.map((s) => (
                <RouteRow
                  key={s.id}
                  v={s}
                  onSelect={() => {
                    highlightRoute(null);
                    openDetail({ type: "variant", id: s.id });
                    focusVariant(s.id);
                  }}
                />
              ))}
            </ul>
          </Block>
        )}

        {pois.length > 0 && (
          <Block title={`Spots on this route · ${pois.length}`}>
            <PoiList pois={pois} />
          </Block>
        )}

        <Details>
          <p className="text-[12.5px] leading-relaxed text-fg">{v.description}</p>
          <Facts
            rows={[
              ["Start", <span key="s" className="font-mono text-[11px]">{formatCoord(coords[0]!)}</span>],
              ["Finish", <span key="f" className="font-mono text-[11px]">{formatCoord(coords.at(-1)!)}</span>],
              ["Direction", v.direction === "both" ? "Both directions" : v.direction === "one_way" ? `One-way as drawn${v.directionNote ? ` — ${v.directionNote}` : ""}` : `As drawn${v.directionNote ? ` — ${v.directionNote}` : ""}`],
              ["Surface", v.surface ?? "Unknown"],
              ["Regions", v.regions.join(", ") || "—"],
              ...(v.detectedHairpins.length ? ([["Hairpins", `${v.detectedHairpins.length} detected (geometry heuristic, not an official count)`]] as [string, string][]) : []),
              ...(v.elevation?.caveat ? ([["Elevation note", v.elevation.caveat]] as [string, string][]) : []),
            ]}
          />
          <div className="flex flex-wrap gap-1">
            <ProvenanceBadge kind={v.provenance.kind} />
            <VerificationBadge status={v.verification} />
            <PublicationBadge status={v.publication} />
          </div>
          <p className="text-[11.5px] leading-snug text-fg-faint">
            {v.provenance.source}
            {v.provenance.license && ` · ${v.provenance.license}`}
            {v.provenance.note && `. ${v.provenance.note}`}
            {v.elevation && ` Elevation: ${v.elevation.source}.`}
          </p>
          <History contributions={contributions} created={{ by: v.createdBy.name, at: v.createdAt }} />
          {!SHARED_MODE && <SmallActions
            items={[
              [<Spline key="c" className="size-3.5" />, "Fix the route line", () => app.set({ contribute: { kind: "geometry_correction", variantId: v.id } })],
              [<PencilLine key="e" className="size-3.5" />, "Improve text", () => app.set({ contribute: { kind: "description_edit", variantId: v.id } })],
              [<MapPinPlus key="p" className="size-3.5" />, "Add a point", () => app.set({ contribute: { kind: "new_poi", targetId: v.id } })],
              [<Flag key="f" className="size-3.5" />, "Report a problem", () => app.set({ contribute: { kind: "report", subject: { type: "variant", id: v.id } } })],
            ]}
          />}
        </Details>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

function PoiList({ pois }: { pois: Poi[] }) {
  return (
    <ul>
      {pois.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => {
              openDetail({ type: "poi", id: p.id });
              focusPoint(p.coordinates as Coord);
            }}
            className="flex min-h-10 w-full items-center gap-2 text-left hover:bg-panel-2"
          >
            <span className="size-2 shrink-0 rounded-full bg-amber" />
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", p.communityLabel ? "text-fg-dim italic" : "text-fg")}>
              {p.communityLabel ? `“${p.name}”` : p.name}
            </span>
            <span className="text-[11px] text-fg-faint">{POI_LABEL[p.category]}</span>
            {p.publication !== "published" && <Badge tone="amber" dashed>Pending</Badge>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PoiDetail({ p }: { p: Poi }) {
  const data = useApp((s) => s.data)!;
  const parent = p.parent;
  const parentName = !parent
    ? undefined
    : parent.type === "location"
      ? data.locations.find((l) => l.id === parent.id)?.name
      : data.variants.find((v) => v.id === parent.id)?.name;
  const photos = data.media.filter((m) => m.attachedTo.type === "poi" && m.attachedTo.id === p.id && m.status !== "removed");
  const addPhoto = () => app.set({ contribute: { kind: "add_media", target: { type: "poi", id: p.id } } });
  return (
    <PanelShell label={`Spot: ${p.name}`}>
      <Header
        title={p.communityLabel ? `“${p.name}”` : p.name}
        subtitle={`${POI_LABEL[p.category]} spot`}
        back={
          parent
            ? {
                label: parentName ?? "Back",
                onClick: () => {
                  openDetail({ type: parent.type, id: parent.id });
                  if (parent.type === "variant") focusVariant(parent.id);
                  else focusLocation(parent.id);
                },
              }
            : undefined
        }
      />
      <MemberBar
        items={[
          [<Camera key="c" className="size-3" />, "Add photo", addPhoto],
          [<Pencil key="e" className="size-3" />, "Edit spot", () => app.set({ contribute: { kind: "edit_poi", id: p.id } })],
        ]}
      />
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-line px-3 py-3">
          {p.communityLabel && <p className="mb-2 text-[12px] text-fg-dim">Local nickname — not an official place name.</p>}
          <p className="text-[13px] leading-relaxed text-fg">{p.description || "No description yet."}</p>
        </div>
        <Block title={`Photos · ${photos.length}`} aside={<AddPhotoButton onClick={addPhoto} />}>
          <Photos items={photos} onAdd={addPhoto} />
        </Block>
        <Details>
          <Facts
            rows={[
              ["Coordinates", <span key="c" className="font-mono text-[11px]">{formatCoord(p.coordinates as Coord, 5)}</span>],
              ["Source", p.provenance.source],
              ["Added by", `${p.createdBy.name} · ${date(p.createdAt)}`],
            ]}
          />
          <div className="flex flex-wrap gap-1">
            <ProvenanceBadge kind={p.provenance.kind} />
            <PublicationBadge status={p.publication} />
          </div>
          {!SHARED_MODE && <SmallActions items={[[<Flag key="f" className="size-3.5" />, "Report", () => app.set({ contribute: { kind: "report", subject: { type: "poi", id: p.id } } })]]} />}
        </Details>
      </div>
    </PanelShell>
  );
}
