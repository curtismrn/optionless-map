"use client";

// Create / edit / delete a spot (shared mode, members only). A spot is a point
// on the map — a drift corner, a meet-up car park — where members post photos.
// It can belong to a road (or one of its routes), so it shows on that road's
// page, or stand on its own.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, Crosshair, Loader2, MapPin, Save, Trash2 } from "lucide-react";
import { app, useApp, runEdit, openDetail, EMPTY_DRAW } from "@/lib/store";
import { POI_CATEGORIES, POI_LABEL, PoiInput, type PoiCategory } from "@/lib/domain/schema";
import { distanceToLine, type Coord } from "@/lib/geo";
import { focusPoint, getMap } from "@/components/map/controller";
import { PanelShell } from "@/components/PanelShell";
import { Header, closeContribute } from "@/components/ContributePanel";
import { Button, Field, inputCls } from "@/components/ui";

/** Closest route to a point (and its road), within maxM metres. */
function nearestRoute(data: NonNullable<ReturnType<typeof app.get>["data"]>, p: Coord, maxM = 300) {
  let best: { variantId: string; locationId: string; d: number } | null = null;
  for (const v of data.variants) {
    if (!v.locationId) continue; // spots attach to routes that belong to a road
    const d = distanceToLine(p, v.geometry.coordinates as Coord[]);
    if (d <= maxM && (!best || d < best.d)) best = { variantId: v.id, locationId: v.locationId, d };
  }
  return best;
}

export function EditSpotPanel({ id, parent }: { id?: string; parent?: { type: "location" | "variant"; id: string } }) {
  const data = useApp((s) => s.data)!;
  const draw = useApp((s) => s.draw);
  const existing = id ? data.pois.find((p) => p.id === id) : undefined;

  const initialRoad = (() => {
    const pr = existing?.parent ?? parent;
    if (!pr) return "";
    return pr.type === "location" ? pr.id : (data.variants.find((v) => v.id === pr.id)?.locationId ?? "");
  })();
  const [roadId, setRoadId] = useState(initialRoad);
  const [routeId, setRouteId] = useState<string>((existing?.parent ?? parent)?.type === "variant" ? (existing?.parent ?? parent)!.id : "");
  const [f, setF] = useState({
    name: existing?.name ?? "",
    category: (existing?.category ?? "drift") as PoiCategory,
    description: existing?.description ?? "",
    communityLabel: existing?.communityLabel ?? false,
  });
  const [point, setPoint] = useState<Coord | null>((existing?.coordinates as Coord) ?? null);
  const [placing, setPlacing] = useState(!existing);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const startPlacing = () => {
    setPlacing(true);
    app.set({ draw: { ...EMPTY_DRAW, active: true, purpose: "poi", snap: false, waypoints: point ? [point] : [], coords: point ? [point] : [] } });
  };
  useEffect(() => {
    if (!existing) startPlacing();
    else if (existing) focusPoint(existing.coordinates as Coord, Math.max(getMap()?.getZoom() ?? 14, 14));
    return () => app.set({ draw: EMPTY_DRAW });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a click on the map places the spot; a new spot right on a road is attached to it,
  // anywhere else it stands alone (both can be changed below)
  useEffect(() => {
    if (!placing || !draw.waypoints[0]) return;
    const p = draw.waypoints[0];
    setPoint(p);
    if (!existing && !parent) {
      const n = nearestRoute(data, p);
      setRoadId(n?.locationId ?? "");
      setRouteId(n && n.d <= 150 ? n.variantId : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw.waypoints, placing]);

  const routes = useMemo(() => data.variants.filter((v) => v.locationId === roadId), [data.variants, roadId]);

  const save = async () => {
    setErr("");
    if (!point) return setErr("Click the map to place the spot.");
    const parsed = PoiInput.safeParse({
      ...f,
      coordinates: point,
      parent: routeId ? { type: "variant", id: routeId } : roadId ? { type: "location", id: roadId } : null,
    });
    if (!parsed.success) return setErr(parsed.error.issues.map((i) => i.message).join(" · "));
    setBusy("Saving…");
    try {
      const newId = await runEdit((e) => e.savePoi(parsed.data, existing?.id), existing ? "Spot saved." : "Spot added — post the first photo!");
      app.set({ draw: EMPTY_DRAW });
      openDetail({ type: "poi", id: newId });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Saving failed");
    } finally {
      setBusy(null);
    }
  };

  const del = async () => {
    if (!existing) return;
    const n = data.media.filter((m) => m.attachedTo.type === "poi" && m.attachedTo.id === existing.id).length;
    if (!window.confirm(`Delete the spot “${existing.name}”${n ? ` and its ${n} photo${n > 1 ? "s" : ""}` : ""} for everyone?\n\nYou can undo this from History.`)) return;
    setBusy("Deleting…");
    try {
      await runEdit((e) => e.deletePoi(existing.id), "Spot deleted — undo from History if needed.");
      app.set({ draw: EMPTY_DRAW });
      const pr = existing.parent;
      if (pr) openDetail({ type: pr.type, id: pr.id });
      else app.set({ selection: null, contribute: null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deleting failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PanelShell label={existing ? "Edit spot" : "New spot"}>
      <Header kicker={existing ? "Edit spot · shared with all members" : "New spot · shared with all members"} title={existing?.name ?? "New spot"} />
      <div className="om-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <div className="flex items-center gap-2 border border-line bg-ink px-2.5 py-2 text-[12.5px] text-fg-dim">
          <MapPin className="size-4 shrink-0 text-ice" />
          <span className="min-w-0 flex-1">
            {placing && !point
              ? "Click the map where the spot is."
              : point
                ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}${placing ? " — click again to move it" : ""}`
                : "No position yet"}
          </span>
          {!placing && (
            <Button size="sm" onClick={startPlacing}>
              <Crosshair className="size-3" /> Move
            </Button>
          )}
        </div>
        <Field label="Name" hint="What you call it, e.g. “Le gauche du lavoir”">
          <input className={inputCls} value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PoiCategory })}>
            {POI_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {POI_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" hint="Optional">
          <textarea rows={3} className={inputCls} value={f.description} maxLength={600} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Place">
            <select
              className={inputCls}
              value={roadId}
              onChange={(e) => {
                setRoadId(e.target.value);
                setRouteId("");
              }}
            >
              <option value="">None (standalone)</option>
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="On route">
            <select className={inputCls} value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={!roadId}>
              <option value="">Whole place</option>
              {routes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-start gap-2 text-[12.5px] text-fg-dim">
          <input type="checkbox" checked={f.communityLabel} onChange={(e) => setF({ ...f, communityLabel: e.target.checked })} className="mt-0.5" />
          It&apos;s our nickname for the place, not its official name
        </label>
        {existing && (
          <Button onClick={() => app.set({ contribute: { kind: "add_media", target: { type: "poi", id: existing.id } } })}>
            <Camera className="size-3.5" /> Add a photo to this spot
          </Button>
        )}
        {err && (
          <p role="alert" className="flex gap-1.5 border border-signal/40 bg-signal/5 px-2.5 py-2 text-[12px] text-signal">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {err}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line p-2">
        {existing ? (
          <Button variant="danger" disabled={!!busy} onClick={del}>
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
        <Button variant="solid" disabled={!!busy} onClick={save}>
          <Save className="size-3.5" /> {existing ? "Save spot" : "Add spot"}
        </Button>
      </div>
    </PanelShell>
  );
}
