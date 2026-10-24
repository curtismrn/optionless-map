# OPTIONLESS MAP

A small, dark atlas of remarkable roads (mountain passes, touge, rally and hill-climb roads) built for a group of friends. You browse **roads**, pick one of the **routes** on that road, and look at its **photos**.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (node:test, Node 23.6+)
npm run typecheck
npm run build
```

No account, database or API key is needed to run it.

## How the atlas is organized

```
Road (geographic location)        e.g. Col d'Ibardin
 └─ Route variants                French-side ascent · Spanish-side ascent · Ibardin–Lizuniaga traverse · …
     └─ Photos / points           attached to the route, or to the road as a whole
```

Each route variant has its own geometry, even where it shares asphalt with another one. Nothing is ever merged automatically: overlapping routes stay separate records and stay separately selectable.

## Using the map

| State | What you see |
|---|---|
| Nothing selected | Road pins with names (amber = featured), thin calm cyan lines, no route labels until you zoom in close (z13+). Clusters at globe scale. |
| A road selected | Its routes in full cyan and everything else faded. The panel lists the routes by name with distance and climb. Hovering a list item highlights that route. |
| A route selected | The route drawn white with Start/Finish and its name. Sibling routes stay cyan, everything else is faded. The panel shows distance, climb, elevation profile and photos ("of this route" vs "from the whole road"). |
| Tap where routes overlap | A small chooser lists every route on that stretch. |
| Clear | The ✕ on the selection chip (top of the map), the panel's ✕, `Esc`, or a tap on empty map. |

Source, licence, verification status, coordinates and contribution history sit in a collapsed **Details, sources & contributions** section on each page.

On phones, the road/route panel is a bottom sheet (drag the handle for peek / half / full) and the map stays visible above it. The explorer is a separate drawer.

## What works, and where data lives

| Feature | Status |
|---|---|
| 8 roads, 15 route variants, OSM road-following geometry, DEM elevation stats and profiles | Works (static seed data in the repo) |
| ~70 seed photos from Wikimedia Commons, attached to roads or specific routes, each credited with licence and source link | Works (hot-linked from Commons) |
| Search, filters (activity, region, verification, has photos), Discover (regions, near me, featured, latest photos) | Works (local data only, no geocoder) |
| **Add a photo** to a road or route (EXIF/GPS stripped on-device) | Works, but **stored only in the browser that added it** (IndexedDB). Your friends will **not** see it. Clearing site data deletes it. |
| Suggest a missing route (waypoints routed along OSM roads via OSRM), fix a route line, add a point, report | Works, but **stored only in that browser** (localStorage) and stays "pending". Nobody reviews it, because there is no backend. |

**Nothing is shared between people yet.** To share photos and suggestions with friends, the next step is a small shared backend (e.g. Supabase: Postgres/PostGIS + Storage). Components only talk to the `AtlasRepository` interface (`src/lib/repository/types.ts`), so that backend can replace `LocalDemoRepository` without UI rewrites. The target schema is sketched in `docs/postgis-schema.sql`.

### Deliberately deferred

- Accounts, roles, moderation workflows.
- **Video**: upload, hosting and playback are off (`VIDEO_ENABLED = false` in `src/lib/media.ts`). The 4 seed clips remain in `media.json` but are hidden from the UI.
- Any production shared backend, and social features.

## Road geometry

- **Seed routes** come from `scripts/fetch-routes.mjs`, which routes between OSM-geocoded anchors with the OSRM demo server and stores the result in `src/data/generated/routes.json`. The UI renders that geometry as-is. A test checks that seed variants equal the stored routes and that no segment is a straight-line shortcut longer than 1.5 km; the only long straight segments are real tunnels.
- **Suggestions** (`src/lib/routing.ts`) route the placed waypoints along OSM roads. If routing fails, the line falls back to straight segments, shown in amber and labeled as such. Set `NEXT_PUBLIC_OSRM_URL` to use your own OSRM.
- Map sources use a low simplification tolerance so winding passes don't turn into straight chords at regional zoom.

## Code map

```
src/lib/selection.ts       selection roles (none / primary / sibling / faded), overlap resolution — unit-tested
src/components/map/        MapView, overlay (layers & label priorities), styles (basemaps), controller (camera)
src/components/            DetailPanel (road / route / point), ExplorePanel (Discover), Chrome (status bar,
                           controls, selection chip, route chooser), ContributePanel, PanelShell (mobile sheet)
src/lib/repository/        AtlasRepository + LocalDemoRepository (+ IndexedDB photos)
src/data/                  seed.ts, generated/routes.json, generated/media.json
tests/                     geo, gpx, schema, media/routing, hierarchy & selection audit
```

## Providers

| Purpose | Provider | Key |
|---|---|---|
| Vector tiles, glyphs, CLASSIC style | [OpenFreeMap](https://openfreemap.org) (OSM, ODbL) | none |
| Hillshade, 3D terrain, contours | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | none |
| SATELLITE (optional) | [MapTiler](https://www.maptiler.com) | `NEXT_PUBLIC_MAPTILER_KEY` |
| Road-following suggestions | [OSRM](https://project-osrm.org) public demo | `NEXT_PUBLIC_OSRM_URL` (optional) |
| Seed photos | [Wikimedia Commons](https://commons.wikimedia.org) | none |

These are free public services with no SLA. Refresh the data with `npm run data:fetch` (routes) and `npm run data:media` (photos). Both are slow on purpose to respect rate limits.

## Honesty rules

No invented ratings, users, events or activity. "Featured" is an editorial flag. Concept content (the Ibardin hill-climb format, the "Virage de la mort" nickname) is labeled. No racing spots are labeled on public roads.

## Shared atlas for friends (Supabase)

Without Supabase configuration, the app runs the local demo exactly as before.

**Status (2026-10-24):** `npm run test:shared` passes **30/30** against the real project. The test ran two independent member sessions and an anonymous visitor through:

- create, see the other member's change, and realtime refresh;
- geometry and waypoints kept identical through edits, undo, and delete + restore;
- photo upload and viewing in both directions;
- visitor writes, uploads and undo denied, and private reads hidden;
- validation errors for bad geometry, a missing road, non-image files and files over 10 MB;
- members list read-only from the browser;
- history logged with the author.

Also checked:

- `db:setup` is idempotent: the second run inserted 0 rows.
- A non-invited email is refused (`otp_disabled`).
- The browser shows the private-atlas gate and no data when signed out.

Manually verified by the owner (2026-10-24): magic-link sign-in on localhost, then creating and editing roads, routes and photos through the UI.

Notes:

- Supabase's built-in email sender is heavily rate-limited and, on recent projects, may only deliver to the project's team members. If friends don't receive links, configure custom SMTP (e.g. Resend) under **Authentication → Emails → SMTP Settings**.

What it adds when configured:

- Invite-only sign-in by email magic link. There is no self-registration; members are listed in `public.members`.
- Members create, edit and delete roads, routes (OSM-routed lines, waypoints kept) and photos. Changes go live immediately for everyone, with a realtime refresh.
- Row Level Security on every table. Writes are members-only, and reads are members-only unless `atlas_settings.public_read = true`. Photos go to a private Storage bucket (JPEG/PNG/WebP, 10 MB max).
- Every change is logged in `public.edits`. **Edit → History & undo** restores any change.

Setup:

1. Create a free project on supabase.com.
2. Configure authentication:
   - Under **Authentication → Sign In / Providers**, keep Email on and **turn off "Allow new users to sign up"**.
   - Under **URL Configuration**, add your site URL (e.g. `http://localhost:3000`) to the Site URL and the Redirect URLs.
3. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL`. The last two are for local scripts only and must never be exposed to the browser.
4. Run `npm run db:setup` to apply `supabase/migrations/`. The shared atlas starts **empty**; `npm run db:seed` optionally imports the demo atlas (idempotent, never duplicates). `npm run db:reset -- --yes` backs up to `backups/` and empties the atlas again (members are kept).
5. Run `npm run invite -- friend@example.com "Name"` for each friend.
6. Run `npm run test:shared`. It runs two member sessions plus an anonymous visitor through creation and editing, photos, RLS denials, validation errors and undo, then cleans up.
