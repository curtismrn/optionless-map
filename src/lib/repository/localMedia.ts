"use client";

// Local media store (IndexedDB). Photos and clips added in the prototype are
// kept in THIS browser only — nobody else sees them, and clearing site data
// deletes them. A production backend would upload to object storage (e.g.
// Supabase Storage) behind auth, rate limits and moderation.
//
// Photos are re-encoded through a canvas, which drops EXIF metadata including
// GPS position. Video metadata cannot be stripped client-side; the UI says so.

import type { MediaItem } from "@/lib/domain/schema";

const DB = "optionless-demo";
const STORE = "media";

type Row = { meta: MediaItem; blob: Blob; thumb: Blob };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "meta.id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const urlCache = new Map<string, { url: string; thumbUrl: string }>();

export async function listLocalMedia(): Promise<MediaItem[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const rows = await tx<Row[]>("readonly", (s) => s.getAll() as IDBRequest<Row[]>);
    return rows.map((r) => {
      let u = urlCache.get(r.meta.id);
      if (!u) {
        u = { url: URL.createObjectURL(r.blob), thumbUrl: URL.createObjectURL(r.thumb) };
        urlCache.set(r.meta.id, u);
      }
      return { ...r.meta, ...u };
    });
  } catch {
    return [];
  }
}

export async function putLocalMedia(meta: MediaItem, blob: Blob, thumb: Blob) {
  await tx("readwrite", (s) => s.put({ meta, blob, thumb } satisfies Row));
}

export async function updateLocalMedia(id: string, patch: Partial<MediaItem>) {
  const row = await tx<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
  if (row) await tx("readwrite", (s) => s.put({ ...row, meta: { ...row.meta, ...patch } }));
}

export async function deleteLocalMedia(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  const u = urlCache.get(id);
  if (u) {
    URL.revokeObjectURL(u.url);
    URL.revokeObjectURL(u.thumbUrl);
    urlCache.delete(id);
  }
}

export async function clearLocalMedia() {
  await tx("readwrite", (s) => s.clear());
  urlCache.forEach((u) => (URL.revokeObjectURL(u.url), URL.revokeObjectURL(u.thumbUrl)));
  urlCache.clear();
}

// ---- file processing -------------------------------------------------------

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_CLIP_BYTES = 80 * 1024 * 1024;
export const MAX_CLIP_SECONDS = 90;

function canvasBlob(src: CanvasImageSource, w: number, h: number, maxSide: number, quality: number): Promise<Blob> {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Encoding failed"))), "image/jpeg", quality));
}

export type ProcessedMedia = { kind: "photo" | "clip"; blob: Blob; thumb: Blob; width: number; height: number; durationS?: number };

export async function processFile(file: File): Promise<ProcessedMedia> {
  if (file.type.startsWith("image/")) {
    if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo is larger than 25 MB.");
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    // Re-encoding drops EXIF (including GPS) — intentional.
    const blob = await canvasBlob(bmp, bmp.width, bmp.height, 2048, 0.86);
    const thumb = await canvasBlob(bmp, bmp.width, bmp.height, 500, 0.8);
    const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    return { kind: "photo", blob, thumb, width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) };
  }
  if (file.type.startsWith("video/")) {
    if (file.size > MAX_CLIP_BYTES) throw new Error("Clip is larger than 80 MB.");
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement("video");
      v.muted = true;
      v.preload = "auto";
      v.src = url;
      await new Promise<void>((res, rej) => {
        v.onloadedmetadata = () => res();
        v.onerror = () => rej(new Error("This browser cannot read that video format (try MP4/H.264 or WebM)."));
      });
      if (v.duration > MAX_CLIP_SECONDS) throw new Error(`Clips are limited to ${MAX_CLIP_SECONDS} s (this one is ${Math.round(v.duration)} s).`);
      v.currentTime = Math.min(1, v.duration / 2);
      await new Promise<void>((res) => (v.onseeked = () => res()));
      const thumb = await canvasBlob(v, v.videoWidth, v.videoHeight, 500, 0.8);
      return { kind: "clip", blob: file, thumb, width: v.videoWidth, height: v.videoHeight, durationS: v.duration };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  throw new Error("Unsupported file — choose a photo (JPEG, PNG, WebP, HEIC where supported) or a video clip.");
}
