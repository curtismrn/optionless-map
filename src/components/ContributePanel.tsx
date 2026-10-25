"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Undo2, Trash2, Pencil, Check, Upload, ShieldAlert, Eye, RotateCcw, MapPin, AlertTriangle } from "lucide-react";
import {
  app,
  useApp,
  submitContribution,
  resetLocalContributions,
  toast,
  EMPTY_DRAW,
  openDetail,
  type ContributeIntent,
  type ReportSubject,
} from "@/lib/store";
import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  POI_CATEGORIES,
  POI_LABEL,
  NewLocationDraft,
  VariantDraft,
  LngLat,
  Continent,
  type ActivityType,
  type Direction,
  type PoiCategory,
  type Contribution,
} from "@/lib/domain/schema";
import { findPossibleDuplicates } from "@/lib/repository/local";
import { parseGpx } from "@/lib/gpx";
import { bboxOf, formatKm, lineLength, simplify, type Coord } from "@/lib/geo";
import { focusVariant, getMap } from "@/components/map/controller";
import { PanelShell } from "@/components/PanelShell";
import { AddMediaPanel } from "@/components/media/AddMediaPanel";
import { EditLocationPanel, EditVariantPanel, HistoryPanel } from "@/components/edit/EditPanels";
import { EditSpotPanel } from "@/components/edit/EditSpotPanel";
import { MembersPanel } from "@/components/edit/MembersPanel";
import { Badge, Button, cn, Field, inputCls, PublicationBadge } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";

export function closeContribute() {
  app.set({ contribute: null, draw: EMPTY_DRAW });
}

export function Header({ title, kicker }: { title: string; kicker: string }) {
  return (
    <div className="flex items-start justify-between border-b border-line px-3 py-2.5">
      <div>
        <div className="om-label text-community">{kicker}</div>
        <h2 className="font-display text-[22px] leading-tight font-semibold tracking-[0.03em] text-white">{title}</h2>
      </div>
      <button onClick={closeContribute} className="p-1 text-fg-faint hover:text-fg" aria-label="Cancel contribution">
        <X className="size-4" />
      </button>
    </div>
  );
}

function DemoNotice() {
  return (
    <div className="flex gap-2 border-b border-line bg-community/5 px-3 py-2 text-[11px] leading-snug text-fg-dim">
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-community" />
      <span>
        Local demo: submissions are stored in <em>this browser only</em> and enter as <span className="text-amber">pending review</span>. A production
        deployment needs a backend with validation, rate limiting, spam prevention and moderation.
      </span>
    </div>
  );
}

export function ContributePanel() {
  const intent = useApp((s) => s.contribute);
  if (!intent) return null;
  switch (intent.kind) {
    case "new_variant":
      return <NewVariantFlow key={intent.locationId ?? "new"} intent={intent} />;
    case "geometry_correction":
      return <CorrectionFlow key={intent.variantId} variantId={intent.variantId} />;
    case "new_poi":
      return <PoiFlow key={intent.targetId} targetId={intent.targetId} />;
    case "description_edit":
      return <DescriptionFlow key={intent.variantId} variantId={intent.variantId} />;
    case "add_media":
      return <AddMediaPanel key={intent.target.id} target={intent.target} />;
    case "report":
      return <ReportFlow key={intent.subject.id} subject={intent.subject} />;
    case "my_submissions":
      return <MySubmissions />;
    case "edit_location":
      return <EditLocationPanel key={intent.id ?? "new"} id={intent.id} />;
    case "edit_variant":
      return <EditVariantPanel key={intent.id ?? `new-${intent.locationId}`} id={intent.id} locationId={intent.locationId} toScout={intent.toScout} />;
    case "history":
      return <HistoryPanel />;
    case "members":
      return <MembersPanel />;
    case "edit_poi":
      return <EditSpotPanel key={intent.id ?? "new"} id={intent.id} parent={intent.parent} />;
  }
}

// ---------------------------------------------------------------------------
// Drawing toolbar (shared)
// ---------------------------------------------------------------------------

export function DrawTools({ allowGpx = true }: { allowGpx?: boolean }) {
  const draw = useApp((s) => s.draw);
  const fileRef = useRef<HTMLInputElement>(null);
  const [gpxMsg, setGpxMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const len = draw.coords.length >= 2 ? lineLength(draw.coords) : 0;
  const setDraw = (patch: Partial<typeof draw>) => app.set({ draw: { ...app.get().draw, ...patch } });

  const onFile = async (f: File) => {
    if (f.size > 5_000_000) return setGpxMsg({ ok: false, text: "File larger than 5 MB." });
    const r = parseGpx(await f.text());
    if (!r.ok) return setGpxMsg({ ok: false, text: r.error });
    // A recorded track already follows the road: keep it as-is instead of re-routing.
    const coords = simplify(r.coordinates, 3);
    setDraw({ active: true, purpose: "route", waypoints: coords, snap: false });
    setGpxMsg({
      ok: true,
      text: `Imported ${r.coordinates.length} ${r.source} points${r.name ? ` from “${r.name}”` : ""}, simplified to ${coords.length} vertices. Road-following is off for recorded tracks.${r.droppedPoints ? ` ${r.droppedPoints} invalid/excess points dropped.` : ""}`,
    });
    const [w, s, e, n] = bboxOf(coords);
    getMap()?.fitBounds([[w, s], [e, n]], { padding: 80, duration: 1200 });
  };

  const status = {
    idle: ["text-fg-faint", "Place at least two points"],
    routing: ["text-ice", "Finding the road…"],
    snapped: ["text-ok", "Following OSM roads"],
    unsnapped: ["text-amber", draw.snap ? `Straight lines — ${draw.snapError ?? "no road route"}` : "Straight lines (road-following off)"],
  }[draw.snapStatus];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button variant={draw.active ? "solid" : "outline"} size="sm" onClick={() => setDraw({ active: !draw.active, purpose: "route" })}>
          {draw.active ? <Check className="size-3" /> : <Pencil className="size-3" />}
          {draw.active ? "Done placing" : draw.waypoints.length ? "Edit points" : "Place points"}
        </Button>
        <Button size="sm" disabled={!draw.waypoints.length} onClick={() => setDraw({ waypoints: draw.waypoints.slice(0, -1) })}>
          <Undo2 className="size-3" /> Undo
        </Button>
        <Button size="sm" variant="ghost" disabled={!draw.waypoints.length} onClick={() => setDraw({ waypoints: [] })}>
          <Trash2 className="size-3" /> Clear
        </Button>
        {allowGpx && (
          <>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3" /> GPX
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".gpx,application/gpx+xml,application/xml,text/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
      <label className="flex items-center gap-2 text-[12px] text-fg-dim">
        <input type="checkbox" checked={draw.snap} onChange={(e) => setDraw({ snap: e.target.checked })} className="accent-[#8fd6ea]" />
        Follow roads between my points <span className="text-fg-faint">(OpenStreetMap routing)</span>
      </label>
      <div className="flex items-center justify-between gap-2 border border-line bg-ink px-2.5 py-1.5 font-mono text-[10.5px] text-fg-dim">
        <span className="shrink-0">
          <span className="text-fg tabular-nums">{draw.waypoints.length}</span> PTS · <span className="text-fg tabular-nums">{formatKm(len)}</span>
        </span>
        <span className={cn("truncate", status[0])}>{status[1]}</span>
      </div>
      {draw.active && (
        <p className="text-[11px] leading-snug text-fg-faint">
          Click the map at the start, a few points along the road, and the end · drag a point to move it · right-click a point to remove it.
        </p>
      )}
      {gpxMsg && <p className={cn("text-[11px] leading-snug", gpxMsg.ok ? "text-ok" : "text-signal")}>{gpxMsg.text}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New variant (optionally on a new location)
// ---------------------------------------------------------------------------

const STEPS = ["Parent", "Route", "Details", "Review"] as const;

function NewVariantFlow({ intent }: { intent: Extract<ContributeIntent, { kind: "new_variant" }> }) {
  const data = useApp((s) => s.data)!;
  const draw = useApp((s) => s.draw);
  const [step, setStep] = useState(0);
  const [parentMode, setParentMode] = useState<"existing" | "new">(intent.locationId ? "existing" : "existing");
  const [locationId, setLocationId] = useState(intent.locationId ?? data.locations[0]?.id ?? "");
  const [newLoc, setNewLoc] = useState({ name: "", summary: "", countries: [] as string[], regions: "", continent: "Europe" as Continent });
  const [form, setForm] = useState({ name: "", description: "", activity: "mountain_pass" as ActivityType, direction: "both" as Direction, surface: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    app.set({ draw: { ...EMPTY_DRAW } });
    return () => app.set({ draw: EMPTY_DRAW });
  }, []);

  // When entering the route step for an existing location, frame it.
  useEffect(() => {
    if (step === 1 && parentMode === "existing" && draw.coords.length === 0) {
      const loc = data.locations.find((l) => l.id === locationId);
      if (loc) getMap()?.flyTo({ center: loc.center, zoom: 12.5, pitch: 0, bearing: 0, duration: 1400 });
      app.set({ draw: { ...app.get().draw, active: true, purpose: "route" } });
    }
    if (step !== 1 && app.get().draw.active) app.set({ draw: { ...app.get().draw, active: false } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const geometry = { type: "LineString" as const, coordinates: draw.coords as [number, number][] };
  const duplicates = useMemo(
    () => (step === 3 && draw.coords.length >= 2 ? findPossibleDuplicates(draw.coords, data.variants) : []),
    [step, draw.coords, data.variants],
  );

  const validate = (s: number): boolean => {
    const e: Record<string, string> = {};
    if (s === 0 && parentMode === "new") {
      const r = NewLocationDraft.safeParse({ ...newLoc, regions: newLoc.regions.split(",").map((x) => x.trim()).filter(Boolean) });
      if (!r.success) for (const i of r.error.issues) e[String(i.path[0])] = i.message;
    }
    if (s === 0 && parentMode === "existing" && !locationId) e.locationId = "Choose a location";
    if (s === 1) {
      if (draw.coords.length < 2) e.geometry = "Place at least two points.";
      else if (!draw.coords.every((c) => LngLat.safeParse(c).success)) e.geometry = "Invalid coordinates.";
      else if (lineLength(draw.coords) < 100) e.geometry = "Route is shorter than 100 m.";
    }
    if (s === 2) {
      const r = VariantDraft.safeParse({ ...form, surface: form.surface || undefined, geometry });
      if (!r.success) for (const i of r.error.issues) e[String(i.path[0])] = i.message;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => validate(step) && setStep((s) => Math.min(3, s + 1));

  const submit = async () => {
    if (![0, 1, 2].every(validate)) return;
    setBusy(true);
    try {
      const c = await submitContribution({
        kind: "new_variant",
        locationId: parentMode === "existing" ? locationId : undefined,
        newLocation:
          parentMode === "new"
            ? { ...newLoc, regions: newLoc.regions.split(",").map((x) => x.trim()).filter(Boolean) }
            : undefined,
        variant: VariantDraft.parse({ ...form, surface: form.surface || undefined, geometry }),
      });
      toast("Suggestion sent for review — only you can see it until it is approved.");
      app.set({ contribute: null, draw: EMPTY_DRAW, selection: { type: "variant", id: `var-${c.id}` } });
      focusVariant(`var-${c.id}`);
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : "Submission failed" });
    } finally {
      setBusy(false);
    }
  };

  const loc = data.locations.find((l) => l.id === locationId);

  return (
    <PanelShell label="Suggest a missing road">
      <Header kicker="Suggest · reviewed before publication" title={parentMode === "existing" && loc ? `Missing route · ${loc.name}` : "Suggest a missing road"} />
      <DemoNotice />
      <ol className="grid grid-cols-4 border-b border-line">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => (i < step ? setStep(i) : i === step + 1 ? next() : undefined)}
              className={cn(
                "w-full border-b-2 px-2 py-2 text-left font-mono text-[10px] tracking-[0.1em] uppercase",
                i === step ? "border-ice text-white" : i < step ? "border-ice/30 text-fg-dim" : "border-transparent text-fg-faint",
              )}
            >
              <span className="tabular-nums">0{i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="om-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {step === 0 && (
          <>
            <div className="flex gap-1">
              {(["existing", "new"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setParentMode(m)}
                  className={cn(
                    "flex-1 border px-2 py-2 text-left",
                    parentMode === m ? "border-ice/60 bg-ice/8" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="block font-mono text-[10px] tracking-[0.1em] text-fg uppercase">{m === "existing" ? "Existing location" : "New location"}</span>
                  <span className="block text-[11px] text-fg-faint">{m === "existing" ? "Add a variant to a mapped place" : "Create a new parent place"}</span>
                </button>
              ))}
            </div>
            {parentMode === "existing" ? (
              <Field label="Parent location" error={errors.locationId}>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
                  {data.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.countries.join("/")}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Location name" error={errors.name}>
                  <input className={inputCls} value={newLoc.name} onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })} placeholder="e.g. Col de la Bonette" />
                </Field>
                <Field label="Short description" error={errors.summary}>
                  <textarea rows={3} className={inputCls} value={newLoc.summary} onChange={(e) => setNewLoc({ ...newLoc, summary: e.target.value })} />
                </Field>
                <Field label="Countries" hint="Select several for border locations." error={errors.countries}>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() =>
                          setNewLoc({
                            ...newLoc,
                            countries: newLoc.countries.includes(code) ? newLoc.countries.filter((c) => c !== code) : [...newLoc.countries, code],
                          })
                        }
                        title={name}
                        className={cn(
                          "h-6 border px-1.5 font-mono text-[10px]",
                          newLoc.countries.includes(code) ? "border-ice/70 text-ice" : "border-line text-fg-dim hover:text-fg",
                        )}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Regions" hint="Comma-separated">
                    <input className={inputCls} value={newLoc.regions} onChange={(e) => setNewLoc({ ...newLoc, regions: e.target.value })} />
                  </Field>
                  <Field label="Continent">
                    <select className={inputCls} value={newLoc.continent} onChange={(e) => setNewLoc({ ...newLoc, continent: e.target.value as Continent })}>
                      {Continent.options.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-[12px] leading-relaxed text-fg-dim">
              Click the start, a few points along the way and the end — the line follows OSM roads between them. Or import a GPX track. Suggestions are reviewed against map data before
              publication.
            </p>
            <DrawTools />
            {errors.geometry && <p className="text-[11.5px] text-signal">{errors.geometry}</p>}
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Variant name" error={errors.name}>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. North ramp from Jausiers" />
            </Field>
            <Field label="Description" error={errors.description}>
              <textarea rows={4} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Activity">
                <select className={inputCls} value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value as ActivityType })}>
                  {ACTIVITY_TYPES.map((a) => (
                    <option key={a} value={a}>
                      {ACTIVITY_LABEL[a]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Direction">
                <select className={inputCls} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}>
                  <option value="both">Both directions</option>
                  <option value="one_way">One-way (as drawn)</option>
                  <option value="recommended">Recommended as drawn</option>
                </select>
              </Field>
            </div>
            <Field label="Surface" hint="Optional — leave empty if unknown">
              <input className={inputCls} value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} placeholder="Asphalt, gravel…" />
            </Field>
            {["hill_climb", "rally_stage", "drift_spot", "circuit"].includes(form.activity) && (
              <p className="flex gap-2 border border-signal/40 bg-signal/5 px-2.5 py-2 text-[11.5px] leading-snug text-fg-dim">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-signal" />
                Competition formats are only appropriate on closed courses or authorised events. Describe the venue or event authority; do not
                promote racing on open public roads.
              </p>
            )}
          </>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-[12px]">
              <dt className="om-label pt-px">Parent</dt>
              <dd className="text-fg">{parentMode === "existing" ? loc?.name : `${newLoc.name} (new location)`}</dd>
              <dt className="om-label pt-px">Name</dt>
              <dd className="text-fg">{form.name}</dd>
              <dt className="om-label pt-px">Activity</dt>
              <dd className="text-fg">{ACTIVITY_LABEL[form.activity]}</dd>
              <dt className="om-label pt-px">Geometry</dt>
              <dd className="font-mono text-[11px] text-fg-dim">
                {draw.coords.length} vertices · {formatKm(lineLength(draw.coords))} · {draw.snapStatus === "snapped" ? "follows OSM roads" : "straight segments"}
              </dd>
              <dt className="om-label pt-px">Status</dt>
              <dd>
                <Badge tone="amber" dashed>
                  Pending review
                </Badge>{" "}
                <Badge tone="dim">Unverified</Badge>
              </dd>
            </dl>
            {duplicates.length > 0 && (
              <div className="border border-amber/40 bg-amber/5 px-2.5 py-2 text-[11.5px] text-fg-dim">
                <div className="mb-1 flex items-center gap-1.5 text-amber">
                  <AlertTriangle className="size-3.5" /> Possible duplicate
                </div>
                ≥60% of your line runs within 40 m of:
                <ul className="mt-1 list-inside list-disc">
                  {duplicates.map((id) => (
                    <li key={id}>{data.variants.find((v) => v.id === id)?.name}</li>
                  ))}
                </ul>
                It will be flagged for a reviewer — nothing is merged automatically. Consider a correction instead.
              </div>
            )}
            {errors.submit && <p className="text-[11.5px] text-signal">{errors.submit}</p>}
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-line p-2">
        <Button variant="ghost" onClick={step === 0 ? closeContribute : () => setStep(step - 1)}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        <div className="flex-1" />
        {step < 3 ? (
          <Button variant="solid" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button variant="solid" disabled={busy} onClick={submit}>
            Submit for review
          </Button>
        )}
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Geometry correction — original kept separately from the proposal
// ---------------------------------------------------------------------------

function CorrectionFlow({ variantId }: { variantId: string }) {
  const data = useApp((s) => s.data)!;
  const draw = useApp((s) => s.draw);
  const v = data.variants.find((x) => x.id === variantId);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!v) return;
    const original = v.geometry.coordinates as Coord[];
    // ~8 waypoints along the current line: routed through OSM they reproduce it; dragging one onto the right road fixes it.
    const step = Math.max(1, Math.floor(original.length / 8));
    const waypoints = original.filter((_, i) => i % step === 0 || i === original.length - 1);
    app.set({ draw: { ...EMPTY_DRAW, active: true, purpose: "route", waypoints, coords: original, snapStatus: "snapped", reference: original } });
    focusVariant(v.id);
    return () => app.set({ draw: EMPTY_DRAW });
  }, [v]);

  if (!v) return null;
  const submit = async () => {
    const g = { type: "LineString" as const, coordinates: draw.coords as [number, number][] };
    if (draw.coords.length < 2) return setErr("The corrected line needs at least two points.");
    if (note.trim().length < 5) return setErr("Explain what you corrected (helps reviewers).");
    await submitContribution({ kind: "geometry_correction", targetId: v.id, originalGeometry: v.geometry, proposedGeometry: g, note: note.trim() });
    toast("Correction submitted. The live route is unchanged until a reviewer accepts it.");
    app.set({ contribute: null, draw: EMPTY_DRAW, selection: { type: "variant", id: v.id } });
  };

  return (
    <PanelShell label="Suggest a route correction">
      <Header kicker="Contribute · geometry correction" title={v.name} />
      <DemoNotice />
      <div className="om-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <p className="text-[12px] leading-relaxed text-fg-dim">
          The current geometry is shown as an <span className="text-amber">amber dashed reference</span>. Your editable copy (simplified to{" "}
          {draw.coords.length} vertices) is drawn in white. Original and proposal are stored separately so a reviewer can compare and reject
          without losing anything.
        </p>
        <DrawTools allowGpx />
        <Field label="What changed?" hint="e.g. road realigned after 2025 works between hairpins 4 and 6">
          <textarea rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {err && <p className="text-[11.5px] text-signal">{err}</p>}
      </div>
      <div className="flex gap-2 border-t border-line p-2">
        <Button variant="ghost" onClick={closeContribute}>
          Cancel
        </Button>
        <div className="flex-1" />
        <Button variant="solid" onClick={submit}>
          Submit correction
        </Button>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Point of interest
// ---------------------------------------------------------------------------

function PoiFlow({ targetId }: { targetId: string }) {
  const data = useApp((s) => s.data)!;
  const draw = useApp((s) => s.draw);
  const parentName = data.locations.find((l) => l.id === targetId)?.name ?? data.variants.find((v) => v.id === targetId)?.name ?? "";
  const [f, setF] = useState({ name: "", category: "viewpoint" as PoiCategory, description: "", communityLabel: false, privateOk: false });
  const [err, setErr] = useState("");

  useEffect(() => {
    app.set({ draw: { ...EMPTY_DRAW, active: true, purpose: "poi", snap: false } });
    return () => app.set({ draw: EMPTY_DRAW });
  }, []);

  const submit = async () => {
    if (draw.coords.length !== 1) return setErr("Click the map to place the point.");
    if (f.name.trim().length < 2) return setErr("Give the point a name.");
    if (!f.privateOk) return setErr("Confirm the point is not a private residence or personal location.");
    await submitContribution({
      kind: "new_poi",
      targetId,
      poi: { name: f.name.trim(), coordinates: draw.coords[0]!, category: f.category, description: f.description.trim(), communityLabel: f.communityLabel },
    });
    toast("Point submitted for review.");
    app.set({ contribute: null, draw: EMPTY_DRAW, selection: { type: targetId.startsWith("var-") ? "variant" : "location", id: targetId } });
  };

  return (
    <PanelShell label="Add a point of interest">
      <Header kicker="Contribute · point of interest" title={`Point on ${parentName}`} />
      <DemoNotice />
      <div className="om-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <div className="flex items-center gap-2 border border-line bg-ink px-2.5 py-2 font-mono text-[11px] text-fg-dim">
          <MapPin className="size-3.5 text-ice" />
          {draw.coords[0] ? `${draw.coords[0][1].toFixed(5)}, ${draw.coords[0][0].toFixed(5)}` : "Click the map to place the point"}
        </div>
        <Field label="Name">
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Viewpoint above hairpin 12" />
        </Field>
        <Field label="Category">
          <select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PoiCategory })}>
            {POI_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {POI_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea rows={3} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <label className="flex items-start gap-2 text-[12px] text-fg-dim">
          <input type="checkbox" checked={f.communityLabel} onChange={(e) => setF({ ...f, communityLabel: e.target.checked })} className="mt-0.5 accent-[#b8a6f2]" />
          <span>
            This is a local nickname (e.g. “Virage de la mort”), not an official place name.
          </span>
        </label>
        <label className="flex items-start gap-2 text-[12px] text-fg-dim">
          <input type="checkbox" checked={f.privateOk} onChange={(e) => setF({ ...f, privateOk: e.target.checked })} className="mt-0.5 accent-[#8fd6ea]" />
          <span>This point is not a private home or anyone&apos;s personal location.</span>
        </label>
        {err && <p className="text-[11.5px] text-signal">{err}</p>}
      </div>
      <div className="flex gap-2 border-t border-line p-2">
        <Button variant="ghost" onClick={closeContribute}>
          Cancel
        </Button>
        <div className="flex-1" />
        <Button variant="solid" onClick={submit}>
          Submit point
        </Button>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Description edit
// ---------------------------------------------------------------------------

function DescriptionFlow({ variantId }: { variantId: string }) {
  const data = useApp((s) => s.data)!;
  const v = data.variants.find((x) => x.id === variantId);
  const [text, setText] = useState(v?.description ?? "");
  if (!v) return null;
  const changed = text.trim() !== v.description.trim();
  return (
    <PanelShell label="Improve description">
      <Header kicker="Contribute · description edit" title={v.name} />
      <DemoNotice />
      <div className="om-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <Field label="Current">
          <p className="border border-line bg-ink px-2.5 py-2 text-[12px] text-fg-faint">{v.description}</p>
        </Field>
        <Field label="Proposed" hint="Stick to verifiable facts. No claims about speed, safety or legality.">
          <textarea rows={6} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
        </Field>
      </div>
      <div className="flex gap-2 border-t border-line p-2">
        <Button variant="ghost" onClick={closeContribute}>
          Cancel
        </Button>
        <div className="flex-1" />
        <Button
          variant="solid"
          disabled={!changed}
          onClick={async () => {
            await submitContribution({ kind: "description_edit", targetId: v.id, descriptionEdit: { before: v.description, after: text.trim() } });
            toast("Edit submitted for review.");
            app.set({ contribute: null, selection: { type: "variant", id: v.id } });
          }}
        >
          Submit edit
        </Button>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Report a problem (road, route, point or media)
// ---------------------------------------------------------------------------

const REPORT_REASONS = {
  incorrect_geometry: "Route line is wrong",
  duplicate: "Duplicate of another road",
  wrong_information: "Wrong name or information",
  unsafe_or_illegal: "Promotes unsafe or illegal driving",
  private_location: "Shows a private / personal location",
  copyright: "Copyright problem",
  inappropriate: "Inappropriate content",
  other: "Something else",
} as const;
type ReportReason = keyof typeof REPORT_REASONS;

function ReportFlow({ subject }: { subject: ReportSubject }) {
  const data = useApp((s) => s.data)!;
  const reasons: ReportReason[] =
    subject.type === "media"
      ? ["copyright", "unsafe_or_illegal", "private_location", "inappropriate", "wrong_information", "other"]
      : subject.type === "poi"
        ? ["wrong_information", "private_location", "duplicate", "other"]
        : ["incorrect_geometry", "duplicate", "wrong_information", "unsafe_or_illegal", "other"];
  const [reason, setReason] = useState<ReportReason>(reasons[0]!);
  const [details, setDetails] = useState("");
  const name =
    subject.type === "media"
      ? data.media.find((m) => m.id === subject.id)?.title
      : subject.type === "location"
        ? data.locations.find((l) => l.id === subject.id)?.name
        : subject.type === "variant"
          ? data.variants.find((v) => v.id === subject.id)?.name
          : data.pois.find((p) => p.id === subject.id)?.name;

  const submit = async () => {
    await submitContribution({ kind: "report", targetId: subject.id, report: { subject, reason, details: details.trim() } });
    toast("Thanks — report recorded (pending review).");
    app.set({ contribute: null });
  };

  return (
    <PanelShell label="Report a problem">
      <Header kicker={`Report · ${subject.type}`} title={name ?? "Item"} />
      <div className="om-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <fieldset className="space-y-1">
          <legend className="om-label mb-1.5">What&apos;s wrong?</legend>
          {reasons.map((r) => (
            <label
              key={r}
              className={cn(
                "flex cursor-pointer items-center gap-2 border px-2.5 py-2 text-[12.5px]",
                reason === r ? "border-ice/50 bg-ice/5 text-fg" : "border-line text-fg-dim hover:border-line-strong",
              )}
            >
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-[#8fd6ea]" />
              {REPORT_REASONS[r]}
            </label>
          ))}
        </fieldset>
        {reason === "incorrect_geometry" && subject.type === "variant" && (
          <button
            onClick={() => app.set({ contribute: { kind: "geometry_correction", variantId: subject.id } })}
            className="w-full border border-dashed border-line-strong px-2.5 py-2 text-left text-[12px] text-fg-dim hover:border-ice/60 hover:text-fg"
          >
            Know the right line? <span className="text-ice">Propose a corrected route instead →</span>
          </button>
        )}
        <Field label="Details (optional)">
          <textarea rows={3} maxLength={1000} className={inputCls} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <p className="text-[11px] text-fg-faint">Prototype: reports are kept in this browser; nothing reaches a moderator yet.</p>
      </div>
      <div className="flex gap-2 border-t border-line p-2">
        <Button variant="ghost" onClick={closeContribute}>
          Cancel
        </Button>
        <div className="flex-1" />
        <Button variant="solid" onClick={submit}>
          Send report
        </Button>
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// My submissions — status only. No approve/reject: that needs real accounts
// and moderator roles, which the prototype does not have.
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<Contribution["kind"], string> = {
  new_variant: "Road suggestion",
  geometry_correction: "Route-line fix",
  new_poi: "New point",
  description_edit: "Text edit",
  report: "Report",
};

function MySubmissions() {
  const data = useApp((s) => s.data)!;
  const list = data.contributions.slice().reverse();
  const myMedia = data.media.filter((m) => m.source === "local");
  const nameOf = (id?: string) =>
    data.variants.find((v) => v.id === id)?.name ?? data.locations.find((l) => l.id === id)?.name ?? data.media.find((m) => m.id === id)?.title ?? id ?? "";

  const show = (c: Contribution) => {
    if (c.kind === "geometry_correction" && c.proposedGeometry && c.originalGeometry) {
      const coords = c.proposedGeometry.coordinates as Coord[];
      app.set({ draw: { ...EMPTY_DRAW, coords, snapStatus: "snapped", reference: c.originalGeometry.coordinates as Coord[] } });
      const [w, s, e, n] = bboxOf([...coords, ...(c.originalGeometry.coordinates as Coord[])]);
      getMap()?.fitBounds([[w, s], [e, n]], { padding: { top: 90, bottom: 60, left: 380, right: 470 }, duration: 1200 });
    } else if (c.kind === "new_variant") {
      app.set({ draw: EMPTY_DRAW });
      openDetail({ type: "variant", id: `var-${c.id}` });
      focusVariant(`var-${c.id}`);
    } else if (c.kind === "new_poi" && c.poi) {
      app.set({ draw: EMPTY_DRAW });
      getMap()?.flyTo({ center: c.poi.coordinates, zoom: 15, duration: 1200 });
    }
  };

  return (
    <PanelShell label="My submissions">
      <Header kicker="Contributions · this browser" title="My submissions" />
      <div className="flex gap-2 border-b border-line bg-amber/5 px-3 py-2 text-[11px] leading-snug text-fg-dim">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber" />
        <span>
          Road suggestions, fixes and reports wait for <span className="text-amber">review</span> and stay out of the main atlas until approved.
          Reviewing needs accounts and moderators, which this prototype doesn&apos;t have yet — so these statuses won&apos;t change. Photos appear straight away — in this browser only.
        </span>
      </div>
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-1">
          <span className="om-label">Photos · {myMedia.length}</span>
        </div>
        {myMedia.length === 0 ? (
          <p className="px-3 pb-3 text-[12px] text-fg-faint">Open any road and use “Add photo”.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1 px-3 pb-3">
            {myMedia.map((m, i) => (
              <button
                key={m.id}
                onClick={() => app.set({ lightbox: { ids: myMedia.map((x) => x.id), index: i } })}
                className="relative aspect-square overflow-hidden bg-panel-3"
                aria-label={m.caption || m.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.thumbUrl} alt={m.caption || m.title} className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="border-t border-line px-3 pt-3 pb-1">
          <span className="om-label">Suggestions & reports · {list.length}</span>
        </div>
        {list.length === 0 && <p className="px-3 py-3 text-[12px] text-fg-faint">Nothing yet.</p>}
        <ul>
          {list.map((c) => (
            <li key={c.id} className="border-b border-line/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.1em] text-community uppercase">{KIND_LABEL[c.kind]}</span>
                <PublicationBadge status={c.status} />
                <span className="ml-auto font-mono text-[10px] text-fg-faint">{c.submittedAt.slice(0, 16).replace("T", " ")}</span>
              </div>
              <div className="mt-1 text-[13px] text-fg">
                {c.kind === "new_variant" && `${c.variant?.name} → ${c.newLocation ? `${c.newLocation.name} (new road)` : nameOf(c.locationId)}`}
                {c.kind === "new_poi" && `${c.poi?.name} → ${nameOf(c.targetId)}`}
                {c.kind === "geometry_correction" && `Route line of ${nameOf(c.targetId)}`}
                {c.kind === "description_edit" && `Text of ${nameOf(c.targetId)}`}
                {c.kind === "report" && c.report && `${REPORT_REASONS[c.report.reason as ReportReason]} — ${nameOf(c.report.subject.id)}`}
              </div>
              {c.possibleDuplicates.length > 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber">
                  <AlertTriangle className="size-3" /> Looks similar to: {c.possibleDuplicates.map(nameOf).join(", ")}
                </p>
              )}
              {["new_variant", "geometry_correction", "new_poi"].includes(c.kind) && (
                <button
                  onClick={() => show(c)}
                  className="mt-1.5 flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-fg-dim uppercase hover:text-ice"
                >
                  <Eye className="size-3" /> Show on map
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2 border-t border-line p-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={list.length === 0 && myMedia.length === 0}
          onClick={() => {
            if (window.confirm("Delete all suggestions, reports, photos and clips stored in this browser?")) void resetLocalContributions();
          }}
        >
          <RotateCcw className="size-3" /> Clear local data
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={closeContribute}>
          Close
        </Button>
      </div>
    </PanelShell>
  );
}
