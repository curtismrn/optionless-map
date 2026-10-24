"use client";

// Design exploration switcher (design/explorations branch only).
// Also reachable with ?look=current|roadbook|nuit.

import { useEffect } from "react";
import { app, useApp } from "@/lib/store";
import { LOOKS, initialLook, persistLook } from "@/lib/look";
import { cn } from "@/components/ui";

export function LookSwitcher() {
  const look = useApp((s) => s.look);
  useEffect(() => {
    const l = initialLook();
    persistLook(l);
    app.set({ look: l });
  }, []);
  return (
    <div className="pointer-events-auto absolute bottom-[38px] left-1/2 z-[60] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-line-strong bg-panel/95 p-1 shadow-lg backdrop-blur [scrollbar-width:none]">
      <span className="px-2 text-[11px] text-fg-faint">Look</span>
      {LOOKS.map((l) => (
        <button
          key={l.id}
          onClick={() => {
            persistLook(l.id);
            app.set({ look: l.id });
          }}
          className={cn(
            "h-7 shrink-0 whitespace-nowrap rounded-full px-3 text-[12px] transition-colors",
            look === l.id ? "bg-ice text-ink" : "text-fg-dim hover:text-fg",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
