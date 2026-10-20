/** Phase 2A: photos only. Video upload/hosting is deferred; seed clips stay in the data but are not shown. */
export const VIDEO_ENABLED = false;

import type { MediaItem } from "@/lib/domain/schema";
import type { AtlasSnapshot } from "@/lib/repository/types";

const visible = (m: MediaItem) => m.status !== "removed";

/** All media for a road: the record itself plus every route variant on it. */
export function roadMedia(data: Pick<AtlasSnapshot, "variants" | "media">, locationId: string): MediaItem[] {
  const vids = new Set(data.variants.filter((v) => v.locationId === locationId).map((v) => v.id));
  return data.media.filter(
    (m) => visible(m) && ((m.attachedTo.type === "location" && m.attachedTo.id === locationId) || (m.attachedTo.type === "variant" && vids.has(m.attachedTo.id))),
  );
}

/** Media for one variant first, then the rest of its road. */
export function variantMedia(data: Pick<AtlasSnapshot, "media">, v: { id: string; locationId: string }): MediaItem[] {
  const own = data.media.filter((m) => visible(m) && m.attachedTo.type === "variant" && m.attachedTo.id === v.id);
  const road = data.media.filter((m) => visible(m) && m.attachedTo.type === "location" && m.attachedTo.id === v.locationId);
  return [...own, ...road];
}
