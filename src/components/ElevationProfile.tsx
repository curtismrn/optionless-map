"use client";

import { useState } from "react";

/** Compact elevation profile with a hover readout. Profile points are [km, m]. */
export function ElevationProfile({
  profile,
  onHover,
}: {
  profile: [number, number][];
  onHover?: (km: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (profile.length < 2) return null;
  const W = 380, H = 96, P = { l: 30, r: 6, t: 8, b: 16 };
  const maxKm = profile.at(-1)![0];
  const eles = profile.map((p) => p[1]);
  const lo = Math.min(...eles), hi = Math.max(...eles);
  const pad = Math.max(20, (hi - lo) * 0.08);
  const y0 = lo - pad, y1 = hi + pad;
  const x = (km: number) => P.l + (km / maxKm) * (W - P.l - P.r);
  const y = (m: number) => P.t + (1 - (m - y0) / (y1 - y0)) * (H - P.t - P.b);
  const d = profile.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const area = `${d}L${x(maxKm)},${H - P.b}L${x(0)},${H - P.b}Z`;
  const ticks = [lo, Math.round((lo + hi) / 2), hi];

  const hp = hover !== null ? profile[hover] : null;

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-none select-none"
        role="img"
        aria-label={`Elevation profile from ${lo} to ${hi} metres over ${maxKm.toFixed(1)} kilometres`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const km = (((e.clientX - r.left) / r.width) * W - P.l) / (W - P.l - P.r) * maxKm;
          let best = 0;
          for (let i = 0; i < profile.length; i++) if (Math.abs(profile[i]![0] - km) < Math.abs(profile[best]![0] - km)) best = i;
          setHover(best);
          onHover?.(profile[best]![0]);
        }}
        onPointerLeave={() => {
          setHover(null);
          onHover?.(null);
        }}
      >
        <defs>
          <linearGradient id="om-prof" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8fd6ea" stopOpacity="0.28" />
            <stop offset="1" stopColor="#8fd6ea" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#222930" strokeDasharray="2 3" />
            <text x={P.l - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="#5c6770" fontFamily="var(--font-mono)">
              {t}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#om-prof)" />
        <path d={d} fill="none" stroke="#8fd6ea" strokeWidth="1.4" strokeLinejoin="round" />
        <text x={P.l} y={H - 3} fontSize="8" fill="#5c6770" fontFamily="var(--font-mono)">
          0
        </text>
        <text x={W - P.r} y={H - 3} fontSize="8" fill="#5c6770" textAnchor="end" fontFamily="var(--font-mono)">
          {maxKm.toFixed(1)} km
        </text>
        {hp && (
          <g>
            <line x1={x(hp[0])} x2={x(hp[0])} y1={P.t} y2={H - P.b} stroke="#f4f6f7" strokeWidth="0.8" />
            <circle cx={x(hp[0])} cy={y(hp[1])} r="2.6" fill="#0a0c0e" stroke="#f4f6f7" strokeWidth="1.2" />
          </g>
        )}
      </svg>
      <figcaption className="pointer-events-none absolute top-0 right-1 font-mono text-[10px] text-fg-dim tabular-nums">
        {hp ? `${hp[0].toFixed(2)} km · ${hp[1]} m` : " "}
      </figcaption>
    </figure>
  );
}
