// Design explorations — switchable "looks" (design/explorations branch).
//
//   current   the shipped dark instrument look
//   roadbook  light, printed rally roadbook / road-map: black ink, red marker over yellow highlighter
//   nuit      dark without neon: night-blue map, sodium-lamp orange routes, wide motorsport type
//   jgps      90s/2000s Japanese car navigation: beige map, yellow roads, thick blue route, navy bevel UI, pixel font
//   bw        photocopied zine: pure black on white, heavy frames, condensed headlines
//   y2k       early-2000s skate site (Thrasher era): khaki, torn paper, halftone, marker labels, flame route
//   crt       cathode-ray screen: black, scanlines, glowing phosphor text, neon routes

export type Y2kDark = "y2k-night" | "y2k-grape" | "y2k-camo" | "y2k-graffiti" | "y2k-navy";
export type Look = "current" | "roadbook" | "nuit" | "jgps" | "bw" | "y2k" | Y2kDark | "crt";

/**
 * Dark variants of the 2000s look. Each has a 4-colour set used for section
 * banners, list accents and — on the map — the routes of a road (one colour each).
 * Banner text colour is chosen per slot for contrast.
 */
export const Y2K_DARK: Record<Y2kDark, {
  label: string;
  bg: string; panel: string; panel2: string; line: string;
  fg: string; dim: string; faint: string;
  accents: [string, string, string, string];
  accentText: [string, string, string, string];
  marker: string; link: string;
  map: { bg: string; water: string; forest: string; road: string; roadMinor: string; label: string; boundary: string };
}> = {
  "y2k-night": {
    label: "2000s Nuit",
    bg: "#161513", panel: "#22211d", panel2: "#2c2a25", line: "#4a473e",
    fg: "#f1ead2", dim: "#cfc7ab", faint: "#8f8870",
    accents: ["#2f5bd3", "#e1261c", "#f5c400", "#1fa34a"],
    accentText: ["#ffffff", "#ffffff", "#161513", "#ffffff"],
    marker: "#f5c400", link: "#7cc4ff",
    map: { bg: "#1b1a17", water: "#0f1418", forest: "#1d1f19", road: "#4a473e", roadMinor: "#302e28", label: "#bdb597", boundary: "#6b6656" },
  },
  "y2k-grape": {
    label: "2000s Grape",
    bg: "#1a0f2e", panel: "#26173f", panel2: "#30204d", line: "#4d3a73",
    fg: "#f3e9ff", dim: "#d2c2ee", faint: "#9a87c2",
    accents: ["#ff4fb8", "#b6ff2e", "#ff8a1f", "#3ad7ff"],
    accentText: ["#1a0f2e", "#1a0f2e", "#1a0f2e", "#1a0f2e"],
    marker: "#b6ff2e", link: "#ffb3ec",
    map: { bg: "#1d1233", water: "#120a24", forest: "#211538", road: "#4d3a73", roadMinor: "#33244f", label: "#c7b5ea", boundary: "#7a63a6" },
  },
  "y2k-camo": {
    label: "2000s Camo",
    bg: "#1c2116", panel: "#262c1d", panel2: "#2f3624", line: "#4b5538",
    fg: "#ece6c8", dim: "#cbc5a3", faint: "#8d8a6c",
    accents: ["#e8730c", "#3c6fd1", "#c9302c", "#d9c21a"],
    accentText: ["#1c2116", "#ffffff", "#ffffff", "#1c2116"],
    marker: "#e8730c", link: "#f2d36b",
    map: { bg: "#20261a", water: "#141a17", forest: "#252d1c", road: "#4b5538", roadMinor: "#343c27", label: "#c4bf9a", boundary: "#6e7a52" },
  },
  "y2k-graffiti": {
    label: "2000s Graffiti",
    bg: "#0e0e10", panel: "#1a1a1e", panel2: "#232328", line: "#3a3a42",
    fg: "#ffffff", dim: "#d6d6dc", faint: "#8b8b96",
    accents: ["#ff2e93", "#00e0ff", "#ffe600", "#7dff3c"],
    accentText: ["#0e0e10", "#0e0e10", "#0e0e10", "#0e0e10"],
    marker: "#00e0ff", link: "#ffe600",
    map: { bg: "#121215", water: "#08080a", forest: "#141418", road: "#3a3a42", roadMinor: "#26262c", label: "#c9c9d2", boundary: "#5c5c68" },
  },
  "y2k-navy": {
    label: "2000s Navy",
    bg: "#0d1630", panel: "#14204a", panel2: "#1b2a5c", line: "#33467e",
    fg: "#fff6d6", dim: "#e1d8b8", faint: "#9aa3c4",
    accents: ["#ff5a36", "#ffd23a", "#36d6a4", "#b38cff"],
    accentText: ["#0d1630", "#0d1630", "#0d1630", "#0d1630"],
    marker: "#ffd23a", link: "#9ec5ff",
    map: { bg: "#101a38", water: "#081026", forest: "#121d3e", road: "#33467e", roadMinor: "#223163", label: "#c9cbe0", boundary: "#5b6aa0" },
  },
};
export const isY2k = (l: Look) => l === "y2k" || l.startsWith("y2k-");

export const LOOKS: { id: Look; label: string }[] = [
  { id: "current", label: "Actuel" },
  { id: "roadbook", label: "Roadbook" },
  { id: "nuit", label: "Nuit" },
  { id: "jgps", label: "GPS JP" },
  { id: "bw", label: "N&B" },
  { id: "y2k", label: "2000s" },
  ...(Object.entries(Y2K_DARK) as [Y2kDark, { label: string }][]).map(([id, v]) => ({ id, label: v.label })),
  { id: "crt", label: "CRT" },
];

const KEY = "optionless.look";

/** The look the site ships with. */
export const DEFAULT_LOOK: Look = "y2k-night";

/** The look switcher is a design tool: shown in development, or with ?looks=1. */
export function showLookSwitcher(): boolean {
  if (typeof window === "undefined") return false;
  return process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("looks");
}

export function initialLook(): Look {
  if (typeof window === "undefined") return DEFAULT_LOOK;
  const q = new URLSearchParams(window.location.search).get("look");
  // the saved choice only matters where the switcher is shown
  const v = q ?? (!showLookSwitcher() ? null : (() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  })());
  return LOOKS.some((l) => l.id === v) ? (v as Look) : DEFAULT_LOOK;
}

/** CSS for the dark 2000s variants, generated from Y2K_DARK and inlined by the root layout (no flash). */
export function y2kDarkCss(): string {
  return (Object.entries(Y2K_DARK) as [Y2kDark, (typeof Y2K_DARK)[Y2kDark]][])
    .map(([id, v]) => {
      const vars: Record<string, string> = {
        "--color-ink": v.bg, "--color-panel": v.panel, "--color-panel-2": v.panel2, "--color-panel-3": v.line,
        "--color-line": v.line, "--color-line-strong": v.faint, "--color-fg": v.fg, "--color-fg-dim": v.dim,
        "--color-fg-faint": v.faint, "--color-ice": v.accents[1], "--color-amber": v.marker, "--color-signal": v.accents[1],
        "--y-marker": v.marker, "--y-link": v.link, "--y-dot": "rgba(255,255,255,0.05)", "--y-header": "#000000", "--y-shadow": "#000000",
      };
      v.accents.forEach((c, i) => (vars[`--y-a${i + 1}`] = c));
      v.accentText.forEach((c, i) => (vars[`--y-t${i + 1}`] = c));
      return `html[data-look="${id}"]{${Object.entries(vars).map(([k, val]) => `${k}:${val}`).join(";")}}`;
    })
    .join("\n");
}

export function persistLook(l: Look) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* private mode */
  }
  document.documentElement.dataset.look = l;
}

/** Colours the map overlay uses for routes, pins and labels. */
export interface RouteTheme {
  light: boolean;
  /** optional: colours cycled across a road's routes (by sibling index) */
  routeCycle?: string[];
  casing: string;
  route: string;
  routeHover: string;
  routeLabel: string;
  glow: string;
  glowOpacity: number;
  selected: string;
  selectedIcon: string;
  pin: string;
  pinFeatured: string;
  pinActive: string;
  label: string;
  labelFeatured: string;
  poi: string;
  poiLabel: string;
  cluster: string;
  clusterFill: string;
}

export function routeTheme(lightBasemap: boolean, look: Look): RouteTheme {
  if (look === "roadbook")
    return {
      light: true,
      casing: "#ffffff",
      route: "#1c1c1a",
      routeHover: "#d7261e",
      routeLabel: "#1c1c1a",
      glow: "#ffd43b", // highlighter under the selected route
      glowOpacity: 0.85,
      selected: "#d7261e",
      selectedIcon: "#ffffff",
      pin: "#1c1c1a",
      pinFeatured: "#d7261e",
      pinActive: "#d7261e",
      label: "#1c1c1a",
      labelFeatured: "#b01d16",
      poi: "#d7261e",
      poiLabel: "#5a1410",
      cluster: "#1c1c1a",
      clusterFill: "rgba(255,255,255,0.85)",
    };
  if (look === "nuit")
    return {
      light: false,
      casing: "#0b1220",
      route: "#f0a040",
      routeHover: "#ffd9a0",
      routeLabel: "#f6c27a",
      glow: "#f0a040",
      glowOpacity: 0.4,
      selected: "#fff4e2",
      selectedIcon: "#0b1220",
      pin: "#f0a040",
      pinFeatured: "#ffcf7a",
      pinActive: "#fff4e2",
      label: "#e9dcc8",
      labelFeatured: "#ffcf7a",
      poi: "#ffcf7a",
      poiLabel: "#f6c27a",
      cluster: "#f0a040",
      clusterFill: "rgba(240,160,64,0.16)",
    };
  if (look === "jgps")
    return {
      light: true,
      casing: "#ffffff",
      route: "#e8590c",
      routeHover: "#ff8a3d",
      routeLabel: "#7a2c00",
      glow: "#ffffff",
      glowOpacity: 0.9,
      selected: "#1748e6",
      selectedIcon: "#ffffff",
      pin: "#e8590c",
      pinFeatured: "#d6156b",
      pinActive: "#1748e6",
      label: "#1a2a55",
      labelFeatured: "#a10f52",
      poi: "#d6156b",
      poiLabel: "#5b0a2f",
      cluster: "#1748e6",
      clusterFill: "rgba(23,72,230,0.18)",
    };
  if (look === "bw")
    return {
      light: true,
      casing: "#ffffff",
      route: "#000000",
      routeHover: "#000000",
      routeLabel: "#000000",
      glow: "#000000",
      glowOpacity: 0.12,
      selected: "#000000",
      selectedIcon: "#ffffff",
      pin: "#000000",
      pinFeatured: "#000000",
      pinActive: "#000000",
      label: "#000000",
      labelFeatured: "#000000",
      poi: "#000000",
      poiLabel: "#000000",
      cluster: "#000000",
      clusterFill: "rgba(255,255,255,0.9)",
    };
  if (look === "y2k")
    return {
      light: true,
      casing: "#1d1c16",
      route: "#d4161c",
      routeHover: "#ff4b1f",
      routeLabel: "#1d1c16",
      glow: "#ffb400",
      glowOpacity: 0.7,
      selected: "#ffd400",
      selectedIcon: "#1d1c16",
      pin: "#d4161c",
      pinFeatured: "#ffb400",
      pinActive: "#ffd400",
      label: "#f2f0d8",
      labelFeatured: "#ffd400",
      poi: "#2c4e94",
      poiLabel: "#1d2f5c",
      cluster: "#1d1c16",
      clusterFill: "rgba(255,212,0,0.55)",
    };
  if (look in Y2K_DARK) {
    const v = Y2K_DARK[look as Y2kDark];
    return {
      light: false,
      routeCycle: [...v.accents],
      casing: v.bg,
      route: v.accents[0],
      routeHover: "#ffffff",
      routeLabel: v.fg,
      glow: v.accents[2],
      glowOpacity: 0.6,
      selected: "#ffffff",
      selectedIcon: v.bg,
      pin: v.accents[1],
      pinFeatured: v.accents[2],
      pinActive: "#ffffff",
      label: v.fg,
      labelFeatured: v.marker,
      poi: v.accents[3],
      poiLabel: v.accents[3],
      cluster: v.marker,
      clusterFill: "rgba(255,255,255,0.08)",
    };
  }
  if (look === "crt")
    return {
      light: false,
      casing: "#020402",
      route: "#39ff7a",
      routeHover: "#b4ffcc",
      routeLabel: "#39ff7a",
      glow: "#ff2bd6",
      glowOpacity: 0.75,
      selected: "#ff5ce1",
      selectedIcon: "#020402",
      pin: "#39ff7a",
      pinFeatured: "#ffe83b",
      pinActive: "#ff5ce1",
      label: "#8dffb0",
      labelFeatured: "#ffe83b",
      poi: "#ffe83b",
      poiLabel: "#ffe83b",
      cluster: "#39ff7a",
      clusterFill: "rgba(57,255,122,0.12)",
    };
  // current
  return lightBasemap
    ? {
        light: true,
        casing: "#ffffff",
        route: "#0f7f9c",
        routeHover: "#004e63",
        routeLabel: "#0f7f9c",
        glow: "#0f7f9c",
        glowOpacity: 0.35,
        selected: "#111111",
        selectedIcon: "#ffffff",
        pin: "#0f7f9c",
        pinFeatured: "#e6a43c",
        pinActive: "#111111",
        label: "#0f5d72",
        labelFeatured: "#8a5a00",
        poi: "#e6a43c",
        poiLabel: "#7a4d00",
        cluster: "#0f7f9c",
        clusterFill: "rgba(15,127,156,0.14)",
      }
    : {
        light: false,
        casing: "#0b0e11",
        route: "#8fd6ea",
        routeHover: "#d6f3fb",
        routeLabel: "#8fd6ea",
        glow: "#8fd6ea",
        glowOpacity: 0.35,
        selected: "#f4f6f7",
        selectedIcon: "#0b0e11",
        pin: "#8fd6ea",
        pinFeatured: "#e6a43c",
        pinActive: "#f4f6f7",
        label: "#d4eff7",
        labelFeatured: "#f0c98a",
        poi: "#e6a43c",
        poiLabel: "#e8c48a",
        cluster: "#8fd6ea",
        clusterFill: "rgba(143,214,234,0.14)",
      };
}
