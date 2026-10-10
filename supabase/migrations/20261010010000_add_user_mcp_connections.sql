-- The connections of a person to the connectors (連接器, MCP): the login tokens (sealed by the server with its master key, bound to the person and the
-- connector), the list of the service's tools with a fingerprint of each, and what the person lets each tool do. The browser reads and changes all of it
-- through the server (never this table), so no policy lets a signed-in person reach a row: only the service role does.
-- docs/superpowers/specs/2026-10-10-mcp-connectors-design.md, §5.3.

create table if not exists public.user_mcp_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  connector_id text not null check (connector_id ~ '^[a-z][a-z0-9-]{1,31}$'),
  -- 'pending' (a login was begun), 'connected', or 'needs_login' (the service refused the token: the person must log in again).
  status text not null default 'pending' check (status in ('pending', 'connected', 'needs_login')),
  mode text not null default 'readwrite' check (mode in ('readonly', 'readwrite')),
  -- The sealed tokens: { accessToken, refreshToken, expiresAt, clientId, clientSecret }.
  envelope text check (envelope is null or char_length(envelope) <= 20000),
  key_version integer check (key_version is null or key_version between 1 and 32000),
  scope text,
  -- A login that has begun and is waiting for the service to send the person back: the hash of its state, and the sealed PKCE verifier.
  state_hash text,
  pending_envelope text check (pending_envelope is null or char_length(pending_envelope) <= 4000),
  pending_key_version integer check (pending_key_version is null or pending_key_version between 1 and 32000),
  pending_at timestamptz,
  -- The service's tools as last seen: [{ name, description, inputSchema, kind, hash }]; `changed`: the names that are new or changed since the person saw them.
  tools jsonb not null default '[]'::jsonb,
  changed jsonb not null default '[]'::jsonb,
  tools_checked_at timestamptz,
  -- What the person set: { toolName: 'allow' | 'ask' | 'deny' } (only what differs from the default).
  permissions jsonb not null default '{}'::jsonb,
  last_error text check (last_error is null or char_length(last_error) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, connector_id)
);

create index if not exists user_mcp_connections_state_hash_idx on public.user_mcp_connections (state_hash) where state_hash is not null;

alter table public.user_mcp_connections enable row level security;
-- No policies on purpose: with row level security on and none given, nobody but the service role can read or write.
revoke all on table public.user_mcp_connections from anon, authenticated;
grant select, insert, update, delete on table public.user_mcp_connections to service_role;

comment on table public.user_mcp_connections is 'Logins and tool permissions of the connectors (see server/mcp/connections.js). Service role only.';

-- The clients that a service registered for us (dynamic registration): one registration serves every person.
create table if not exists public.mcp_oauth_clients (
  key text primary key check (char_length(key) <= 400),
  client_id text not null check (char_length(client_id) <= 400),
  created_at timestamptz not null default now()
);

alter table public.mcp_oauth_clients enable row level security;
revoke all on table public.mcp_oauth_clients from anon, authenticated;
grant select, insert, update, delete on table public.mcp_oauth_clients to service_role;

comment on table public.mcp_oauth_clients is 'Client ids that connectors gave us by dynamic registration. Service role only.';
