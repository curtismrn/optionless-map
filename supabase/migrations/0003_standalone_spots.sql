-- OPTIONLESS MAP — spots no longer need a road: a car park meet-up or a garage
-- can stand on its own. A spot is attached to a road, to one route, or to nothing
-- (never both a road and a route).
--
-- Idempotent: safe to run again.

do $$
declare c text;
begin
  -- 0001 required exactly one parent: (location_id is null) <> (variant_id is null)
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pois'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%<>%'
  loop
    execute format('alter table public.pois drop constraint %I', c);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'pois_one_parent_at_most') then
    alter table public.pois add constraint pois_one_parent_at_most check (location_id is null or variant_id is null);
  end if;
end $$;
