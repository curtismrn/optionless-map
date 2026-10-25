"use client";

// Shared atlas backed by Supabase (friends-only mode).
//
// The browser talks to Postgres with the anon key + the member's session.
// Row Level Security decides everything: members can read and write, others
// can read only when atlas_settings.public_read is on. Photos live in the
// private "photos" bucket and are shown through short-lived signed URLs.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LocationInput,
  VariantInput,
  PhotoUpdate,
  PoiInput,
  type Location,
  type Variant,
  type Poi,
  type MediaItem,
  type Contribution,
  type Provenance,
  type ElevationStats,
  type LngLat,
} from "@/lib/domain/schema";
import { processFile } from "./localMedia";
import type { AtlasEditor, AtlasRepository, AtlasSnapshot, ContributionInput, EditEntry, MediaInput } from "./types";

type Row = Record<string, unknown>;

const SEED_NAME = "OPTIONLESS demo seed";
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";

/** Turn PostgREST / Storage errors into messages a friend can act on. */
export function friendlyError(e: { message?: string; code?: string; statusCode?: string | number } | null | undefined, what: string): Error {
  const msg = e?.message ?? "Unknown error";
  if (e?.code === "42501" || /row-level security|permission denied|not allowed|Unauthorized/i.test(msg))
    return new Error(`${what}: you need to be signed in as an invited member.`);
  if (e?.code === "PGRST116") return new Error(`${what}: it no longer exists, or you are not allowed to change it.`);
  if (e?.code === "23514") return new Error(`${what}: the data didn't pass validation (${msg.replace(/^.*constraint "?([^"]+)"?.*$/, "$1")}).`);
  if (e?.code === "23503") return new Error(`${what}: it refers to something that no longer exists — reload and try again.`);
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return new Error(`${what}: the server can't be reached. Check your connection and try again.`);
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return new Error(`${what}: the file is too large (10 MB max).`);
  if (/mime type/i.test(msg)) return new Error(`${what}: only JPEG, PNG or WebP photos are accepted.`);
  return new Error(`${what}: ${msg}`);
}

export class SharedRepository implements AtlasRepository, AtlasEditor {
  readonly kind = "remote" as const;
  constructor(private sb: SupabaseClient) {}

  private names = new Map<string, string>();
  private actor = (id: unknown) => {
    if (!id) return { kind: "system" as const, name: SEED_NAME };
    return { kind: "user" as const, name: this.names.get(String(id)) ?? "a member" };
  };

  // ------------------------------------------------------------------ reads

  async load(): Promise<AtlasSnapshot> {
    const [locs, vars, pois, photos, members] = await Promise.all([
      this.sb.from("locations").select("*").order("name"),
      this.sb.from("variants").select("*").order("created_at"),
      this.sb.from("pois").select("*"),
      this.sb.from("photos").select("*").order("created_at", { ascending: false }),
      this.sb.from("members").select("user_id, display_name"),
    ]);
    for (const r of [locs, vars, pois, photos]) if (r.error) throw friendlyError(r.error, "Loading the atlas failed");
    this.names = new Map((members.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));

    const locations: Location[] = (locs.data as Row[]).map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      summary: (r.summary as string) ?? "",
      countries: r.countries as string[],
      regions: (r.regions as string[]) ?? [],
      continent: r.continent as Location["continent"],
      center: r.center as LngLat,
      cover: { kind: "placeholder" },
      tags: (r.tags as string[]) ?? [],
      featured: !!r.featured,
      publication: "published",
      provenance: r.provenance as Provenance,
      createdBy: this.actor(r.created_by),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));

    const variants: Variant[] = (vars.data as Row[]).map((r) => ({
      id: r.id as string,
      locationId: r.location_id as string,
      slug: r.slug as string,
      name: r.name as string,
      description: (r.description as string) ?? "",
      activity: r.activity as Variant["activity"],
      geometry: r.geometry as Variant["geometry"],
      waypoints: (r.waypoints as LngLat[] | null) ?? undefined,
      elevation: (r.elevation as ElevationStats | null) ?? undefined,
      surface: (r.surface as string | null) ?? undefined,
      countries: (r.countries as string[])?.length ? (r.countries as string[]) : ["FR"],
      regions: (r.regions as string[]) ?? [],
      direction: r.direction as Variant["direction"],
      directionNote: (r.direction_note as string | null) ?? undefined,
      verification: r.verification as Variant["verification"],
      publication: "published",
      provenance: r.provenance as Provenance,
      detectedHairpins: (r.detected_hairpins as LngLat[]) ?? [],
      toScout: !!r.to_scout,
      createdBy: this.actor(r.created_by),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));

    const poiList: Poi[] = (pois.data as Row[]).map((r) => ({
      id: r.id as string,
      parent: r.location_id ? { type: "location", id: r.location_id as string } : r.variant_id ? { type: "variant", id: r.variant_id as string } : null,
      name: r.name as string,
      communityLabel: !!r.community_label,
      coordinates: r.coordinates as LngLat,
      category: r.category as Poi["category"],
      description: (r.description as string) ?? "",
      publication: "published",
      provenance: r.provenance as Provenance,
      createdBy: this.actor(r.created_by),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));

    // signed URLs for uploaded photos (private bucket), in one round trip
    const rows = photos.data as Row[];
    const paths = rows.flatMap((r) => (r.source === "upload" ? [r.storage_path as string, (r.thumb_path as string) ?? (r.storage_path as string)] : []));
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data, error } = await this.sb.storage.from("photos").createSignedUrls([...new Set(paths)], 60 * 60 * 6);
      if (error) throw friendlyError(error, "Loading photos failed");
      for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
    }
    const media: MediaItem[] = rows.map((r) => ({
      id: r.id as string,
      attachedTo: r.location_id
        ? { type: "location", id: r.location_id as string }
        : r.variant_id
          ? { type: "variant", id: r.variant_id as string }
          : { type: "poi", id: r.poi_id as string },
      kind: "photo",
      source: r.source === "upload" ? "upload" : "commons",
      title: (r.title as string) || "Photo",
      url: r.source === "upload" ? signed.get(r.storage_path as string) : (r.url as string),
      thumbUrl: r.source === "upload" ? signed.get(((r.thumb_path as string) ?? r.storage_path) as string) : (r.thumb_url as string),
      width: (r.width as number) ?? undefined,
      height: (r.height as number) ?? undefined,
      caption: (r.caption as string) ?? "",
      credit: (r.credit as string) || this.actor(r.created_by).name,
      license: r.license as string,
      licenseUrl: (r.license_url as string) ?? null,
      sourceUrl: (r.source_url as string) ?? undefined,
      capturedAt: (r.captured_at as string) ?? null,
      createdAt: r.created_at as string,
      status: "published",
    }));

    return { locations, variants, pois: poiList, media, contributions: [] };
  }

  // ------------------------------------------------------------------ roads

  async saveLocation(input: LocationInput, id?: string): Promise<string> {
    const v = LocationInput.parse(input);
    const row = {
      name: v.name,
      slug: slugify(v.name),
      summary: v.summary,
      countries: v.countries,
      regions: v.regions,
      continent: v.continent,
      center: v.center,
      tags: v.tags,
      featured: v.featured,
    };
    const q = id
      ? this.sb.from("locations").update(row).eq("id", id).select("id").single()
      : this.sb.from("locations").insert({ ...row, provenance: { kind: "community", source: "Added by a member" } }).select("id").single();
    const { data, error } = await q;
    if (error) throw friendlyError(error, "Saving the road failed");
    return data.id as string;
  }

  async deleteLocation(id: string) {
    const { error, count } = await this.sb.from("locations").delete({ count: "exact" }).eq("id", id);
    if (error) throw friendlyError(error, "Deleting the road failed");
    if (!count) throw new Error("Deleting the road failed: you need to be signed in as an invited member.");
  }

  // ------------------------------------------------------------------ routes

  async saveVariant(input: VariantInput, id?: string): Promise<string> {
    const v = VariantInput.parse(input);
    const row: Row = {
      location_id: v.locationId,
      name: v.name,
      slug: slugify(v.name),
      description: v.description,
      activity: v.activity,
      direction: v.direction,
      direction_note: v.directionNote || null,
      surface: v.surface || null,
      countries: v.countries,
      regions: v.regions,
      geometry: v.geometry,
      waypoints: v.waypoints ?? null,
      to_scout: !!v.toScout,
    };
    // stats are only replaced when the caller recomputed them for a new line
    if (v.elevation !== undefined) row.elevation = v.elevation;
    if (v.detectedHairpins !== undefined) row.detected_hairpins = v.detectedHairpins;
    const q = id
      ? this.sb.from("variants").update(row).eq("id", id).select("id").single()
      : this.sb.from("variants").insert({ ...row, provenance: { kind: "community", source: "Drawn by a member · routed along OpenStreetMap roads (OSRM)", license: "ODbL 1.0" } }).select("id").single();
    const { data, error } = await q;
    if (error) throw friendlyError(error, "Saving the route failed");
    return data.id as string;
  }

  async setToScout(id: string, toScout: boolean) {
    const { error, count } = await this.sb.from("variants").update({ to_scout: toScout }, { count: "exact" }).eq("id", id);
    if (error) throw friendlyError(error, "Updating the route failed");
    if (!count) throw new Error("Updating the route failed: you need to be signed in as an invited member.");
  }

  async deleteVariant(id: string) {
    const { error, count } = await this.sb.from("variants").delete({ count: "exact" }).eq("id", id);
    if (error) throw friendlyError(error, "Deleting the route failed");
    if (!count) throw new Error("Deleting the route failed: you need to be signed in as an invited member.");
  }

  // ------------------------------------------------------------------ spots

  async savePoi(input: PoiInput, id?: string): Promise<string> {
    const v = PoiInput.parse(input);
    const row = {
      location_id: v.parent?.type === "location" ? v.parent.id : null,
      variant_id: v.parent?.type === "variant" ? v.parent.id : null,
      name: v.name,
      category: v.category,
      description: v.description,
      community_label: v.communityLabel,
      coordinates: v.coordinates,
    };
    const q = id
      ? this.sb.from("pois").update(row).eq("id", id).select("id").single()
      : this.sb.from("pois").insert({ ...row, provenance: { kind: "community", source: "Added by a member" } }).select("id").single();
    const { data, error } = await q;
    if (error) throw friendlyError(error, "Saving the spot failed");
    return data.id as string;
  }

  async deletePoi(id: string) {
    const { error, count } = await this.sb.from("pois").delete({ count: "exact" }).eq("id", id);
    if (error) throw friendlyError(error, "Deleting the spot failed");
    if (!count) throw new Error("Deleting the spot failed: you need to be signed in as an invited member.");
  }

  // ------------------------------------------------------------------ photos

  async addPhoto(input: MediaInput): Promise<void> {
    if (!input.file.type.startsWith("image/")) throw new Error("Only photos are supported.");
    const { data: auth } = await this.sb.auth.getUser();
    if (!auth.user) throw new Error("Adding the photo failed: you need to be signed in as an invited member.");
    const p = await processFile(input.file); // re-encodes to JPEG, strips EXIF/GPS
    const id = crypto.randomUUID();
    const base = `${auth.user.id}/${id}`;
    const up = async (path: string, blob: Blob) => {
      const { error } = await this.sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw friendlyError(error, "Uploading the photo failed");
    };
    await up(`${base}.jpg`, p.blob);
    await up(`${base}_thumb.jpg`, p.thumb);
    const a = input.attachedTo;
    const { error } = await this.sb.from("photos").insert({
      id,
      location_id: a.type === "location" ? a.id : null,
      variant_id: a.type === "variant" ? a.id : null,
      poi_id: a.type === "poi" ? a.id : null,
      source: "upload",
      storage_path: `${base}.jpg`,
      thumb_path: `${base}_thumb.jpg`,
      title: input.file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120),
      caption: input.caption.trim(),
      credit: input.credit.trim(),
      license: input.license,
      captured_at: input.capturedAt || null,
      width: p.width,
      height: p.height,
    });
    if (error) {
      await this.sb.storage.from("photos").remove([`${base}.jpg`, `${base}_thumb.jpg`]);
      throw friendlyError(error, "Saving the photo failed");
    }
  }

  async updatePhoto(id: string, patch: PhotoUpdate) {
    const v = PhotoUpdate.parse(patch);
    const a = v.attachedTo;
    const { error, count } = await this.sb
      .from("photos")
      .update(
        {
          caption: v.caption,
          credit: v.credit,
          license: v.license,
          captured_at: v.capturedAt || null,
          location_id: a.type === "location" ? a.id : null,
          variant_id: a.type === "variant" ? a.id : null,
          poi_id: a.type === "poi" ? a.id : null,
        },
        { count: "exact" },
      )
      .eq("id", id);
    if (error) throw friendlyError(error, "Saving the photo failed");
    if (!count) throw new Error("Saving the photo failed: you need to be signed in as an invited member.");
  }

  /** Removes the photo from the atlas. The stored file is kept so the deletion can be undone from History. */
  async deletePhoto(id: string) {
    const { error, count } = await this.sb.from("photos").delete({ count: "exact" }).eq("id", id);
    if (error) throw friendlyError(error, "Deleting the photo failed");
    if (!count) throw new Error("Deleting the photo failed: you need to be signed in as an invited member.");
  }

  // ------------------------------------------------------------------ history

  async listEdits(limit = 60): Promise<EditEntry[]> {
    const { data, error } = await this.sb.from("edits").select("id, table_name, row_id, action, before, after, actor_name, at").order("at", { ascending: false }).limit(limit);
    if (error) throw friendlyError(error, "Loading history failed");
    return (data as Row[]).map((r) => {
      const snap = (r.after ?? r.before) as Row | null;
      const label = (snap?.name as string) || (snap?.caption as string) || (snap?.title as string) || (r.row_id as string);
      return {
        id: r.id as number,
        table: r.table_name as EditEntry["table"],
        rowId: r.row_id as string,
        action: r.action as EditEntry["action"],
        label,
        actor: (r.actor_name as string) ?? "a member",
        at: r.at as string,
      };
    });
  }

  async restoreEdit(id: number) {
    const { error } = await this.sb.rpc("restore_edit", { edit_id: id });
    if (error) throw friendlyError(error, "Undo failed");
  }

  // ------------------------------------------------------------------ AtlasRepository glue

  async submitContribution(_input: ContributionInput): Promise<Contribution> {
    throw new Error("Suggestions are not used in the shared atlas — members edit directly.");
  }
  async addMedia(input: MediaInput): Promise<MediaItem> {
    await this.addPhoto(input);
    return { id: "", attachedTo: input.attachedTo, kind: "photo", source: "upload", title: input.file.name, caption: input.caption, credit: input.credit, license: input.license, status: "published" };
  }
  async removeOwnMedia(id: string) {
    await this.deletePhoto(id);
  }
  async resetLocal() {}
}
