"use client";

import { Play, Camera, Flag } from "lucide-react";
import type { MediaItem } from "@/lib/domain/schema";
import { app } from "@/lib/store";
import { cn } from "@/components/ui";

export function openLightbox(items: MediaItem[], index: number) {
  app.set({ lightbox: { ids: items.map((m) => m.id), index } });
}

function Thumb({ m, onClick, className, label }: { m: MediaItem; onClick: () => void; className?: string; label?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn("group relative overflow-hidden bg-panel-3 text-left", className)}
      aria-label={`View photo: ${m.caption || m.title}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={m.thumbUrl ?? m.url}
        alt={m.caption || m.title}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-80" />
      {m.kind === "clip" && (
        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-white">
          <Play className="size-2.5 fill-white" /> CLIP
        </span>
      )}
      {m.source === "local" && (
        <span className="absolute top-1.5 right-1.5 bg-community/85 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-ink">YOURS</span>
      )}
      {m.status === "reported" && (
        <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 bg-black/70 px-1 py-0.5 font-mono text-[9px] text-amber">
          <Flag className="size-2.5" /> REPORTED
        </span>
      )}
      {label && <span className="absolute bottom-1.5 left-1.5 max-w-[85%] truncate font-mono text-[9px] tracking-[0.08em] text-white/85 uppercase">{label}</span>}
    </button>
  );
}

export function MediaGrid({ items, labelFor }: { items: MediaItem[]; labelFor?: (m: MediaItem) => string | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {items.map((m, i) => (
        <Thumb
          key={m.id}
          m={m}
          onClick={() => openLightbox(items, i)}
          className={cn("aspect-[4/3]", i === 0 && items.length > 2 && "col-span-2 row-span-2 aspect-auto")}
          label={labelFor?.(m)}
        />
      ))}
    </div>
  );
}

export function EmptyMedia({ onAdd, text }: { onAdd: () => void; text?: string }) {
  return (
    <button
      onClick={onAdd}
      className="flex w-full items-center gap-3 border border-dashed border-line-strong px-3 py-4 text-left hover:border-ice/60"
    >
      <span className="grid size-10 shrink-0 place-items-center border border-line text-fg-dim">
        <Camera className="size-4" />
      </span>
      <span>
        <span className="block text-[13px] text-fg">{text ?? "No photos yet"}</span>
        <span className="block text-[11.5px] text-fg-faint">Been there? Add the first photo.</span>
      </span>
    </button>
  );
}
