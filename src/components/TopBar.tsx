"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Search, X, UserRound, Inbox, Camera, Spline, ChevronDown } from "lucide-react";
import { app, useApp } from "@/lib/store";
import { STYLE_META, type StyleId } from "@/components/map/styles";
import { cn } from "@/components/ui";

export function Wordmark() {
  return (
    <div className="flex select-none items-baseline gap-1.5 pr-1">
      <span className="font-display text-[22px] leading-none tracking-[0.04em] text-fg" style={{ fontWeight: 700 }}>
        OPTIONLESS
      </span>
      <span className="font-display text-[22px] leading-none tracking-[0.04em] text-ice" style={{ fontWeight: 500 }}>
        MAP
      </span>
      <span className="ml-1 hidden font-mono text-[9px] tracking-[0.14em] text-fg-faint lg:inline">ATLAS · PROTO 0.1</span>
    </div>
  );
}

export function StyleSelector({ className }: { className?: string }) {
  const current = useApp((s) => s.style);
  return (
    <div role="radiogroup" aria-label="Map style" className={cn("flex border border-line bg-panel/90", className)}>
      {(Object.keys(STYLE_META) as StyleId[]).map((id) => {
        const m = STYLE_META[id];
        const active = id === current;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            disabled={!m.available}
            onClick={() => app.set({ style: id })}
            title={m.available ? `${m.label} — ${m.note}` : `${m.label} unavailable — ${m.unavailableReason}`}
            className={cn(
              "relative h-8 px-2.5 font-mono text-[10px] tracking-[0.12em] transition-colors duration-150",
              active ? "bg-ice/12 text-ice" : "text-fg-dim hover:text-fg",
              !m.available && "cursor-not-allowed text-fg-faint/60 line-through decoration-fg-faint/60 hover:text-fg-faint/60",
            )}
          >
            {m.label.toUpperCase()}
            {active && <span className="absolute inset-x-1.5 bottom-0 h-px bg-ice" />}
          </button>
        );
      })}
    </div>
  );
}

export function TopBar() {
  const query = useApp((s) => s.query);
  const pending = useApp((s) => s.data?.contributions.filter((c) => c.status === "pending_review").length ?? 0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA")) {
        e.preventDefault();
        inputRef.current?.focus();
        app.set({ exploreOpen: true });
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ink/92 px-3 backdrop-blur-md">
      <Wordmark />
      <div className="mx-1 hidden h-6 w-px bg-line md:block" />
      <div className="relative min-w-0 max-w-[460px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => app.set({ query: e.target.value, exploreOpen: true })}
          placeholder="Search roads, passes, countries, corners…"
          aria-label="Search the atlas"
          className="h-8 w-full border border-line bg-panel pr-16 pl-8 text-[13px] text-fg placeholder:text-fg-faint focus:border-ice/50 focus:outline-none"
        />
        {query ? (
          <button
            onClick={() => app.set({ query: "" })}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-fg-faint hover:text-fg"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="absolute top-1/2 right-2 hidden -translate-y-1/2 border border-line px-1 font-mono text-[9px] text-fg-faint sm:block">
            CTRL K
          </kbd>
        )}
      </div>
      <div className="flex-1" />
      <StyleSelector className="hidden xl:flex" />
      <ContributeMenu pending={pending} />
      <div
        className="grid size-8 shrink-0 place-items-center border border-line text-fg-faint"
        title="Browsing anonymously — accounts are planned (Supabase Auth)"
        aria-label="Anonymous visitor"
      >
        <UserRound className="size-4" />
      </div>
    </header>
  );
}

/** Discreet contribution entry: media on existing roads first, road suggestions second. */
function ContributeMenu({ pending }: { pending: number }) {
  const [open, setOpen] = useState(false);
  const selection = useApp((s) => s.selection);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const target = selection;
  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const item = "flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 border border-line px-2.5 font-mono text-[10px] tracking-[0.1em] text-fg-dim uppercase hover:border-line-strong hover:text-fg"
      >
        <Plus className="size-3.5" />
        <span className="hidden sm:inline">Contribute</span>
        {pending > 0 && <span className="text-amber tabular-nums">{pending}</span>}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div role="menu" className="om-panel absolute top-10 right-0 z-50 w-72 animate-in shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <button
            role="menuitem"
            disabled={!target}
            className={item}
            onClick={() => go(() => target && app.set({ contribute: { kind: "add_media", target } }))}
          >
            <Camera className="mt-0.5 size-4 text-ice" />
            <span>
              <span className="block text-[13px] text-fg">Add a photo</span>
              <span className="block text-[11px] text-fg-faint">{target ? "To the road you have open" : "Open a road first, then share"}</span>
            </span>
          </button>
          <button role="menuitem" className={item} onClick={() => go(() => app.set({ contribute: { kind: "new_variant" }, selection: null }))}>
            <Spline className="mt-0.5 size-4 text-fg-dim" />
            <span>
              <span className="block text-[13px] text-fg">Suggest a missing road</span>
              <span className="block text-[11px] text-fg-faint">Reviewed before it joins the atlas</span>
            </span>
          </button>
          <div className="h-px bg-line" />
          <button role="menuitem" className={item} onClick={() => go(() => app.set({ contribute: { kind: "my_submissions" }, selection: null }))}>
            <Inbox className="mt-0.5 size-4 text-fg-dim" />
            <span className="flex-1">
              <span className="block text-[13px] text-fg">My submissions</span>
              <span className="block text-[11px] text-fg-faint">Stored in this browser only</span>
            </span>
            {pending > 0 && <span className="font-mono text-[10px] text-amber">{pending} pending</span>}
          </button>
        </div>
      )}
    </div>
  );
}
