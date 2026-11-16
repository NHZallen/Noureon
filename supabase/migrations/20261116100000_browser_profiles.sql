-- The login state of the browser agent (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §8.1; Linear NOU-204, contract v2).
--
-- One sealed archive of a browser's profile (cookies, local storage…) for each person, kept in the private bucket `browser-profiles` at `<person>/profile.bin`.
-- The server seals it with the key of that person (server/key-vault.js, purpose `browser-profile`) before it leaves the server, and opens it only to hand it
-- to a browser of the same person. A person may read the plain facts of their own row (when, how big); nobody but the server writes it, and the bucket has
-- no policy for people at all (only the service key reaches it). The row is NOT added to the realtime publication.

create table if not exists public.browser_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  object_path text not null check (object_path = user_id::text || '/profile.bin'),
  size_bytes bigint not null check (size_bytes between 0 and 167772160),
  key_version smallint not null check (key_version >= 1),
  -- Sites whose login must be removed the next time a browser starts (logged out or password deleted on the screen before a browser was running).
  pending_clear text[] not null default '{}'::text[] check (cardinality(pending_clear) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A profile that is not used for 14 days is removed by the server (row and file together).
  last_used_at timestamptz not null default now()
);

create index if not exists browser_profiles_last_used_idx on public.browser_profiles(last_used_at);

alter table public.browser_profiles enable row level security;

drop policy if exists "People read the facts of their own browser profile" on public.browser_profiles;
create policy "People read the facts of their own browser profile"
on public.browser_profiles for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.browser_profiles from anon, authenticated;
grant select (user_id, size_bytes, pending_clear, updated_at, last_used_at) on public.browser_profiles to authenticated;
-- The server writes and reads it with the service key; the project does not give that role the table by itself (seen on the test project: REFERENCES, TRIGGER and TRUNCATE only, so every read and write answered 42501).
grant select, insert, update, delete on public.browser_profiles to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('browser-profiles', 'browser-profiles', false, 167772160, array['application/octet-stream'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.browser_profiles is 'Facts about the sealed login state of the browser agent of one person. The archive is in the private bucket browser-profiles; only the server reads or writes either.';
