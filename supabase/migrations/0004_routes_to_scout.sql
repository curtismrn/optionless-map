-- OPTIONLESS MAP — routes "to scout": spotted on the map, looks good, nobody has
-- driven it yet. Kept apart from driven routes in lists and drawn faintly.
--
-- Idempotent: safe to run again.

alter table public.variants add column if not exists to_scout boolean not null default false;
