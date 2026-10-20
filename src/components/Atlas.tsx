"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { app, loadData, useApp } from "@/lib/store";
import { TopBar } from "@/components/TopBar";
import { ExplorePanel } from "@/components/ExplorePanel";
import { DetailPanel } from "@/components/DetailPanel";
import { ContributePanel } from "@/components/ContributePanel";
import { StatusBar, MapControls, HoverCard, Toast, MapError, RoutePicker, SelectionChip } from "@/components/Chrome";
import { Lightbox } from "@/components/media/Lightbox";
import { SnapEngine } from "@/components/SnapEngine";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center">
      <span className="font-mono text-[10px] tracking-[0.2em] text-fg-faint">INITIALISING MAP…</span>
    </div>
  ),
});

export function Atlas() {
  const contribute = useApp((s) => !!s.contribute);
  const rightOpen = useApp((s) => !!s.selection || !!s.contribute);

  useEffect(() => {
    void loadData();
    // Compact layout on phones: start with the explorer closed.
    if (window.innerWidth < 768) app.set({ exploreOpen: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const s = app.get();
      if (s.lightbox) return; // the viewer handles its own Escape
      if (s.pick) app.set({ pick: null });
      else if (s.draw.active) app.set({ draw: { ...s.draw, active: false } });
      else if (s.selection) app.set({ selection: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink">
      <div className="absolute inset-0">
        <MapView />
        <MapError />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        {/* On phones only one sheet is shown at a time. */}
        <div className={rightOpen ? "max-md:hidden" : undefined}>
          <ExplorePanel />
        </div>
        {contribute ? <ContributePanel /> : <DetailPanel />}
        <SelectionChip />
        <MapControls />
        <StatusBar />
      </div>
      <HoverCard />
      <RoutePicker />
      <Toast />
      <Lightbox />
      <SnapEngine />
    </main>
  );
}
