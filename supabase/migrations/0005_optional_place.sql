-- OPTIONLESS MAP — a route "to scout" can stand alone, without a road: you spot
-- a promising line on the map before knowing where it belongs. Driven routes
-- still always belong to a road.
--
-- Idempotent: safe to run again.

alter table public.variants alter column location_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'variants_road_unless_to_scout') then
    alter table public.variants add constraint variants_road_unless_to_scout check (location_id is not null or to_scout);
  end if;
end $$;
