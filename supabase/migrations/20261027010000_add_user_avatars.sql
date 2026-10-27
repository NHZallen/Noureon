-- The picture of an account (頭像, docs/superpowers/specs/2026-10-27-user-avatar-design.md): a person can put their own round picture in the User tab; it shows in the
-- left menu under the list and in the User tab. The picture is one small file (256 by 256, webp) in the private bucket `user-avatars`, always at
-- `<person>/avatar.webp` (a new one replaces the old one), and the row of the person in `user_profiles` says whether there is one and which version, so that
-- every device knows when to fetch it again. A person with no row (or no path) has the default: the photo of their Google account when they signed in
-- with Google, else the first letter of their name (the page decides; nothing is kept for it here).
-- A person reads and changes only their own row and their own file.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  avatar_path text check (avatar_path is null or avatar_path = user_id::text || '/avatar.webp'),
  avatar_version integer not null default 0 check (avatar_version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
revoke all on table public.user_profiles from anon, authenticated;
grant select, insert, update, delete on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.user_profiles to service_role;

drop policy if exists "Users read their own profile" on public.user_profiles;
create policy "Users read their own profile" on public.user_profiles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users add their own profile" on public.user_profiles;
create policy "Users add their own profile" on public.user_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users change their own profile" on public.user_profiles;
create policy "Users change their own profile" on public.user_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users delete their own profile" on public.user_profiles;
create policy "Users delete their own profile" on public.user_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.user_profiles is 'What a person chooses to show: the picture (path and version). Read and changed only by its owner.';

-- Every write counts as a new version (the picture file at the same path may have changed under it), and the time is the database's.
create or replace function public.touch_user_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.avatar_version := greatest(1, coalesce(new.avatar_version, 0));
  else
    new.avatar_version := old.avatar_version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_user_profile on public.user_profiles;
create trigger touch_user_profile
  before insert or update on public.user_profiles
  for each row execute function public.touch_user_profile();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-avatars', 'user-avatars', false, 524288, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A person's file has exactly one name: `<own id>/avatar.webp` (so no other folder, no other name, no `..` parts).
drop policy if exists "Users read their own avatar" on storage.objects;
create policy "Users read their own avatar"
on storage.objects for select to authenticated
using (bucket_id = 'user-avatars' and name = (select auth.uid())::text || '/avatar.webp');

drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'user-avatars' and name = (select auth.uid())::text || '/avatar.webp');

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'user-avatars' and name = (select auth.uid())::text || '/avatar.webp')
with check (bucket_id = 'user-avatars' and name = (select auth.uid())::text || '/avatar.webp');

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'user-avatars' and name = (select auth.uid())::text || '/avatar.webp');

-- The files nothing points to any more (an account deleted takes its row, not its file; a picture removed whose file could not be deleted), older than
-- `p_older_than` (a file is uploaded a little before the row says so). For the server (service role only), which removes them through the storage API once a day
-- (server/asset-sweeper.js; only reported until the environment says ASSET_SWEEP=delete).
create or replace function public.orphan_user_avatars(p_older_than interval default interval '1 day', p_limit integer default 500)
returns table (name text, size bigint, touched_at timestamptz)
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select o.name::text, (o.metadata->>'size')::bigint, greatest(o.created_at, o.updated_at)
  from storage.objects o
  where o.bucket_id = 'user-avatars'
    and greatest(o.created_at, o.updated_at) < now() - p_older_than
    and not exists (select 1 from public.user_profiles p where p.avatar_path = o.name)
  order by o.created_at
  limit greatest(1, least(p_limit, 5000));
$$;

revoke all on function public.orphan_user_avatars(interval, integer) from public, anon, authenticated;
grant execute on function public.orphan_user_avatars(interval, integer) to service_role;
