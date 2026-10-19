"use client";

import { useRef } from "react";
import { app, useApp } from "@/lib/store";
import { cn } from "@/components/ui";

const ORDER = ["peek", "half", "full"] as const;

/**
 * Right-hand panel on desktop; draggable bottom sheet on phones so the map
 * stays visible above it (peek → half → full).
 */
export function PanelShell({ children, label }: { children: React.ReactNode; label: string }) {
  const sheet = useApp((s) => s.sheet);
  const startY = useRef<number | null>(null);

  const step = (dir: 1 | -1) => {
    const i = ORDER.indexOf(app.get().sheet);
    app.set({ sheet: ORDER[Math.max(0, Math.min(2, i + dir))]! });
  };

  return (
    <aside
      aria-label={label}
      className={cn(
        "om-panel om-ticks pointer-events-auto absolute z-20 flex animate-sheet flex-col",
        // phones: bottom sheet
        "inset-x-0 bottom-[30px] transition-[height] duration-200 ease-out",
        sheet === "peek" && "h-[148px]",
        sheet === "half" && "h-[56dvh]",
        sheet === "full" && "h-[calc(100dvh-86px)]",
        // desktop: right column
        "md:inset-x-auto md:top-[68px] md:right-3 md:bottom-[42px] md:h-auto md:w-[440px] md:transition-none",
      )}
    >
      <button
        aria-label={`Resize panel (currently ${sheet})`}
        className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center md:hidden"
        onPointerDown={(e) => {
          startY.current = e.clientY;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const y0 = startY.current;
          startY.current = null;
          if (y0 === null) return;
          const dy = e.clientY - y0;
          if (Math.abs(dy) < 8) {
            // tap cycles peek → half → full → half
            const s = app.get().sheet;
            app.set({ sheet: s === "full" ? "half" : s === "half" ? "full" : "half" });
          } else step(dy < 0 ? 1 : -1);
        }}
      >
        <span className="h-1 w-10 rounded-full bg-line-strong" />
      </button>
      {children}
    </aside>
  );
}
