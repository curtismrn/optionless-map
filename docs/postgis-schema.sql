-- OPTIONLESS MAP — target PostgreSQL/PostGIS schema (sketch, not yet applied).
-- Mirrors src/lib/domain/schema.ts. Intended for Supabase (auth.users for identity,
-- RLS for access, Storage for media objects).

create extension if not exists postgis;

create type publication_status as enum ('draft','pending_review','published','rejected','archived','reported');
create type verification_status as enum ('unverified','community_confirmed','verified');
create type provenance_kind as enum ('osm','community','demo','illustrative');
create type activity_type as enum ('scenic_drive','mountain_pass','hill_climb','rally_stage','circuit','drift_spot','touge','touring','other');

create table locations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  summary text not null default '',
  countries char(2)[] not null,              -- several = border location
  regions text[] not null default '{}',
  continent text not null,
  center geography(Point, 4326) not null,
  boundary geography(Polygon, 4326),
  tags text[] not null default '{}',
  featured boolean not null default false,   -- editorial flag, never a popularity signal
  publication publication_status not null default 'pending_review',
  provenance_kind provenance_kind not null,
  provenance_source text not null,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on locations using gist (center);

create table variants (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  activity activity_type not null,
  geom geography(LineString, 4326) not null,
  length_m double precision generated always as (ST_Length(geom)) stored,
  elevation jsonb,                           -- gain/loss/min/max/profile + source, computed server-side
  surface text,
  countries char(2)[] not null,
  regions text[] not null default '{}',
  direction text not null check (direction in ('both','one_way','recommended')),
  direction_note text,
  verification verification_status not null default 'unverified',
  publication publication_status not null default 'pending_review',
  provenance_kind provenance_kind not null,
  provenance_source text not null,
  provenance_license text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, slug)
);
create index on variants using gist (geom);

create table pois (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations on delete cascade,
  variant_id uuid references variants on delete cascade,
  name text not null,
  community_label boolean not null default false,
  geom geography(Point, 4326) not null,
  category text not null,
  description text not null default '',
  publication publication_status not null default 'pending_review',
  provenance_kind provenance_kind not null,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  check ((location_id is null) <> (variant_id is null))
);
create index on pois using gist (geom);

-- Every change arrives as a contribution; originals are never overwritten in place.
create table contributions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_variant','geometry_correction','new_poi','description_edit','report')),
  status publication_status not null default 'pending_review',
  target_variant_id uuid references variants,
  target_location_id uuid references locations,
  payload jsonb not null,                    -- validated with the same zod schemas server-side
  original_geom geography(LineString, 4326), -- snapshot for corrections
  proposed_geom geography(LineString, 4326),
  possible_duplicates uuid[] not null default '{}',
  note text,
  submitted_by uuid references auth.users,   -- null = anonymous (rate-limited by IP/captcha)
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  review_reason text
);

-- Duplicate check used at submission time (flag only, never auto-merge):
--   select id from variants
--   where ST_DWithin(geom, $1, 40)
--     and ST_Length(ST_Intersection(ST_Buffer(geom, 40), $1::geography)) / ST_Length($1) > 0.6;

-- Photos & clips attached to a road, a variant or a point. Published immediately
-- (they never alter the road record) but reportable; storage_key points at Supabase Storage.
create table media_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations on delete cascade,
  variant_id uuid references variants on delete cascade,
  poi_id uuid references pois on delete cascade,
  kind text not null check (kind in ('photo','clip')),
  storage_key text not null,
  thumbnail_key text,
  caption text not null default '',
  credit text not null,
  license text not null,
  captured_at date,
  status text not null default 'published' check (status in ('published','reported','removed')),
  uploaded_by uuid references auth.users,
  created_at timestamptz not null default now(),
  check (num_nonnulls(location_id, variant_id, poi_id) = 1)
);

-- Future: vehicle_profiles, timed_sessions, timing_records,
-- verification_records, moderation_reports — see src/lib/domain/future.ts.
