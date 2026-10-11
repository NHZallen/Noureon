-- A service may make the client we register a confidential one (Supabase does: its token endpoint wants the secret that the registration gave): the secret is kept sealed with the client.
alter table public.mcp_oauth_clients
  add column if not exists secret_envelope text,
  add column if not exists secret_key_version integer check (secret_key_version is null or secret_key_version between 1 and 32000);

comment on column public.mcp_oauth_clients.secret_envelope is 'The client secret that the registration gave and the way to send it, sealed by the server (server/key-vault.js). Null for a public client.';
