"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Undo2, Trash2, Pencil, Check, Upload, ShieldAlert, Eye, RotateCcw, MapPin, AlertTriangle } from "lucide-react";
import {
  app,
  useApp,
  submitContribution,
  reviewContribution,
  resetLocalContributions,
  toast,
  EMPTY_DRAW,
  type ContributeIntent,
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
import { PanelShell } from "@/components/DetailPanel";
import { Badge, Button, cn, Field, inputCls, PublicationBadge } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";

function closeContribute() {
  app.set({ contribute: null, draw: EMPTY_DRAW });
}

function Header({ title, kicker }: { title: string; kicker: string }) {
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
    case "review":
      return <ReviewQueue />;
  }
}

// ---------------------------------------------------------------------------
// Drawing toolbar (shared)
// ---------------------------------------------------------------------------

function DrawTools({ allowGpx = true }: { allowGpx?: boolean }) {
  const draw = useApp((s) => s.draw);
  const fileRef = useRef<HTMLInputElement>(null);
  const [gpxMsg, setGpxMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const len = draw.coords.length >= 2 ? lineLength(draw.coords) : 0;

  const onFile = async (f: File) => {
    if (f.size > 5_000_000) return setGpxMsg({ ok: false, text: "File larger than 5 MB." });
    const r = parseGpx(await f.text());
    if (!r.ok) return setGpxMsg({ ok: false, text: r.error });
    const coords = simplify(r.coordinates, 3);
    app.set({ draw: { ...app.get().draw, active: true, purpose: "route", coords } });
    setGpxMsg({
      ok: true,
      text: `Imported ${r.coordinates.length} ${r.source} points${r.name ? ` from “${r.name}”` : ""}, simplified to ${coords.length} editable vertices.${r.droppedPoints ? ` ${r.droppedPoints} invalid/excess points dropped.` : ""}`,
    });
    const [w, s, e, n] = bboxOf(coords);
    getMap()?.fitBounds([[w, s], [e, n]], { padding: 80, duration: 1200 });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant={draw.active ? "solid" : "outline"}
          size="sm"
          onClick={() => app.set({ draw: { ...draw, active: !draw.active, purpose: "route" } })}
        >
          {draw.active ? <Check className="size-3" /> : <Pencil className="size-3" />}
          {draw.active ? "Finish drawing" : draw.coords.length ? "Resume drawing" : "Start drawing"}
        </Button>
        <Button size="sm" disabled={!draw.coords.length} onClick={() => app.set({ draw: { ...draw, coords: draw.coords.slice(0, -1) } })}>
          <Undo2 className="size-3" /> Undo
        </Button>
        <Button size="sm" variant="ghost" disabled={!draw.coords.length} onClick={() => app.set({ draw: { ...draw, coords: [] } })}>
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
      <div className="flex items-center justify-between border border-line bg-ink px-2.5 py-1.5 font-mono text-[10.5px] text-fg-dim">
        <span>
          <span className="text-fg tabular-nums">{draw.coords.length}</span> PTS
        </span>
        <span>
          <span className="text-fg tabular-nums">{formatKm(len)}</span>
        </span>
        <span className={draw.active ? "text-ice" : "text-fg-faint"}>{draw.active ? "● DRAWING" : "○ IDLE"}</span>
      </div>
      {draw.active && (
        <p className="text-[11px] leading-snug text-fg-faint">
          Click the map to add points · drag a point to move it · right-click a point to remove it.
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
      toast("Submitted — your variant is visible locally as pending review.");
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
    <PanelShell label="Propose a new route variant">
      <Header kicker="Contribute · new route variant" title={parentMode === "existing" && loc ? `New variant · ${loc.name}` : "New road"} />
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
              Trace the road on the map, or import a GPX track. Follow the actual road — the geometry will be reviewed against map data before
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
                {draw.coords.length} pts · {formatKm(lineLength(draw.coords))}
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
    app.set({ draw: { active: true, purpose: "route", coords: simplify(original, 25), reference: original } });
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
    app.set({ draw: { active: true, purpose: "poi", coords: [], reference: null } });
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
// Local review queue (demo reviewer)
// ---------------------------------------------------------------------------

function ReviewQueue() {
  const data = useApp((s) => s.data)!;
  const list = data.contributions.slice().reverse();
  const nameOf = (id?: string) => data.variants.find((v) => v.id === id)?.name ?? data.locations.find((l) => l.id === id)?.name ?? id ?? "";

  const preview = (c: Contribution) => {
    if (c.kind === "geometry_correction" && c.proposedGeometry && c.originalGeometry) {
      app.set({
        draw: { active: false, purpose: "route", coords: c.proposedGeometry.coordinates as Coord[], reference: c.originalGeometry.coordinates as Coord[] },
      });
      const [w, s, e, n] = bboxOf([...(c.proposedGeometry.coordinates as Coord[]), ...(c.originalGeometry.coordinates as Coord[])]);
      getMap()?.fitBounds([[w, s], [e, n]], { padding: { top: 90, bottom: 60, left: 380, right: 460 }, duration: 1200 });
    } else if (c.kind === "new_variant") {
      app.set({ draw: EMPTY_DRAW });
      focusVariant(`var-${c.id}`);
    } else if (c.kind === "new_poi" && c.poi) {
      app.set({ draw: EMPTY_DRAW });
      getMap()?.flyTo({ center: c.poi.coordinates, zoom: 15, duration: 1200 });
    }
  };

  return (
    <PanelShell label="Local contribution queue">
      <Header kicker="Moderation · local demo" title="Contribution queue" />
      <div className="flex gap-2 border-b border-line bg-amber/5 px-3 py-2 text-[11px] leading-snug text-fg-dim">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber" />
        <span>
          Everything here was submitted from this browser. Approve/reject simulates a moderator so you can see the workflow — in production only
          authorised reviewers can do this, server-side. Approving publishes content; it does <em>not</em> mark geometry as verified.
        </span>
      </div>
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 && <p className="px-3 py-8 text-center text-[12px] text-fg-faint">No contributions yet.</p>}
        <ul>
          {list.map((c) => (
            <li key={c.id} className="border-b border-line px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.1em] text-community uppercase">{c.kind.replace("_", " ")}</span>
                <PublicationBadge status={c.status} />
                {c.status === "published" && <Badge tone="ok">Published</Badge>}
                <span className="ml-auto font-mono text-[10px] text-fg-faint">{c.submittedAt.slice(0, 16).replace("T", " ")}</span>
              </div>
              <div className="mt-1 text-[13px] text-fg">
                {c.kind === "new_variant" && (c.variant?.name ?? "")}
                {c.kind === "new_poi" && `${c.poi?.name} → ${nameOf(c.targetId)}`}
                {c.kind === "geometry_correction" && `Geometry of ${nameOf(c.targetId)}`}
                {c.kind === "description_edit" && `Description of ${nameOf(c.targetId)}`}
              </div>
              {c.kind === "new_variant" && (
                <div className="mt-0.5 font-mono text-[10.5px] text-fg-dim">
                  on {c.newLocation ? `${c.newLocation.name} (new location)` : nameOf(c.locationId)} · {c.variant && formatKm(lineLength(c.variant.geometry.coordinates as Coord[]))}
                </div>
              )}
              {c.kind === "geometry_correction" && c.originalGeometry && c.proposedGeometry && (
                <div className="mt-0.5 font-mono text-[10.5px] text-fg-dim">
                  original {formatKm(lineLength(c.originalGeometry.coordinates as Coord[]))} → proposed{" "}
                  {formatKm(lineLength(c.proposedGeometry.coordinates as Coord[]))}
                </div>
              )}
              {c.kind === "description_edit" && c.descriptionEdit && (
                <div className="mt-1 space-y-1 text-[11.5px]">
                  <p className="text-signal/80 line-through decoration-signal/40">{c.descriptionEdit.before}</p>
                  <p className="text-ok/90">{c.descriptionEdit.after}</p>
                </div>
              )}
              {c.note && <p className="mt-1 text-[11.5px] text-fg-dim italic">“{c.note}”</p>}
              {c.possibleDuplicates.length > 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber">
                  <AlertTriangle className="size-3" /> Similar to: {c.possibleDuplicates.map(nameOf).join(", ")}
                </p>
              )}
              <div className="mt-2 flex gap-1.5">
                {c.kind !== "description_edit" && (
                  <Button size="sm" variant="ghost" onClick={() => preview(c)}>
                    <Eye className="size-3" /> Show
                  </Button>
                )}
                {c.status === "pending_review" && (
                  <>
                    <Button size="sm" onClick={() => reviewContribution(c.id, "published")}>
                      <Check className="size-3" /> Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => reviewContribution(c.id, "rejected")}>
                      <X className="size-3" /> Reject
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2 border-t border-line p-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={list.length === 0}
          onClick={() => {
            if (window.confirm("Remove all contributions stored in this browser?")) void resetLocalContributions();
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
