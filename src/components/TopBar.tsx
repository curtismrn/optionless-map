"use client";

import { useEffect, useRef } from "react";
import { Plus, Search, X, UserRound, Inbox } from "lucide-react";
import { app, useApp } from "@/lib/store";
import { STYLE_META, type StyleId } from "@/components/map/styles";
import { Button, cn } from "@/components/ui";

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
      <button
        onClick={() => app.set({ contribute: { kind: "review" }, selection: null })}
        title="Contributions submitted from this browser (local demo queue)"
        className="hidden h-8 items-center gap-1.5 border border-line px-2 font-mono text-[10px] tracking-[0.1em] text-fg-dim hover:border-line-strong hover:text-fg md:flex"
      >
        <Inbox className="size-3.5" />
        LOCAL QUEUE
        <span className={cn("tabular-nums", pending > 0 ? "text-amber" : "text-fg-faint")}>{pending}</span>
      </button>
      <Button variant="solid" onClick={() => app.set({ contribute: { kind: "new_variant" }, selection: null })}>
        <Plus className="size-3.5" />
        <span className="hidden sm:inline">Add road</span>
      </Button>
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
