"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Flag, ExternalLink, Trash2, MapPin, Pencil, Loader2 } from "lucide-react";
import { app, useApp, removeOwnMedia, openDetail, useCanEdit, runEdit } from "@/lib/store";
import { SHARED_MODE } from "@/lib/supabase";
import type { MediaItem } from "@/lib/domain/schema";
import { focusLocation, focusVariant } from "@/components/map/controller";
import { cn } from "@/components/ui";

export function Lightbox() {
  const lb = useApp((s) => s.lightbox);
  const data = useApp((s) => s.data);
  const touchX = useRef<number | null>(null);

  const items = lb && data ? lb.ids.map((id) => data.media.find((m) => m.id === id)).filter((m) => !!m) : [];
  const index = lb ? Math.min(lb.index, items.length - 1) : 0;
  const m = items[index];

  const go = (d: number) => {
    const s = app.get().lightbox;
    if (!s) return;
    app.set({ lightbox: { ...s, index: (s.index + d + s.ids.length) % s.ids.length } });
  };

  useEffect(() => {
    if (!lb) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.set({ lightbox: null });
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lb]);

  if (!lb || !m || !data) return null;

  const target =
    m.attachedTo.type === "location"
      ? data.locations.find((l) => l.id === m.attachedTo.id)?.name
      : m.attachedTo.type === "variant"
        ? (() => {
            const v = data.variants.find((x) => x.id === m.attachedTo.id);
            const l = data.locations.find((x) => x.id === v?.locationId);
            return v ? `${l?.name ?? ""} · ${v.name}` : undefined;
          })()
        : data.pois.find((p) => p.id === m.attachedTo.id)?.name;

  const showOnMap = () => {
    app.set({ lightbox: null });
    if (m.attachedTo.type === "variant") {
      openDetail({ type: "variant", id: m.attachedTo.id }, "media");
      focusVariant(m.attachedTo.id);
    } else if (m.attachedTo.type === "location") {
      openDetail({ type: "location", id: m.attachedTo.id }, "media");
      focusLocation(m.attachedTo.id);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      className="fixed inset-0 z-[60] flex flex-col bg-[#050607] animate-in"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x0 = touchX.current;
        const x1 = e.changedTouches[0]?.clientX;
        if (x0 !== null && x1 !== undefined && Math.abs(x1 - x0) > 50) go(x1 < x0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 px-3">
        <span className="font-mono text-[10px] tracking-[0.12em] text-fg-dim tabular-nums">
          {index + 1} / {items.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{target}</span>
        <button onClick={() => app.set({ lightbox: null })} className="grid size-9 place-items-center text-fg-dim hover:text-white" aria-label="Close viewer">
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {m.kind === "clip" ? (
          <video key={m.id} src={m.url} poster={m.thumbUrl} controls playsInline className="size-full object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={m.url ?? m.thumbUrl} alt={m.caption || m.title} className="max-h-full max-w-full object-contain" />
        )}
        {items.length > 1 && (
          <>
            <button onClick={() => go(-1)} className="absolute top-1/2 left-2 hidden size-11 -translate-y-1/2 place-items-center bg-black/50 text-white hover:bg-black/80 sm:grid" aria-label="Previous">
              <ChevronLeft className="size-6" />
            </button>
            <button onClick={() => go(1)} className="absolute top-1/2 right-2 hidden size-11 -translate-y-1/2 place-items-center bg-black/50 text-white hover:bg-black/80 sm:grid" aria-label="Next">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-line/60 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {m.caption && <p className="mb-1.5 line-clamp-3 text-[13px] leading-snug text-fg">{m.caption}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10.5px] text-fg-dim">
          <span>
            {m.kind === "clip" ? "Clip" : "Photo"} by <span className="text-fg">{m.credit}</span>
          </span>
          {m.licenseUrl ? (
            <a href={m.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-fg">
              {m.license}
            </a>
          ) : (
            <span>{m.license}</span>
          )}
          {m.capturedAt && <span>{m.capturedAt}</span>}
          <span className={cn(m.source === "local" ? "text-community" : "text-fg-faint")}>
            {m.source === "commons" ? "via Wikimedia Commons" : "Stored in this browser only"}
          </span>
          <span className="flex-1" />
          {m.sourceUrl && (
            <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-fg">
              <ExternalLink className="size-3" /> Source
            </a>
          )}
          {lb.ids.length > 0 && m.attachedTo.type !== "poi" && (
            <button onClick={showOnMap} className="flex items-center gap-1 hover:text-fg">
              <MapPin className="size-3" /> Place
            </button>
          )}
          {SHARED_MODE ? (
            <MemberPhotoActions m={m} />
          ) : m.source === "local" ? (
            <button
              onClick={() => window.confirm("Delete this photo/clip from this browser?") && void removeOwnMedia(m.id)}
              className="flex items-center gap-1 text-signal/80 hover:text-signal"
            >
              <Trash2 className="size-3" /> Delete
            </button>
          ) : m.status === "reported" ? (
            <span className="flex items-center gap-1 text-amber">
              <Flag className="size-3" /> Reported
            </span>
          ) : (
            <button
              onClick={() => app.set({ lightbox: null, contribute: { kind: "report", subject: { type: "media", id: m.id } } })}
              className="flex items-center gap-1 hover:text-amber"
            >
              <Flag className="size-3" /> Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shared mode: any member can fix a caption, move a photo to another route of the road, or delete it. */
function MemberPhotoActions({ m }: { m: MediaItem }) {
  const can = useCanEdit();
  const data = useApp((s) => s.data)!;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ caption: m.caption, credit: m.credit, attach: `${m.attachedTo.type}:${m.attachedTo.id}` });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setEditing(false);
    setErr("");
    setF({ caption: m.caption, credit: m.credit, attach: `${m.attachedTo.type}:${m.attachedTo.id}` });
  }, [m]);
  if (!can) return null;

  const locId = m.attachedTo.type === "location" ? m.attachedTo.id : data.variants.find((v) => v.id === m.attachedTo.id)?.locationId;
  const loc = data.locations.find((l) => l.id === locId);
  const targets = loc
    ? [{ v: `location:${loc.id}`, l: `${loc.name} — whole place` }, ...data.variants.filter((v) => v.locationId === loc.id).map((v) => ({ v: `variant:${v.id}`, l: v.name }))]
    : [{ v: f.attach, l: "Current place" }];

  const save = async () => {
    const [type, id] = f.attach.split(":") as ["location" | "variant" | "poi", string];
    setBusy(true);
    setErr("");
    try {
      await runEdit((e) => e.updatePhoto(m.id, { caption: f.caption, credit: f.credit, license: m.license, capturedAt: m.capturedAt ?? null, attachedTo: { type, id } }), "Photo saved.");
      setEditing(false);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Saving failed");
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!window.confirm("Remove this photo from the atlas for everyone? (You can undo it from History.)")) return;
    setBusy(true);
    try {
      await removeOwnMedia(m.id);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Deleting failed");
      setBusy(false);
    }
  };

  if (!editing)
    return (
      <>
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 hover:text-fg">
          <Pencil className="size-3" /> Edit
        </button>
        <button onClick={del} disabled={busy} className="flex items-center gap-1 text-signal/80 hover:text-signal">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Delete
        </button>
        {err && <span className="basis-full text-signal">{err}</span>}
      </>
    );
  return (
    <div className="basis-full space-y-2 pt-2 font-sans">
      <textarea rows={2} maxLength={500} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} placeholder="Caption" aria-label="Caption" className="w-full border border-line bg-ink px-2 py-1.5 text-[13px] text-fg" />
      <div className="flex flex-wrap gap-2">
        <input value={f.credit} maxLength={120} onChange={(e) => setF({ ...f, credit: e.target.value })} placeholder="Credit" aria-label="Credit" className="min-w-0 flex-1 border border-line bg-ink px-2 py-1.5 text-[13px] text-fg" />
        <select value={f.attach} onChange={(e) => setF({ ...f, attach: e.target.value })} aria-label="Belongs to" className="min-w-0 flex-1 border border-line bg-ink px-2 py-1.5 text-[13px] text-fg">
          {targets.map((t) => (
            <option key={t.v} value={t.v}>
              {t.l}
            </option>
          ))}
        </select>
      </div>
      {err && <p className="text-[12px] text-signal">{err}</p>}
      <div className="flex gap-2">
        <button onClick={() => setEditing(false)} className="h-8 border border-line px-3 text-[12px] text-fg-dim hover:text-fg">Cancel</button>
        <button onClick={save} disabled={busy} className="flex h-8 items-center gap-1 border border-ice bg-ice px-3 text-[12px] text-ink">
          {busy && <Loader2 className="size-3 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}
