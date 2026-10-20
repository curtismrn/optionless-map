// Local demonstration repository.
//
// Seed data is static. Contributions are kept in this browser's localStorage so
// the demo survives a reload. This is NOT a shared database and NOT an identity
// system: anyone can clear or edit it, nothing reaches other visitors, and the
// prototype has no reviewer: suggestions stay "pending review" until a real backend exists. Production needs a backend with
// server-side validation, rate limiting, spam prevention and moderation.

import mediaJson from "@/data/generated/media.json";
import { VIDEO_ENABLED } from "@/lib/media";
import { listLocalMedia, putLocalMedia, deleteLocalMedia, clearLocalMedia, processFile } from "./localMedia";
import {
  Contribution,
  MediaItem,
  type Location,
  type Poi,
  type Variant,
} from "@/lib/domain/schema";
import { SEED_LOCATIONS, SEED_POIS, SEED_VARIANTS } from "@/data/seed";
import { overlapRatio, type Coord } from "@/lib/geo";
import { z } from "zod";
import type { AtlasRepository, AtlasSnapshot, ContributionInput, MediaInput } from "./types";

const KEY = "optionless.demo.contributions.v1";
const ANON = { kind: "anonymous" as const, name: "Anonymous (this browser)" };

function readStored(): Contribution[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed = z.array(Contribution).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeStored(list: Contribution[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode / quota) — demo continues in memory */
  }
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Project seed + contributions into the entities the map shows. */
export function applyContributions(contribs: Contribution[]): Omit<AtlasSnapshot, "contributions" | "media"> {
  const locations: Location[] = [...SEED_LOCATIONS];
  const variants: Variant[] = SEED_VARIANTS.map((v) => ({ ...v }));
  const pois: Poi[] = [...SEED_POIS];
  const actor = ANON;

  for (const c of contribs) {
    if (c.status === "rejected") continue;
    const stamps = { createdAt: c.submittedAt, updatedAt: c.submittedAt };
    const pub = c.status === "published" ? "published" : "pending_review";

    if (c.kind === "new_variant" && c.variant) {
      let locationId = c.locationId;
      if (!locationId && c.newLocation) {
        locationId = `loc-${c.id}`;
        const coords = c.variant.geometry.coordinates;
        const mid = coords[Math.floor(coords.length / 2)]!;
        locations.push({
          id: locationId,
          slug: slugify(c.newLocation.name),
          name: c.newLocation.name,
          summary: c.newLocation.summary,
          countries: c.newLocation.countries,
          regions: c.newLocation.regions,
          continent: c.newLocation.continent,
          center: mid,
          cover: { kind: "placeholder" },
          tags: [],
          featured: false,
          publication: pub,
          provenance: { kind: "community", source: "Local demo contribution" },
          createdBy: actor,
          ...stamps,
        });
      }
      const loc = locations.find((l) => l.id === locationId);
      variants.push({
        id: `var-${c.id}`,
        locationId: locationId!,
        slug: slugify(c.variant.name),
        name: c.variant.name,
        description: c.variant.description,
        activity: c.variant.activity,
        geometry: c.variant.geometry,
        surface: c.variant.surface,
        countries: loc?.countries ?? ["FR"],
        regions: loc?.regions ?? [],
        direction: c.variant.direction,
        verification: "unverified",
        publication: pub,
        provenance: { kind: "community", source: "Local demo contribution", note: "Hand-drawn or GPX geometry; not reviewed." },
        detectedHairpins: [],
        createdBy: actor,
        contributionId: c.id,
        ...stamps,
      });
    }

    if (c.kind === "new_poi" && c.poi && c.targetId) {
      const isVariant = c.targetId.startsWith("var-");
      pois.push({
        id: `poi-${c.id}`,
        parent: { type: isVariant ? "variant" : "location", id: c.targetId },
        name: c.poi.name,
        communityLabel: c.poi.communityLabel,
        coordinates: c.poi.coordinates,
        category: c.poi.category,
        description: c.poi.description,
        publication: pub,
        provenance: { kind: "community", source: "Local demo contribution" },
        createdBy: actor,
        ...stamps,
      });
    }

    // Accepted corrections replace live geometry; the original stays on the contribution.
    if (c.kind === "geometry_correction" && c.status === "published" && c.proposedGeometry) {
      const v = variants.find((x) => x.id === c.targetId);
      if (v) {
        v.geometry = c.proposedGeometry;
        v.elevation = undefined; // stale until recomputed server-side
        v.detectedHairpins = [];
        v.updatedAt = c.submittedAt;
      }
    }
    if (c.kind === "description_edit" && c.status === "published" && c.descriptionEdit) {
      const v = variants.find((x) => x.id === c.targetId);
      if (v) v.description = c.descriptionEdit.after;
    }
  }
  return { locations, variants, pois };
}

export function findPossibleDuplicates(coords: Coord[], variants: Variant[], ignoreId?: string): string[] {
  return variants
    .filter((v) => v.id !== ignoreId)
    .filter((v) => overlapRatio(coords, v.geometry.coordinates as Coord[]) >= 0.6)
    .map((v) => v.id);
}

const SEED_MEDIA: MediaItem[] = z.array(MediaItem).parse((mediaJson as { items: unknown[] }).items);

export class LocalDemoRepository implements AtlasRepository {
  readonly kind = "local-demo" as const;
  private contributions: Contribution[] = [];

  async load(): Promise<AtlasSnapshot> {
    this.contributions = readStored();
    const reported = new Set(this.contributions.filter((c) => c.kind === "report" && c.report?.subject.type === "media").map((c) => c.report!.subject.id));
    const local = await listLocalMedia();
    const media = [...local.slice().reverse(), ...SEED_MEDIA]
      .filter((m) => VIDEO_ENABLED || m.kind === "photo") // clips stay in the data, hidden from the product for now
      .map((m) => (reported.has(m.id) ? { ...m, status: "reported" as const } : m));
    return { ...applyContributions(this.contributions), media, contributions: this.contributions };
  }

  async submitContribution(input: ContributionInput): Promise<Contribution> {
    const { variants } = applyContributions(this.contributions);
    const geom = input.variant?.geometry ?? input.proposedGeometry;
    const candidate = Contribution.parse({
      ...input,
      id: uid("c"),
      status: "pending_review",
      submittedAt: new Date().toISOString(),
      submitter: ANON,
      possibleDuplicates: geom ? findPossibleDuplicates(geom.coordinates as Coord[], variants, input.targetId) : [],
    });
    this.contributions = [...this.contributions, candidate];
    writeStored(this.contributions);
    return candidate;
  }

  async addMedia(input: MediaInput): Promise<MediaItem> {
    const p = await processFile(input.file);
    const meta = MediaItem.parse({
      id: uid("lm"),
      attachedTo: input.attachedTo,
      kind: p.kind,
      source: "local",
      title: input.file.name.replace(/.[a-z0-9]+$/i, ""),
      width: p.width,
      height: p.height,
      caption: input.caption.trim(),
      credit: input.credit.trim() || "Anonymous (this browser)",
      license: input.license,
      capturedAt: input.capturedAt || null,
      createdAt: new Date().toISOString(),
      status: "published",
    });
    await putLocalMedia(meta, p.blob, p.thumb);
    return meta;
  }

  async removeOwnMedia(id: string): Promise<void> {
    await deleteLocalMedia(id);
  }

  async resetLocal(): Promise<void> {
    this.contributions = [];
    writeStored([]);
    await clearLocalMedia();
  }
}
