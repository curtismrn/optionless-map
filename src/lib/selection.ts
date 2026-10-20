// Selection model shared by the map and the panels. Pure, so it is unit-tested.
//
//   nothing selected   → every route "none"  (calm, uniform)
//   location selected  → its routes "sibling" (available), the rest "faded"
//   variant selected   → that route "primary", its siblings "sibling", the rest "faded"
//
// Roles only change styling; geometry is never merged or modified.

export type Sel = { type: "location" | "variant" | "poi"; id: string } | null;
export type RouteRole = "none" | "primary" | "sibling" | "faded";

type V = { id: string; locationId: string };
type P = { id: string; parent: { type: "location" | "variant"; id: string } };

export interface SelectionContext {
  locationId: string | null;
  variantId: string | null;
}

export function selectionContext(sel: Sel, variants: V[], pois: P[]): SelectionContext {
  if (!sel) return { locationId: null, variantId: null };
  if (sel.type === "location") return { locationId: sel.id, variantId: null };
  if (sel.type === "variant") return { locationId: variants.find((v) => v.id === sel.id)?.locationId ?? null, variantId: sel.id };
  const p = pois.find((x) => x.id === sel.id);
  if (!p) return { locationId: null, variantId: null };
  if (p.parent.type === "location") return { locationId: p.parent.id, variantId: null };
  return { locationId: variants.find((v) => v.id === p.parent.id)?.locationId ?? null, variantId: p.parent.id };
}

export function routeRole(v: V, ctx: SelectionContext): RouteRole {
  if (!ctx.locationId && !ctx.variantId) return "none";
  if (ctx.variantId === v.id) return "primary";
  if (ctx.locationId === v.locationId) return "sibling";
  return "faded";
}

/**
 * Several routes can share the same stretch of road. Given the distinct route
 * ids under a click, decide what to do: select the only one, or ask the user.
 * Routes of the currently selected location are listed first.
 */
export function resolveRouteClick(ids: string[], variants: V[], ctx: SelectionContext): { select: string } | { choose: string[] } | null {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return null;
  if (unique.length === 1) return { select: unique[0]! };
  const locOf = new Map(variants.map((v) => [v.id, v.locationId]));
  const ranked = unique.sort((a, b) => Number(locOf.get(b) === ctx.locationId) - Number(locOf.get(a) === ctx.locationId));
  return { choose: ranked };
}
