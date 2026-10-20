-- OPTIONLESS MAP — friends-only shared atlas (Supabase / Postgres).
--
-- Model: locations (roads) → variants (routes, own GeoJSON geometry + waypoints)
--        → pois, photos (attached to a road, a route or a point).
-- Access: invited members (rows in public.members) can read and write everything.
--         Anyone else can read only if atlas_settings.public_read = true (default false).
-- No moderation: valid changes are live immediately. Every change is logged in
-- public.edits by trigger, and public.restore_edit() rolls a row back.
--
-- Idempotent: safe to run again (create if not exists / create or replace / drop policy if exists).

-- ---------------------------------------------------------------------------
-- membership & settings

create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  display_name text not null,
  added_at timestamptz not null default now()
);

create table if not exists public.atlas_settings (
  id boolean primary key default true check (id),
  public_read boolean not null default false
);
insert into public.atlas_settings (id) values (true) on conflict (id) do nothing;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create or replace function public.can_read() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() or coalesce((select public_read from public.atlas_settings limit 1), false);
$$;

-- ---------------------------------------------------------------------------
-- validation helpers (server-side, independent of the UI)

create or replace function public.valid_lnglat(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) = 2
     and jsonb_typeof(p->0) = 'number' and jsonb_typeof(p->1) = 'number'
     and (p->>0)::float8 between -180 and 180 and (p->>1)::float8 between -90 and 90;
$$;

create or replace function public.valid_lnglat_array(a jsonb, min_len int, max_len int) returns boolean
language sql immutable as $$
  select jsonb_typeof(a) = 'array'
     and jsonb_array_length(a) between min_len and max_len
     and not exists (select 1 from jsonb_array_elements(a) e where not public.valid_lnglat(e));
$$;

create or replace function public.valid_linestring(g jsonb) returns boolean
language sql immutable as $$
  select g->>'type' = 'LineString' and public.valid_lnglat_array(g->'coordinates', 2, 20000);
$$;

-- ---------------------------------------------------------------------------
-- atlas tables (text ids keep the demo seed ids stable → re-seeding never duplicates)

create table if not exists public.locations (
  id text primary key default gen_random_uuid()::text,
  slug text not null,
  name text not null check (char_length(name) between 2 and 120),
  summary text not null default '' check (char_length(summary) <= 1000),
  countries text[] not null check (cardinality(countries) >= 1),
  regions text[] not null default '{}',
  continent text not null check (continent in ('Europe','Asia','North America','South America','Africa','Oceania')),
  center jsonb not null check (public.valid_lnglat(center)),
  tags text[] not null default '{}',
  featured boolean not null default false,
  provenance jsonb not null default '{"kind":"community","source":"Friends atlas"}',
  created_by uuid default auth.uid() references auth.users on delete set null,
  updated_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.variants (
  id text primary key default gen_random_uuid()::text,
  location_id text not null references public.locations on delete cascade,
  slug text not null,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  activity text not null check (activity in ('scenic_drive','mountain_pass','hill_climb','rally_stage','circuit','drift_spot','touge','touring','other')),
  geometry jsonb not null check (public.valid_linestring(geometry)),
  -- the points the route was drawn through (re-routed along OSM roads when edited)
  waypoints jsonb check (waypoints is null or public.valid_lnglat_array(waypoints, 2, 25)),
  elevation jsonb,
  detected_hairpins jsonb not null default '[]',
  surface text check (surface is null or char_length(surface) <= 60),
  countries text[] not null default '{}',
  regions text[] not null default '{}',
  direction text not null default 'both' check (direction in ('both','one_way','recommended')),
  direction_note text,
  verification text not null default 'unverified' check (verification in ('unverified','community_confirmed','verified')),
  provenance jsonb not null default '{"kind":"community","source":"Friends atlas"}',
  created_by uuid default auth.uid() references auth.users on delete set null,
  updated_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists variants_location_idx on public.variants (location_id);

create table if not exists public.pois (
  id text primary key default gen_random_uuid()::text,
  location_id text references public.locations on delete cascade,
  variant_id text references public.variants on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  community_label boolean not null default false,
  coordinates jsonb not null check (public.valid_lnglat(coordinates)),
  category text not null,
  description text not null default '' check (char_length(description) <= 600),
  provenance jsonb not null default '{"kind":"community","source":"Friends atlas"}',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((location_id is null) <> (variant_id is null))
);

create table if not exists public.photos (
  id text primary key default gen_random_uuid()::text,
  location_id text references public.locations on delete cascade,
  variant_id text references public.variants on delete cascade,
  poi_id text references public.pois on delete cascade,
  source text not null check (source in ('upload','commons')),
  -- upload: object path in the private "photos" bucket; commons: external URLs
  storage_path text,
  thumb_path text,
  url text,
  thumb_url text,
  title text not null default '',
  caption text not null default '' check (char_length(caption) <= 500),
  credit text not null default '' check (char_length(credit) <= 120),
  license text not null default 'All rights reserved',
  license_url text,
  source_url text,
  captured_at date,
  width int,
  height int,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(location_id, variant_id, poi_id) = 1),
  check ((source = 'upload' and storage_path is not null) or (source = 'commons' and url is not null))
);
create index if not exists photos_location_idx on public.photos (location_id);
create index if not exists photos_variant_idx on public.photos (variant_id);

-- ---------------------------------------------------------------------------
-- edit history + rollback

create table if not exists public.edits (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('insert','update','delete','restore')),
  before jsonb,
  after jsonb,
  actor uuid,
  actor_name text,
  at timestamptz not null default now()
);
create index if not exists edits_at_idx on public.edits (at desc);

create or replace function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid())); end if;
  return new;
end $$;

create or replace function public.log_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid := auth.uid();
  label text;
  act text := lower(tg_op);
begin
  -- direct DB sessions (migrations, seeding) have no JWT: not user edits, not logged
  if who is null then return coalesce(new, old); end if;
  select display_name into label from public.members where user_id = who;
  if current_setting('optionless.restoring', true) = 'on' then act := 'restore'; end if;
  insert into public.edits (table_name, row_id, action, before, after, actor, actor_name)
  values (tg_table_name, coalesce(new.id, old.id), act,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          who, label);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['locations','variants','pois','photos'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_row()', t, t);
    execute format('drop trigger if exists %I_log on public.%I', t, t);
    execute format('create trigger %I_log after insert or update or delete on public.%I for each row execute function public.log_edit()', t, t);
  end loop;
end $$;

-- Put a row back to its state before an edit (undo an insert = delete; undo update/delete = upsert old row).
-- Runs as the caller, so RLS still requires membership.
create or replace function public.restore_edit(edit_id bigint) returns void
language plpgsql security invoker set search_path = public as $$
declare e public.edits;
begin
  if not public.is_member() then raise exception 'Only members can restore edits' using errcode = '42501'; end if;
  select * into e from public.edits where id = edit_id;
  if not found then raise exception 'Edit % not found', edit_id; end if;
  if e.table_name not in ('locations','variants','pois','photos') then raise exception 'Unsupported table'; end if;
  perform set_config('optionless.restoring', 'on', true);
  if e.before is null then
    execute format('delete from public.%I where id = $1', e.table_name) using e.row_id;
  else
    execute format(
      'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)
       on conflict (id) do update set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1))',
      e.table_name,
      (select string_agg(quote_ident(column_name), ',') from information_schema.columns
        where table_schema = 'public' and table_name = e.table_name and column_name <> 'id')
    ) using e.before;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security

alter table public.members enable row level security;
alter table public.atlas_settings enable row level security;
alter table public.locations enable row level security;
alter table public.variants enable row level security;
alter table public.pois enable row level security;
alter table public.photos enable row level security;
alter table public.edits enable row level security;

drop policy if exists "members visible to members" on public.members;
create policy "members visible to members" on public.members for select using (public.is_member());

drop policy if exists "settings readable" on public.atlas_settings;
create policy "settings readable" on public.atlas_settings for select using (true);

do $$
declare t text;
begin
  foreach t in array array['locations','variants','pois','photos'] loop
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select using (public.can_read())', t);
    execute format('drop policy if exists "members insert" on public.%I', t);
    execute format('create policy "members insert" on public.%I for insert with check (public.is_member())', t);
    execute format('drop policy if exists "members update" on public.%I', t);
    execute format('create policy "members update" on public.%I for update using (public.is_member()) with check (public.is_member())', t);
    execute format('drop policy if exists "members delete" on public.%I', t);
    execute format('create policy "members delete" on public.%I for delete using (public.is_member())', t);
  end loop;
end $$;

drop policy if exists "history visible to members" on public.edits;
create policy "history visible to members" on public.edits for select using (public.is_member());
-- no insert/update/delete policies on edits: only the security-definer trigger writes there

-- members and settings are managed with the service role (scripts/invite.mjs), never from the browser
revoke insert, update, delete on public.members, public.atlas_settings, public.edits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, images only, 10 MB max

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select using (bucket_id = 'photos' and public.can_read());
drop policy if exists "photos insert" on storage.objects;
create policy "photos insert" on storage.objects for insert with check (bucket_id = 'photos' and public.is_member());
drop policy if exists "photos update" on storage.objects;
create policy "photos update" on storage.objects for update using (bucket_id = 'photos' and public.is_member());
drop policy if exists "photos delete" on storage.objects;
create policy "photos delete" on storage.objects for delete using (bucket_id = 'photos' and public.is_member());

-- ---------------------------------------------------------------------------
-- Realtime: members' browsers refresh when someone else saves

do $$
declare t text;
begin
  foreach t in array array['locations','variants','pois','photos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
