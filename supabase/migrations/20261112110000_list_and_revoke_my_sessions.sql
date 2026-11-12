-- The devices a person is signed in on, and signing one of them out (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §19).
--
-- The sign-in service keeps one row in `auth.sessions` for each device that is signed in, with the browser's User-Agent text and the address it came from. The person's role cannot read
-- that table, so two functions that answer only about the person who asks do it: one lists the devices, one signs one of them out (the row is deleted, so its refresh token stops
-- working; the short-lived access token it already holds ends by itself, within the hour, and the server of Noureon checks the sign-in service on every request).
-- The device the request comes from cannot be signed out here (that is "sign out", or "sign out of all devices", which the page does through the sign-in service). Signing a device out asks for
-- no second proof (no passkey, no authenticator code): the owner chose that, and each sign-out is mailed to the owner with the name and the address of the device.

create or replace function public.list_my_sessions()
returns table (id uuid, created_at timestamptz, last_active_at timestamptz, user_agent text, ip text, is_current boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) as last_active_at,
    s.user_agent,
    host(s.ip),
    s.id::text = coalesce((select auth.jwt() ->> 'session_id'), '') as is_current
  from auth.sessions s
  where s.user_id = (select auth.uid())
    and (s.not_after is null or s.not_after > now())
  order by 3 desc
$$;

create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not_signed_in';
  end if;
  if p_session_id::text = coalesce((select auth.jwt() ->> 'session_id'), '') then
    return false;
  end if;
  delete from auth.sessions where id = p_session_id and user_id = (select auth.uid());
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

revoke all on function public.list_my_sessions() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
