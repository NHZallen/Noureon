-- The password vault of the browser agent (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §7; Linear NOU-202).
--
-- A login of a person for some sites: the name the model sees ("GitHub"), the sites it may be filled on (https origins), and ONE sealed envelope that holds the user name and the
-- password (the server seals it with the key of that person, bound to the person and the login's id: server/key-vault.js). The model never gets a value; the server opens the
-- envelope only to hand it to the browser host, and only when the page is one of the sites. There is no policy for people on purpose: nothing reaches this table but the server
-- (the list of names and sites goes out through its routes, and never the envelope).

create table if not exists public.browser_logins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  origins text[] not null check (cardinality(origins) between 1 and 10),
  envelope text not null check (char_length(envelope) <= 12000),
  key_version integer not null check (key_version between 1 and 32000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, name)
);

create index if not exists browser_logins_user_idx on public.browser_logins (user_id);

alter table public.browser_logins enable row level security;
-- No policies on purpose: with row level security on and none given, nobody but the service role can read or write.
revoke all on table public.browser_logins from anon, authenticated;
grant select, insert, update, delete on table public.browser_logins to service_role;

comment on table public.browser_logins is 'Sealed logins of the browser agent (see server/browser-logins.js). Service role only; the envelope never leaves the server.';
