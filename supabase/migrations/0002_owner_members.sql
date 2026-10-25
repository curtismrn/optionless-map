-- OPTIONLESS MAP — the owner manages members from the app.
--
-- The owner invites an email from the Members panel. That writes public.invites.
-- When that person first asks for a sign-in link, Supabase Auth creates their
-- account. A trigger on auth.users turns the invite into a membership. Any
-- other email is refused by a second trigger, so opening sign-ups in Supabase
-- lets in invited people only.
--
-- Idempotent: safe to run again.

alter table public.members add column if not exists role text not null default 'member';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_role_check') then
    alter table public.members add constraint members_role_check check (role in ('owner', 'member'));
  end if;
end $$;

-- the first member becomes the owner when there is none
update public.members set role = 'owner'
where user_id = (select user_id from public.members order by added_at limit 1)
  and not exists (select 1 from public.members where role = 'owner');

create table if not exists public.invites (
  email text primary key check (email = lower(email)),
  display_name text not null check (char_length(display_name) between 1 and 40),
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid() and role = 'owner');
$$;

-- ---------------------------------------------------------------------------
-- account creation: invited emails only

create or replace function public.gate_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not exists (select 1 from public.invites where email = lower(new.email)) then
    raise exception 'This email has not been invited to the atlas' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.accept_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (user_id, email, display_name)
  select new.id, i.email, i.display_name from public.invites i where i.email = lower(new.email)
  on conflict do nothing;
  delete from public.invites where email = lower(new.email);
  return new;
end $$;

drop trigger if exists om_gate_new_user on auth.users;
create trigger om_gate_new_user before insert on auth.users for each row execute function public.gate_new_user();
drop trigger if exists om_accept_invite on auth.users;
create trigger om_accept_invite after insert on auth.users for each row execute function public.accept_invite();

-- ---------------------------------------------------------------------------
-- owner-only RPCs

create or replace function public.list_people()
returns table (email text, display_name text, role text, status text, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can manage members' using errcode = '42501'; end if;
  return query
    select m.email, m.display_name, m.role, 'member'::text, m.added_at from public.members m
    union all
    select i.email, i.display_name, 'member'::text, 'invited'::text, i.created_at from public.invites i
    order by 5;
end $$;

-- Returns 'member' when the email already has an account (access is immediate),
-- 'invited' when it will become a member at its first sign-in.
create or replace function public.invite_member(p_email text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(p_email));
  n text := nullif(trim(p_name), '');
  uid uuid;
begin
  if not public.is_owner() then raise exception 'Only the owner can manage members' using errcode = '42501'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
  n := left(coalesce(n, split_part(e, '@', 1)), 40);
  select id into uid from auth.users where lower(email) = e limit 1;
  if uid is not null then
    insert into public.members (user_id, email, display_name) values (uid, e, n)
    on conflict (user_id) do update set display_name = excluded.display_name;
    delete from public.invites where email = e;
    return 'member';
  end if;
  insert into public.invites (email, display_name, invited_by) values (e, n, auth.uid())
  on conflict (email) do update set display_name = excluded.display_name;
  return 'invited';
end $$;

create or replace function public.remove_member(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if not public.is_owner() then raise exception 'Only the owner can manage members' using errcode = '42501'; end if;
  if exists (select 1 from public.members where email = e and role = 'owner') then
    raise exception 'The owner can''t be removed' using errcode = '42501';
  end if;
  delete from public.members where email = e;
  delete from public.invites where email = e;
end $$;

revoke execute on function public.list_people(), public.invite_member(text, text), public.remove_member(text) from public, anon;
grant execute on function public.list_people(), public.invite_member(text, text), public.remove_member(text) to authenticated;
