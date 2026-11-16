-- The invite codes of the browser agent (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §9; Linear NOU-202).
--
-- Each person who may use the browser agent has two codes to give away; a person who redeems one may use the browser agent and gets two codes of their own. A code is used once and has no end date.
-- Nothing here is reached by a person directly: the server (service role) reads and writes both tables, and the page asks the server's routes.

create table if not exists public.browser_invites (
  code text primary key check (code ~ '^[A-Z0-9-]{8,24}$'),
  owner_id uuid references auth.users (id) on delete set null,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists browser_invites_owner_idx on public.browser_invites (owner_id);
-- A person redeems one code only (the second one would only be a way to collect codes).
create unique index if not exists browser_invites_redeemed_by_idx on public.browser_invites (redeemed_by) where redeemed_by is not null;

create table if not exists public.browser_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  via_code text,
  created_at timestamptz not null default now()
);

alter table public.browser_invites enable row level security;
alter table public.browser_access enable row level security;
revoke all on table public.browser_invites from anon, authenticated;
revoke all on table public.browser_access from anon, authenticated;
grant select, insert, update, delete on table public.browser_invites to service_role;
grant select, insert, update, delete on table public.browser_access to service_role;

comment on table public.browser_invites is 'Invite codes of the browser agent (server/browser-invites.js). Service role only.';
comment on table public.browser_access is 'Who may use the browser agent through an invite code (server/browser-invites.js). Service role only.';
