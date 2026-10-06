-- The UID (使用者代號) of an account: 8 digits, given when the account is made, never changed. It has no use yet; the User tab shows it
-- with a copy button. A person reads only their own row (the browser asks for it with the signed-in session); nobody can change one.
-- Accounts that are not signed up with an Email or Google (anonymous sign-ins) get none.

create table if not exists public.user_uids (
  user_id uuid primary key references auth.users (id) on delete cascade,
  uid text not null unique check (uid ~ '^[1-9][0-9]{7}$'),
  created_at timestamptz not null default now()
);

alter table public.user_uids enable row level security;
revoke all on table public.user_uids from anon, authenticated;
grant select on table public.user_uids to authenticated;
grant select, insert, update, delete on table public.user_uids to service_role;

drop policy if exists "Users read their own UID" on public.user_uids;
create policy "Users read their own UID" on public.user_uids
  for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.user_uids is 'The 8-digit UID of each account. Created by a trigger on auth.users; read only by its owner.';

-- A number that is nice to look at: not starting with 0, no run of four equal digits, no run of five digits going straight up or down.
create or replace function public.is_pleasant_uid(candidate text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  i integer;
  chunk text;
begin
  if candidate !~ '^[1-9][0-9]{7}$' then return false; end if;
  if candidate ~ '(\d)\1{3}' then return false; end if;
  for i in 1..4 loop
    chunk := substr(candidate, i, 5);
    if strpos('01234567890', chunk) > 0 or strpos('09876543210', chunk) > 0 then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.generate_user_uid()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  candidate text;
  attempts integer := 0;
begin
  loop
    attempts := attempts + 1;
    candidate := (10000000 + floor(random() * 90000000))::bigint::text;
    if public.is_pleasant_uid(candidate)
      and not exists (select 1 from public.user_uids where uid = candidate) then
      return candidate;
    end if;
    if attempts >= 200 then raise exception 'No free UID was found'; end if;
  end loop;
end;
$$;

-- A UID is never changed or moved to another account.
create or replace function public.keep_user_uid()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.uid is distinct from old.uid or new.user_id is distinct from old.user_id then
    raise exception 'A UID cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_user_uid on public.user_uids;
create trigger keep_user_uid
  before update on public.user_uids
  for each row execute function public.keep_user_uid();

-- Gives a new account its UID. Making the account must never fail because of this: when the UID cannot be given, the account is made
-- without one (a warning is logged) and the migration's backfill below, run again, gives it later.
create or replace function public.assign_user_uid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tries integer := 0;
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  loop
    begin
      insert into public.user_uids (user_id, uid) values (new.id, public.generate_user_uid())
        on conflict (user_id) do nothing;
      exit;
    exception when unique_violation then
      -- Two accounts picked the same free number at the same moment: pick again.
      tries := tries + 1;
      if tries >= 5 then
        raise warning 'No UID was given to %', new.id;
        exit;
      end if;
    end;
  end loop;
  return new;
exception when others then
  raise warning 'No UID was given to %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.generate_user_uid() from public, anon, authenticated;
revoke all on function public.assign_user_uid() from public, anon, authenticated;

drop trigger if exists assign_user_uid on auth.users;
create trigger assign_user_uid
  after insert on auth.users
  for each row execute function public.assign_user_uid();

-- The accounts that exist already.
do $$
declare
  account record;
begin
  for account in
    select u.id from auth.users u
    where not coalesce(u.is_anonymous, false)
      and not exists (select 1 from public.user_uids x where x.user_id = u.id)
  loop
    insert into public.user_uids (user_id, uid) values (account.id, public.generate_user_uid())
      on conflict (user_id) do nothing;
  end loop;
end;
$$;
