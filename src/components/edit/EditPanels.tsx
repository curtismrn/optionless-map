"use client";

// Direct editing for invited members (shared mode). No approval step: Save
// writes to the shared database, the map reloads, and History can undo it.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History as HistoryIcon, Loader2, RotateCcw, Save, Trash2, Spline } from "lucide-react";
import { app, useApp, runEdit, openDetail, toast, editor, EMPTY_DRAW } from "@/lib/store";
import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  Continent,
  LocationInput,
  VariantInput,
  type ActivityType,
  type Direction,
} from "@/lib/domain/schema";
import type { EditEntry } from "@/lib/repository/types";
import { findPossibleDuplicates } from "@/lib/repository/local";
import { bboxCenter, bboxOf, formatKm, lineLength, type Coord } from "@/lib/geo";
import { computeElevation, detectHairpins } from "@/lib/routeStats";
import { focusLocation, focusVariant, getMap } from "@/components/map/controller";
import { PanelShell } from "@/components/PanelShell";
import { DrawTools, Header, closeContribute } from "@/components/ContributePanel";
import { Button, Field, inputCls, cn } from "@/components/ui";
import { COUNTRY_NAMES } from "@/data/seed";

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Footer({ busy, onSave, onDelete, saveLabel, disabled }: { busy: string | null; onSave: () => void; onDelete?: () => void; saveLabel: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 border-t border-line p-2">
      {onDelete ? (
        <Button variant="danger" disabled={!!busy} onClick={onDelete}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      ) : (
        <Button variant="ghost" disabled={!!busy} onClick={closeContribute}>
          Cancel
        </Button>
      )}
      <div className="flex-1" />
      {busy && (
        <span className="flex items-center gap-1.5 text-[12px] text-fg-dim" role="status">
          <Loader2 className="size-3.5 animate-spin" /> {busy}
        </span>
      )}
      <Button variant="solid" disabled={!!busy || disabled} onClick={onSave}>
        <Save className="size-3.5" /> {saveLabel}
      </Button>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="flex gap-1.5 border border-signal/40 bg-signal/5 px-2.5 py-2 text-[12px] text-signal">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {text}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Road (location)

export function EditLocationPanel({ id }: { id?: string }) {
  const data = useApp((s) => s.data)!;
  const draw = useApp((s) => s.draw);
  const existing = id ? data.locations.find((l) => l.id === id) : undefined;
  const routes = id ? data.variants.filter((v) => v.locationId === id) : [];
  const [f, setF] = useState({
    name: existing?.name ?? "",
    summary: existing?.summary ?? "",
    countries: existing?.countries ?? ([] as string[]),
    regions: existing?.regions.join(", ") ?? "",
    continent: existing?.continent ?? ("Europe" as Continent),
    tags: existing?.tags.join(", ") ?? "",
    featured: existing?.featured ?? false,
  });
  const [center, setCenter] = useState<Coord | null>((existing?.center as Coord) ?? null);
  const [placing, setPlacing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  // pick the pin position by clicking the map
  useEffect(() => {
    if (placing && draw.waypoints[0]) {
      setCenter(draw.waypoints[0]);
      setPlacing(false);
      app.set({ draw: EMPTY_DRAW });
    }
  }, [draw.waypoints, placing]);
  useEffect(() => () => app.set({ draw: EMPTY_DRAW }), []);

  const save = async () => {
    setErr("");
    const c = center ?? (() => { const m = getMap()?.getCenter(); return m ? ([+m.lng.toFixed(5), +m.lat.toFixed(5)] as Coord) : null; })();
    const parsed = LocationInput.safeParse({ ...f, regions: splitList(f.regions), tags: splitList(f.tags), center: c });
    if (!parsed.success) return setErr(parsed.error.issues.map((i) => i.message).join(" · "));
    setBusy("Saving…");
    try {
      const newId = await runEdit((e) => e.saveLocation(parsed.data, id), existing ? "Road saved." : "Road created — now add its first route.");
      if (existing) openDetail({ type: "location", id: newId });
      else app.set({ contribute: { kind: "edit_variant", locationId: newId }, selection: null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Saving failed");
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    if (!existing) return;
    const msg = `Delete “${existing.name}”${routes.length ? ` and its ${routes.length} route${routes.length > 1 ? "s" : ""}` : ""} and their photos for everyone?\n\nYou can undo this from History.`;
    if (!window.confirm(msg)) return;
    setBusy("Deleting…");
    try {
      await runEdit((e) => e.deleteLocation(existing.id), "Road deleted — undo from History if needed.");
      app.set({ contribute: null, selection: null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deleting failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PanelShell label={existing ? "Edit road" : "New road"}>
      <Header kicker={existing ? "Edit road · shared with all members" : "New road · shared with all members"} title={existing?.name ?? "New road"} />
      <div className="om-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <Field label="Name">
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Col de la Bonette" maxLength={120} />
        </Field>
        <Field label="Short description">
          <textarea rows={3} className={inputCls} value={f.summary} maxLength={1000} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        </Field>
        <Field label="Countries" hint="Pick several for a border road.">
          <div className="flex flex-wrap gap-1">
            {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
              <button
                key={code}
                type="button"
                title={name}
                onClick={() => setF({ ...f, countries: f.countries.includes(code) ? f.countries.filter((c) => c !== code) : [...f.countries, code] })}
                className={cn("h-8 min-w-9 border px-1.5 font-mono text-[11px]", f.countries.includes(code) ? "border-ice/70 text-ice" : "border-line text-fg-dim hover:text-fg")}
              >
                {code}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Regions" hint="Comma-separated">
            <input className={inputCls} value={f.regions} onChange={(e) => setF({ ...f, regions: e.target.value })} />
          </Field>
          <Field label="Continent">
            <select className={inputCls} value={f.continent} onChange={(e) => setF({ ...f, continent: e.target.value as Continent })}>
              {Continent.options.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Tags" hint="Comma-separated, e.g. alps, hairpins">
          <input className={inputCls} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </Field>
        <Field label="Map pin">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-fg-dim">{center ? `${center[1].toFixed(4)}, ${center[0].toFixed(4)}` : "Map centre (when saved)"}</span>
            <Button
              size="sm"
              variant={placing ? "solid" : "outline"}
              onClick={() => {
                setPlacing(true);
                app.set({ draw: { ...EMPTY_DRAW, active: true, purpose: "poi", snap: false } });
              }}
            >
              {placing ? "Click the map…" : "Place on map"}
            </Button>
            {routes.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCenter(bboxCenter(bboxOf(routes.flatMap((v) => v.geometry.coordinates as Coord[]))))}
              >
                Centre on its routes
              </Button>
            )}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-[12.5px] text-fg-dim">
          <input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} className="accent-[#e6a43c]" />
          Featured (shown first, amber pin)
        </label>
        <ErrorNote text={err} />
      </div>
      <Footer busy={busy} onSave={save} onDelete={existing ? del : undefined} saveLabel={existing ? "Save road" : "Create road"} />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Route (variant)

export function EditVariantPanel({ id, locationId }: { id?: string; locationId?: string }) {
  const data = useApp((s) => s.data)!;
  const draw = useApp((s) => s.draw);
  const existing = id ? data.variants.find((v) => v.id === id) : undefined;
  const [locId, setLocId] = useState(existing?.locationId ?? locationId ?? data.locations[0]?.id ?? "");
  const loc = data.locations.find((l) => l.id === locId);
  const [f, setF] = useState({
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    activity: existing?.activity ?? ("mountain_pass" as ActivityType),
    direction: existing?.direction ?? ("both" as Direction),
    surface: existing?.surface ?? "",
  });
  // A new route starts in line-editing mode; an existing one keeps its stored line untouched unless asked.
  const [editLine, setEditLine] = useState(!existing);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const startLine = () => {
    setEditLine(true);
    if (existing) {
      const original = existing.geometry.coordinates as Coord[];
      const step = Math.max(1, Math.floor(original.length / 8));
      const waypoints = (existing.waypoints as Coord[] | undefined) ?? original.filter((_, i) => i % step === 0 || i === original.length - 1);
      app.set({ draw: { ...EMPTY_DRAW, active: true, purpose: "route", waypoints, coords: original, snapStatus: "snapped", reference: original } });
      focusVariant(existing.id);
    } else {
      app.set({ draw: { ...EMPTY_DRAW, active: true, purpose: "route" } });
      if (loc) getMap()?.flyTo({ center: loc.center, zoom: 12.5, pitch: 0, bearing: 0, duration: 1200 });
    }
  };
  useEffect(() => {
    if (!existing) startLine();
    return () => app.set({ draw: EMPTY_DRAW });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineChanged = editLine && draw.coords.length >= 2;
  const geometry = lineChanged ? draw.coords : ((existing?.geometry.coordinates as Coord[]) ?? []);
  const duplicates = useMemo(
    () => (lineChanged ? findPossibleDuplicates(draw.coords, data.variants, existing?.id) : []),
    [lineChanged, draw.coords, data.variants, existing?.id],
  );

  const save = async () => {
    setErr("");
    if (editLine && draw.snapStatus === "routing") return setErr("Still finding the road — wait a second.");
    if (geometry.length < 2) return setErr("Place at least two points on the map.");
    if (lineLength(geometry) < 100) return setErr("The route is shorter than 100 m.");
    const input = {
      locationId: locId,
      name: f.name,
      description: f.description,
      activity: f.activity,
      direction: f.direction,
      surface: f.surface || undefined,
      countries: existing?.countries ?? loc?.countries ?? [],
      regions: existing?.regions ?? loc?.regions ?? [],
      geometry: { type: "LineString" as const, coordinates: geometry as [number, number][] },
      waypoints: lineChanged ? (draw.snap && draw.waypoints.length <= 25 ? draw.waypoints : undefined) : (existing?.waypoints as [number, number][] | undefined),
    };
    const parsed = VariantInput.safeParse(input);
    if (!parsed.success) return setErr(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "));
    try {
      let payload = parsed.data;
      if (lineChanged) {
        setBusy("Measuring elevation…");
        const elevation = await computeElevation(geometry);
        payload = { ...payload, elevation, detectedHairpins: detectHairpins(geometry) };
        if (!elevation) toast("Elevation couldn't be measured (terrain service unreachable) — saved without it.");
      }
      setBusy("Saving…");
      const newId = await runEdit((e) => e.saveVariant(payload, existing?.id), existing ? "Route saved." : "Route created.");
      app.set({ draw: EMPTY_DRAW });
      openDetail({ type: "variant", id: newId });
      focusVariant(newId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Saving failed");
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    if (!existing) return;
    if (!window.confirm(`Delete the route “${existing.name}” and its photos for everyone?\n\nYou can undo this from History.`)) return;
    setBusy("Deleting…");
    try {
      await runEdit((e) => e.deleteVariant(existing.id), "Route deleted — undo from History if needed.");
      app.set({ draw: EMPTY_DRAW });
      openDetail({ type: "location", id: existing.locationId });
      focusLocation(existing.locationId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deleting failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PanelShell label={existing ? "Edit route" : "New route"}>
      <Header kicker={existing ? "Edit route · shared with all members" : "New route · shared with all members"} title={existing?.name ?? (loc ? `New route on ${loc.name}` : "New route")} />
      <div className="om-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <Field label="Road">
          <select className={inputCls} value={locId} onChange={(e) => setLocId(e.target.value)}>
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Route name" hint="e.g. “French-side ascent”, “Full crossing”">
          <input className={inputCls} value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <select className={inputCls} value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value as ActivityType })}>
              {ACTIVITY_TYPES.map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_LABEL[a]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Direction">
            <select className={inputCls} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as Direction })}>
              <option value="both">Both directions</option>
              <option value="one_way">One-way (as drawn)</option>
              <option value="recommended">Recommended as drawn</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea rows={3} className={inputCls} value={f.description} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Surface" hint="Optional">
          <input className={inputCls} value={f.surface} maxLength={60} onChange={(e) => setF({ ...f, surface: e.target.value })} placeholder="Asphalt, gravel…" />
        </Field>

        <div className="border-t border-line pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-dim uppercase">Route line</span>
            {existing && !editLine && (
              <Button size="sm" onClick={startLine}>
                <Spline className="size-3" /> Edit line
              </Button>
            )}
          </div>
          {editLine ? (
            <>
              {existing && <p className="mb-2 text-[11.5px] text-fg-faint">The current line is the amber dashed reference. Drag the white points onto the right road.</p>}
              <DrawTools />
            </>
          ) : (
            <p className="text-[12px] text-fg-dim">
              Current line kept as stored: {formatKm(lineLength(geometry))}
              {existing?.waypoints ? `, drawn through ${existing.waypoints.length} points` : ""}.
            </p>
          )}
          {duplicates.length > 0 && (
            <p className="mt-2 flex gap-1.5 border border-amber/40 bg-amber/5 px-2.5 py-2 text-[12px] text-fg-dim">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber" />
              <span>
                Most of this line overlaps {duplicates.map((d) => `“${data.variants.find((v) => v.id === d)?.name}”`).join(", ")}. That&apos;s fine if it&apos;s a
                different route — nothing is merged.
              </span>
            </p>
          )}
        </div>
        <ErrorNote text={err} />
      </div>
      <Footer busy={busy} onSave={save} onDelete={existing ? del : undefined} saveLabel={existing ? "Save route" : "Create route"} />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// History + undo

const TABLE_LABEL = { locations: "road", variants: "route", pois: "spot", photos: "photo" } as const;
const ACTION_LABEL = { insert: "added", update: "edited", delete: "deleted", restore: "restored" } as const;

export function HistoryPanel() {
  const [list, setList] = useState<EditEntry[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    setErr("");
    try {
      setList(await editor!.listEdits(80));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Loading history failed");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const undo = async (e: EditEntry) => {
    const what = `${TABLE_LABEL[e.table]} “${e.label}”`;
    const verb = e.action === "insert" ? `remove the ${what} that was added` : `put the ${what} back as it was before this ${ACTION_LABEL[e.action].replace("ed", "")}`;
    if (!window.confirm(`Undo: ${verb}?`)) return;
    setBusy(e.id);
    try {
      await runEdit((ed) => ed.restoreEdit(e.id), "Restored.");
      await load();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Undo failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PanelShell label="Edit history">
      <Header kicker="Shared atlas" title="History" />
      <p className="flex gap-2 border-b border-line px-3 py-2 text-[11.5px] leading-snug text-fg-dim">
        <HistoryIcon className="mt-0.5 size-3.5 shrink-0" />
        Every change by any member is recorded. “Undo” puts that item back to how it was before the change (deleted roads come back route by route).
      </p>
      <div className="om-scroll min-h-0 flex-1 overflow-y-auto">
        {err && (
          <div className="p-3">
            <ErrorNote text={err} />
          </div>
        )}
        {!list && !err && (
          <p className="flex items-center gap-2 px-3 py-6 text-[12px] text-fg-faint">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </p>
        )}
        {list?.length === 0 && <p className="px-3 py-6 text-[12px] text-fg-faint">No edits yet.</p>}
        <ul>
          {list?.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-b border-line/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-fg">
                  {e.actor} {ACTION_LABEL[e.action]} {TABLE_LABEL[e.table]} “{e.label}”
                </div>
                <div className="text-[11px] text-fg-faint">{new Date(e.at).toLocaleString()}</div>
              </div>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => undo(e)} title="Undo this change">
                {busy === e.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Undo
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </PanelShell>
  );
}
