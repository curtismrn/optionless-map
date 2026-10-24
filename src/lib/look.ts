// Design explorations — switchable "looks" (design/explorations branch).
//
//   current   the shipped dark instrument look
//   roadbook  light, printed rally roadbook / road-map: black ink, red marker over yellow highlighter
//   nuit      dark without neon: night-blue map, sodium-lamp orange routes, wide motorsport type

export type Look = "current" | "roadbook" | "nuit";

export const LOOKS: { id: Look; label: string }[] = [
  { id: "current", label: "Actuel" },
  { id: "roadbook", label: "Roadbook" },
  { id: "nuit", label: "Nuit" },
];

const KEY = "optionless.look";

export function initialLook(): Look {
  if (typeof window === "undefined") return "current";
  const q = new URLSearchParams(window.location.search).get("look");
  const v = q ?? (() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  })();
  return v === "roadbook" || v === "nuit" ? v : "current";
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
