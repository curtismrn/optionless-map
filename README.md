# OPTIONLESS MAP

A dark, community-built atlas of remarkable roads: passes, touge, hill-climb and rally roads. It is organized as **locations → route variants → points of interest**.

This is a runnable prototype. It does not depend on a backend: seed data is static, and contributions are stored in the visitor's browser.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (node:test)
npm run typecheck
npm run build
```

Node 23.6+ is required for `npm test`, which uses native TypeScript type stripping. The app was developed on Node 24.

## What works

| Area | Status |
|---|---|
| Globe → regional → local map (MapLibre GL v6, globe projection, 3D terrain, sky/atmosphere) | ✅ |
| Zoom-banded overlays: density heatmap + clustered location pins (global), pins with variant counts (regional), route geometry with hover/selection, labels, POIs, detected hairpins and direction chevrons (local) | ✅ |
| Location detail (variants list, activities, points, history) and variant detail (length, DEM elevation stats + interactive profile, geography, provenance, sibling-variant tabs, Route Cam) | ✅ |
| Local search over locations, variants, countries, regions, activities, tags and POIs, plus filters (activity, continent, verification, scope, media, pending) that drive both results and map | ✅ |
| Style selector: DARK, TOPOGRAPHIC (client-side contours), CLASSIC; SATELLITE when a key is configured | ✅ |
| Contribute: new variant on an existing or new location (draw, drag vertices, right-click to delete, undo, GPX import, validation, duplicate flagging, review step) | ✅ |
| Contribute: geometry correction (original kept separately), new POI (with community-nickname and privacy flags), description edit | ✅ |
| Local review queue with simulated approve/reject | ✅ (demo only) |
| Responsive layout: on phones, panels become bottom sheets | ✅ |
| Media, accounts, timing | Typed and labeled as **planned**; nothing fake is shown |

## Architecture

```
src/
  app/                 Next.js App Router shell, fonts, design tokens (globals.css)
  components/
    map/               MapView (MapLibre), styles.ts (basemaps), overlay.ts (route layers),
                       controller.ts (camera helpers)
    Atlas.tsx          layout; TopBar, ExplorePanel, DetailPanel, ContributePanel, Chrome
  lib/
    domain/schema.ts   zod schemas + types (Location, Variant, Poi, Contribution …)
    domain/future.ts   planned entities (media, vehicles, timing, verification, reports)
    repository/        AtlasRepository interface + LocalDemoRepository
    store.ts           tiny useSyncExternalStore store shared by React and the map
    geo.ts, gpx.ts, search.ts
  data/
    seed.ts            curated dataset
    generated/routes.json   built by scripts/fetch-routes.mjs
docs/postgis-schema.sql     target database schema
```

The UI talks only to `AtlasRepository`. To replace `LocalDemoRepository` with Supabase/PostGIS, implement the same interface on top of server actions or route handlers. Those should reuse the zod schemas for server-side validation and add rate limiting, auth, RLS and moderation. `docs/postgis-schema.sql` sketches the tables, including a PostGIS duplicate check.

## Map providers and environment

| Purpose | Provider | Key | Notes |
|---|---|---|---|
| Vector tiles, glyphs, CLASSIC style | [OpenFreeMap](https://openfreemap.org) | none | OSM data (ODbL), attribution shown |
| Hillshade, 3D terrain, contours | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen terrarium) | none | [Attribution list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| SATELLITE | [MapTiler](https://www.maptiler.com) `satellite-v2` | `NEXT_PUBLIC_MAPTILER_KEY` | Free tier exists; usage-limited |

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_MAPTILER_KEY` to enable SATELLITE. Without it, the option is shown as unavailable (struck through, with a tooltip), never as a disguised copy of another style. MapTiler keys are public by design, so restrict yours to your domains in the MapTiler dashboard. No secret keys are used anywhere.

OpenFreeMap and the AWS terrain bucket are free public services with no SLA. Production should self-host the tiles or move to a paid plan.

## Data and honesty rules

- **Route geometry** comes from the public OSRM demo router, which routes along OpenStreetMap roads between anchors geocoded with Nominatim (`scripts/fetch-routes.mjs`). It follows real mapped roads, but endpoints are approximate and nothing is moderator-verified. Every seed route is badged **OSM-derived · Unverified**.
- **Elevation** is sampled from the AWS DEM every 25 m and smoothed. It is labeled as an estimate, and tunnels are flagged where the DEM samples the ridge above them (Transfăgărășan).
- **Hairpin counts** come from a ≥150° turning heuristic and are explicitly not official counts.
- **Illustrative content** is badged and drawn dashed: the Ibardin hill-climb format (concept) and the "Virage de la mort" community label.
- No ratings, users, events, results, media or live counters are invented. "Featured" means editorial demo selection only.
- No drift variant was added at Ibardin: labeling a public road as a drift spot would encourage illegal activity. The data model supports drift spots for authorized venues.

To refresh the route data (rate-limited public servers, so be gentle):

```bash
npm run data:fetch                      # all routes
npm run data:fetch -- irohazaka-second  # specific ids, merged into the existing file
```

## Known limitations

- Contributions live in `localStorage`. This is not a shared database or an identity system: anyone can clear or edit it, and nobody else sees it. The approve/reject queue is a local simulation.
- User-drawn variants get no elevation stats (that needs server-side DEM processing).
- No external geocoder: search covers only the dataset.
- shadcn/ui and Motion were not added. The few primitives (button, chip, badge, field) are small local components, and CSS transitions cover the motion needs. Both libraries can be introduced later without reshaping anything.
- MapLibre v6 requires WebGL2. If it is unavailable, the app shows a clear error state.
