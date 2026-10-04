-- The secure credentials (安全憑證) of the CLI tools: a login a tool needs (an auth token, a cookie), kept encrypted for the person.
-- The server seals each value with its master key (AES-256-GCM, bound to the person and the credential's name) and puts it in a tool's
-- environment only while a command runs. The browser reads and writes them through the server (never this table), so no policy lets
-- a signed-in person reach a row: only the service role does.

create table if not exists public.user_credentials (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  envelope text not null check (char_length(envelope) <= 12000),
  key_version integer not null check (key_version between 1 and 32000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

alter table public.user_credentials enable row level security;
-- No policies on purpose: with row level security on and none given, nobody but the service role can read or write.
revoke all on table public.user_credentials from anon, authenticated;
grant select, insert, update, delete on table public.user_credentials to service_role;

comment on table public.user_credentials is 'Encrypted secure credentials of CLI tools (see server/cli-credentials.js). Service role only.';
