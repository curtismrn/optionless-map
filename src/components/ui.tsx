"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ProvenanceKind, PublicationStatus, VerificationStatus } from "@/lib/domain/schema";

export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

type BtnVariant = "solid" | "outline" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  solid: "bg-ice text-ink border-ice hover:bg-[#b5e6f3] disabled:bg-panel-3 disabled:text-fg-faint disabled:border-line",
  outline: "bg-transparent text-fg border-line-strong hover:border-fg-dim hover:bg-panel-2 disabled:text-fg-faint",
  ghost: "bg-transparent text-fg-dim border-transparent hover:text-fg hover:bg-panel-2 disabled:text-fg-faint",
  danger: "bg-transparent text-signal border-signal/50 hover:bg-signal/10",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }>(
  function Button({ variant = "outline", size = "md", className, ...p }, ref) {
    return (
      <button
        ref={ref}
        {...p}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 border font-mono uppercase tracking-[0.1em] transition-colors duration-150 disabled:cursor-not-allowed",
          size === "sm" ? "h-7 px-2 text-2xs" : "h-8 px-3 text-[11px]",
          BTN[variant],
          className,
        )}
      />
    );
  },
);

export function IconButton({ label, children, active, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "grid size-8 place-items-center border transition-colors duration-150",
        active ? "border-ice/60 bg-ice/10 text-ice" : "border-line bg-panel/90 text-fg-dim hover:border-line-strong hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({ active, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...p}
      aria-pressed={active}
      className={cn(
        "h-6 border px-2 font-mono text-2xs uppercase tracking-[0.08em] transition-colors duration-150",
        active ? "border-ice/70 bg-ice/10 text-ice" : "border-line text-fg-dim hover:border-line-strong hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = "dim", dashed, children, title }: { tone?: "dim" | "ice" | "amber" | "signal" | "community" | "ok"; dashed?: boolean; children: ReactNode; title?: string }) {
  const tones = {
    dim: "text-fg-dim border-line-strong",
    ice: "text-ice border-ice/50",
    amber: "text-amber border-amber/50",
    signal: "text-signal border-signal/50",
    community: "text-community border-community/50",
    ok: "text-ok border-ok/50",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[18px] items-center border px-1.5 font-mono text-[9.5px] uppercase leading-none tracking-[0.1em] whitespace-nowrap",
        dashed && "border-dashed",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function ProvenanceBadge({ kind }: { kind: ProvenanceKind }) {
  const m = {
    osm: { t: "OSM-derived", tone: "ice" as const, title: "Geometry/coordinates derived from OpenStreetMap data" },
    community: { t: "Community", tone: "community" as const, title: "Submitted by a contributor" },
    demo: { t: "Demo copy", tone: "dim" as const, title: "Editorial demonstration text for this prototype" },
    illustrative: { t: "Illustrative", tone: "signal" as const, title: "Concept/placeholder — not an exact real-world claim" },
  }[kind];
  return (
    <Badge tone={m.tone} dashed={kind === "illustrative"} title={m.title}>
      {m.t}
    </Badge>
  );
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "verified") return <Badge tone="ok" title="Geometry verified by a moderator">Verified</Badge>;
  if (status === "community_confirmed") return <Badge tone="ice">Community-confirmed</Badge>;
  return <Badge tone="dim" title="Geometry has not been verified by a moderator">Unverified</Badge>;
}

export function PublicationBadge({ status }: { status: PublicationStatus }) {
  if (status === "published") return null;
  const m: Record<Exclude<PublicationStatus, "published">, [string, "amber" | "signal" | "dim"]> = {
    draft: ["Draft", "dim"],
    pending_review: ["Pending review", "amber"],
    rejected: ["Rejected", "signal"],
    archived: ["Archived", "dim"],
    reported: ["Reported", "signal"],
  };
  const [t, tone] = m[status];
  return (
    <Badge tone={tone} dashed>
      {t}
    </Badge>
  );
}

export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-line px-3 py-3", className)}>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="om-label">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, hint }: { label: string; value: ReactNode; unit?: string; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="om-label">{label}</div>
      <div className="font-display text-xl font-semibold leading-tight tracking-wide text-fg tabular-nums">
        {value}
        {unit && <span className="ml-0.5 font-mono text-[10px] font-normal text-fg-dim">{unit}</span>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="om-label mb-1 block">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-fg-faint">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-signal">{error}</span>}
    </label>
  );
}

export const inputCls =
  "w-full border border-line bg-ink px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-faint focus:border-ice/60 focus:outline-none";
