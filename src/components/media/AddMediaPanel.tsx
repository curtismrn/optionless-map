"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Upload, ImagePlus, Info } from "lucide-react";
import { app, useApp, addMedia, openDetail, toast, type MediaTarget } from "@/lib/store";
import type { MediaInput } from "@/lib/repository/types";
import { PanelShell } from "@/components/PanelShell";
import { Button, Field, inputCls, cn } from "@/components/ui";

const LICENSES: MediaInput["license"][] = ["CC BY 4.0", "CC BY-SA 4.0", "CC0", "All rights reserved"];

/**
 * Adding media to an existing road is deliberately light: pick a file, say
 * where it was taken, confirm rights. No review queue — media publish at once
 * and can be reported. (Prototype: stored in this browser only.)
 */
export function AddMediaPanel({ target }: { target: MediaTarget }) {
  const data = useApp((s) => s.data)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [attach, setAttach] = useState<string>(`${target.type}:${target.id}`);
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [license, setLicense] = useState<MediaInput["license"]>("CC BY 4.0");
  const [capturedAt, setCapturedAt] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Road record + its variants are all valid attachment points.
  const locationId =
    target.type === "location" ? target.id : target.type === "variant" ? data.variants.find((v) => v.id === target.id)?.locationId : undefined;
  const loc = data.locations.find((l) => l.id === locationId);
  const options = useMemo(() => {
    if (!loc) return [{ value: `${target.type}:${target.id}`, label: "Selected point" }];
    return [
      { value: `location:${loc.id}`, label: `${loc.name} — whole road / area` },
      ...data.variants
        .filter((v) => v.locationId === loc.id && v.publication === "published")
        .map((v) => ({ value: `variant:${v.id}`, label: v.name })),
    ];
  }, [data.variants, loc, target]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = (f: File | undefined) => {
    setErr("");
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("Choose a photo (video is not supported yet).");
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file) return setErr("Choose a photo first.");
    if (!rights) return setErr("Please confirm you can share this file.");
    const [type, id] = attach.split(":") as [MediaTarget["type"], string];
    setBusy(true);
    setErr("");
    try {
      await addMedia({ attachedTo: { type, id }, file, caption, credit, license, capturedAt: capturedAt || undefined });
      toast("Photo added — visible in this browser only (not shared with others yet).");
      if (type !== "poi") openDetail({ type, id }, "media");
      else app.set({ contribute: null });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not process this file.");
    } finally {
      setBusy(false);
    }
  };

  const isVideo = file?.type.startsWith("video/");

  return (
    <PanelShell label="Add a photo">
      <div className="flex items-start justify-between border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <div className="om-label text-ice">Add a photo</div>
          <h2 className="truncate font-display text-[22px] leading-tight font-semibold tracking-[0.03em] text-white">{loc?.name ?? "Point"}</h2>
        </div>
        <button onClick={() => app.set({ contribute: null })} className="p-1 text-fg-faint hover:text-fg" aria-label="Cancel">
          <X className="size-4" />
        </button>
      </div>

      <div className="om-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn("relative border border-dashed transition-colors", dragOver ? "border-ice bg-ice/5" : "border-line-strong")}
        >
          {preview ? (
            <div className="relative aspect-video bg-black">
              {isVideo ? (
                <video src={preview} controls muted playsInline className="size-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Selected file preview" className="size-full object-contain" />
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute top-2 right-2 bg-black/70 px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-white hover:bg-black"
              >
                CHANGE
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 px-4 py-8 text-center">
              <ImagePlus className="size-6 text-fg-dim" />
              <span className="text-[13px] text-fg">Choose a photo</span>
              <span className="text-[11px] text-fg-faint">or drop it here · JPEG, PNG, WebP</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <Field label="Where on this road?">
          <select className={inputCls} value={attach} onChange={(e) => setAttach(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Caption" hint="e.g. “Hairpin 7 at sunrise, uphill”">
          <textarea rows={2} maxLength={500} className={inputCls} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Credit as">
            <input className={inputCls} value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Your name or handle" maxLength={80} />
          </Field>
          <Field label="Taken on">
            <input type="date" className={inputCls} value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </Field>
        </div>
        <Field label="Licence">
          <select className={inputCls} value={license} onChange={(e) => setLicense(e.target.value as MediaInput["license"])}>
            {LICENSES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-start gap-2 text-[12px] text-fg-dim">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 accent-[#8fd6ea]" />
          <span>I took this photo or have the right to share it.</span>
        </label>
        <p className="flex gap-1.5 text-[11px] leading-snug text-fg-faint">
          <Info className="mt-0.5 size-3 shrink-0" />
Photos are re-encoded on your device (removes EXIF and GPS data). They are stored in this browser only — your friends won&apos;t see them until a shared backend exists.
        </p>
        {err && <p className="text-[11.5px] text-signal">{err}</p>}
      </div>

      <div className="flex gap-2 border-t border-line p-2">
        <Button variant="ghost" onClick={() => app.set({ contribute: null })}>
          Cancel
        </Button>
        <div className="flex-1" />
        <Button variant="solid" disabled={busy || !file} onClick={submit}>
          <Upload className="size-3.5" /> {busy ? "Processing…" : "Add photo"}
        </Button>
      </div>
    </PanelShell>
  );
}
