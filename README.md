# OPTIONLESS MAP

A living atlas of remarkable roads (mountain passes, touge, rally and hill-climb roads) and the people who know them.

Most visitors come to **discover** roads, look at their **photos and onboard clips**, and **share their own**. Suggesting a missing road is a secondary, reviewed workflow. The trusted road database (locations → route variants → points of interest) is the foundation that community media hangs from.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (node:test, Node 23.6+)
npm run typecheck
npm run build
```

## The core journey

1. Open the map: a globe with road pins, media counts and a density glow. The **Discover** panel offers regions, *Near me* (geolocation), featured roads, latest photos & clips, roads in the current view and all roads.
2. Select a road. Its route lines highlight on the map, and the road page opens on a cover photo with **Add photo or clip** as the primary action.
3. Browse the **Photos & clips** tab, or swipe through the full-screen viewer (keyboard and swipe). Each item shows credit, licence, source, and actions to *Report* or jump back to the road.
4. Open a route variant (e.g. Stelvio's Prato ramp) for its own media, distance, DEM climb and an interactive elevation profile, plus **Route cam**, a pitched 3D terrain view along the road.
5. Optional, under **Contribute** (a discreet menu): suggest a missing road, fix a route line, add a point, or report a problem.

On phones, the road page is a draggable bottom sheet (peek / half / full) so the map stays visible. The explorer is a separate drawer.

## What genuinely works vs. what is mocked

| Feature | Status |
|---|---|
| Globe → regional → terrain map, 3 basemaps (+ satellite with a key), route highlighting, Route cam | **Works** |
| 15 route variants on 8 roads with road-following OSM geometry, DEM elevation stats and profiles | **Works** (seed data, OSM-derived, *unverified*) |
| 75 seed photos + 4 clips from **Wikimedia Commons**, attached to roads (and to specific Stelvio ramps) with author, licence and source link | **Works.** Real, openly licensed files, hot-linked from Commons |
| Search (roads, routes, countries, regions, activities, tags, points) and filters, including a working *Has media* filter | **Works** (local dataset only, no geocoder) |
| Add a photo or clip to an existing road or variant (drag & drop, preview, caption, credit, licence, date, rights confirmation). Photos are re-encoded on-device to strip EXIF/GPS. Clips ≤ 90 s / 80 MB | **Works, stored in this browser only** (IndexedDB) |
| Suggest a missing road: waypoints **routed along OSM roads** (OSRM), drag/undo/remove, GPX import, validation, duplicate flagging | **Works.** Submissions are local and *pending review* |
| Fix a route line (original kept separately from the proposal), add a point, edit text, report (road / route / point / media) | **Works.** Local and *pending review* |
| Unapproved suggestions are kept out of the main atlas. The submitter sees them in *My submissions* and via *Show my pending suggestions* | **Works** |
| Review / approve / reject, accounts, trusted-contributor roles | **Not implemented, deliberately.** It needs a backend. The prototype shows statuses and never fakes moderation |
| Sharing media with other visitors, persistence across devices | **Needs a backend** (object storage + auth + moderation) |

### Trust model

- **Atlas record**: curated road data (the seed). Geometry is OSM-derived and still marked *unverified* until a moderator confirms it.
- **Suggestion**: anything a visitor proposes about roads (new road or route, line fix, point, text). It enters as *pending review* and doesn't join the main atlas until approved.
- **Media**: publishes immediately because it doesn't alter the road record. It is reportable for copyright, private location, unsafe/illegal driving, and similar reasons.

## Road geometry

- **Seed routes** come from `scripts/fetch-routes.mjs`, which routes between OSM-geocoded anchors with OSRM, simplifies the result, samples elevation, and detects hairpins. Straight segments in the data are tunnels (e.g. the 884 m Capra–Bâlea tunnel on the Transfăgărășan), where the DEM also over-reads; this is flagged in the UI.
- **Contributor suggestions** use `src/lib/routing.ts`, which routes the placed waypoints along OSM roads. Set `NEXT_PUBLIC_OSRM_URL` to a self-hosted OSRM. The public demo server is fair-use only. If routing fails, the line falls back to straight segments, labeled "straight lines" in amber. GPX tracks are kept as recorded.
- Map sources use a low GeoJSON simplification tolerance, so winding passes don't collapse into straight chords at regional zoom levels.

## Architecture

```
src/
  app/                     Next.js App Router shell, fonts, design tokens
  components/
    map/                   MapView (MapLibre GL 6), styles, overlay layers, camera controller
    media/                 MediaGallery (strip/grid), Lightbox, AddMediaPanel
    Atlas.tsx              layout; TopBar (Contribute menu), ExplorePanel (Discover),
                           DetailPanel (road/route/point pages), ContributePanel, PanelShell (mobile sheet),
                           SnapEngine (keeps drafts road-snapped)
  lib/
    domain/schema.ts       zod schemas: Location, Variant, Poi, MediaItem, Contribution (+ reports)
    repository/            AtlasRepository interface, LocalDemoRepository, localMedia (IndexedDB)
    routing.ts, media.ts, search.ts, geo.ts, gpx.ts, store.ts
  data/
    seed.ts                curated roads
    generated/routes.json  scripts/fetch-routes.mjs
    generated/media.json   scripts/fetch-media.mjs + scripts/curate-media.mjs
docs/postgis-schema.sql    target database schema
```

Components only talk to `AtlasRepository`. A Supabase-backed implementation would provide:

- `submitContribution`: insert into `contributions` (pending) via a server action, with zod validation, rate limiting and captcha for anonymous users.
- `addMedia`: upload to Storage (strip metadata server-side as well), insert into `media_items`, and run automated checks.
- A moderator UI with roles (RLS) that approves suggestions into `variants` / `locations`, keeping original geometry for corrections.

## Providers and environment

| Purpose | Provider | Key |
|---|---|---|
| Vector tiles, glyphs, CLASSIC style | [OpenFreeMap](https://openfreemap.org) (OSM, ODbL) | none |
| Hillshade, 3D terrain, contours | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | none |
| SATELLITE | [MapTiler](https://www.maptiler.com) | `NEXT_PUBLIC_MAPTILER_KEY` |
| Road-following suggestions | [OSRM](https://project-osrm.org) public demo | `NEXT_PUBLIC_OSRM_URL` (optional) |
| Seed photos & clips | [Wikimedia Commons](https://commons.wikimedia.org) (per-file licences) | none |

See `.env.example`. Without a MapTiler key, SATELLITE is shown as unavailable. The public demo services have no SLA, so self-host for production.

Refresh the data (both scripts are slow on purpose to respect rate limits):

```bash
npm run data:fetch    # routes + elevation
npm run data:media    # Commons media, then the editorial curation pass
```

## Honesty rules

- No invented ratings, users, events, results or activity. "Featured" is an editorial demo flag.
- Seed media are real Commons files with attribution. Off-topic files (playgrounds, memorials, power plants, maps) are curated out in `scripts/curate-media.mjs`.
- Concept content (the Ibardin hill-climb format, the "Virage de la mort" nickname) is labeled *illustrative*.
- No drift or racing spots are labeled on public roads. Competitive timing is scoped to authorized venues (`src/lib/domain/future.ts`).
