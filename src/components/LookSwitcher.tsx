"use client";

// Design exploration switcher (design/explorations branch only).
// Also reachable with ?look=current|roadbook|nuit.

import { useEffect, useState } from "react";
import { app, useApp, toast } from "@/lib/store";
import { DEFAULT_LOOK, LOOKS, initialLook, persistLook, showLookSwitcher } from "@/lib/look";

/** Easter egg: flip between the shipped look and the retro Japanese car-nav look. */
export function toggleSecretGps() {
  const next = app.get().look === "jgps" ? DEFAULT_LOOK : "jgps";
  persistLook(next);
  app.set({ look: next });
  toast(next === "jgps" ? "ナビ モード ON — retro GPS unlocked" : "Back to the atlas");
}

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
import { cn } from "@/components/ui";

export function LookSwitcher() {
  const look = useApp((s) => s.look);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const l = initialLook();
    persistLook(l);
    app.set({ look: l });
    setVisible(showLookSwitcher());
    // Konami code anywhere (except while typing)
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input,textarea,select")) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = k === KONAMI[pos] ? pos + 1 : k === KONAMI[0] ? 1 : 0;
      if (pos === KONAMI.length) {
        pos = 0;
        toggleSecretGps();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!visible) return null;
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
