"use client";

// Keeps draw.coords in sync with draw.waypoints: routed along OSM roads when
// "follow roads" is on, straight segments otherwise (or when routing fails —
// then flagged as unsnapped so the UI never passes it off as a road).

import { useEffect } from "react";
import { app } from "@/lib/store";
import { snapToRoads } from "@/lib/routing";
import type { Coord } from "@/lib/geo";

export function SnapEngine() {
  useEffect(() => {
    let lastWaypoints: Coord[] | null = null;
    let lastSnap: boolean | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | null = null;

    const run = () => {
      const d = app.get().draw;
      if (d.waypoints === lastWaypoints && d.snap === lastSnap) return;
      lastWaypoints = d.waypoints;
      lastSnap = d.snap;
      clearTimeout(timer);
      ctrl?.abort();

      if (d.purpose === "poi" || !d.snap || d.waypoints.length < 2) {
        app.set({
          draw: { ...d, coords: d.waypoints, snapStatus: d.waypoints.length < 2 ? "idle" : "unsnapped", snapError: null },
        });
        return;
      }
      app.set({ draw: { ...d, snapStatus: "routing" } });
      timer = setTimeout(async () => {
        ctrl = new AbortController();
        const wps = d.waypoints;
        const r = await snapToRoads(wps, ctrl.signal);
        const now = app.get().draw;
        if (now.waypoints !== wps || !now.snap) return; // stale
        if (r.ok) app.set({ draw: { ...now, coords: r.coordinates, snapStatus: "snapped", snapError: null } });
        else if (r.error !== "aborted") app.set({ draw: { ...now, coords: wps, snapStatus: "unsnapped", snapError: r.error } });
      }, 280);
    };

    const unsub = app.subscribe(run);
    run();
    return () => {
      unsub();
      clearTimeout(timer);
      ctrl?.abort();
    };
  }, []);
  return null;
}
