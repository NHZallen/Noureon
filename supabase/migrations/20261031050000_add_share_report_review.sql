-- What happens to a report of a shared conversation (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §11).
--
--   a share with reports from 3 different readers is paused (`suspended`): its link stops working at once, the snapshot and the files are kept so the owner of the service can look at it
--   the server mails what was reported (server_take_share_reports_to_mail: each report is taken once)
--   server_requeue_share_reports        a mail that could not be sent: its reports go back to the queue
--   service_admins                      who may review reports: the owner of the service adds their own account by hand, e.g.
--                                         insert into public.service_admins (user_id) select id from auth.users where email = '<the email of the account>';
--   is_service_admin()                  true for such an account
--   admin_list_share_reports()          the shares that have reports, with the owner's email and what was said
--   admin_set_share_status(id, status)  pause a share or let it work again (a restored share starts again with no reports)
--   admin_dismiss_share_reports(id)     the reports were looked at and need nothing
--   admin_delete_share(id)              take a share away for good (its files are removed by the clean-up)
--   admin_get_shared_conversation(code) the snapshot of a share whatever its status, to read it before deciding
-- A reader is counted by a one-way fingerprint of the network address (with the share's id), so that one person cannot pause a share by sending three reports.

alter table public.conversation_shares drop constraint if exists conversation_shares_status_check;
alter table public.conversation_shares add constraint conversation_shares_status_check
  check (status in ('building', 'active', 'suspended', 'conversation_deleted'));

alter table public.share_reports add column if not exists reporter_hash text not null default '';
alter table public.share_reports add column if not exists notified_at timestamptz;
create index if not exists share_reports_unmailed_idx on public.share_reports (created_at) where notified_at is null;

create table if not exists public.service_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.service_admins enable row level security;
revoke all on table public.service_admins from public, anon, authenticated;
grant all on table public.service_admins to service_role;
comment on table public.service_admins is 'The accounts that may review reports of shared conversations. Filled by hand by the owner of the service.';

create or replace function public.is_service_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.service_admins where user_id = (select auth.uid()));
$$;

-- ---------- a report

create or replace function public.report_shared_conversation(p_code text, p_reason text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.conversation_shares;
  v_headers json;
  v_address text := '';
  v_readers integer;
begin
  select * into v_share from public.conversation_shares where code = p_code and status = 'active';
  if not found then
    return false;
  end if;
  -- A share does not need more than a few hundred reports to be looked at.
  if (select count(*) from public.share_reports where share_id = v_share.id) >= 300 then
    return true;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  if v_headers is not null then
    v_address := trim(split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1));
  end if;
  insert into public.share_reports (share_id, code, reason, reporter_hash)
  values (v_share.id, v_share.code, left(coalesce(p_reason, ''), 500), md5(v_share.id::text || ':' || v_address));
  select count(distinct reporter_hash) into v_readers from public.share_reports where share_id = v_share.id;
  if v_readers >= 3 then
    update public.conversation_shares set status = 'suspended', updated_at = now() where id = v_share.id and status = 'active';
  end if;
  return true;
end;
$$;

-- ---------- what the person sees of their own shares (a paused one is listed, with its status)

create or replace function public.list_my_conversation_shares()
returns table (id uuid, conversation_id uuid, code text, mode text, show_name boolean, title text, status text, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.conversation_id, s.code, s.mode, s.show_name, s.title, s.status, s.created_at, s.updated_at
  from public.conversation_shares s
  where s.owner_id = (select auth.uid()) and s.status in ('active', 'suspended', 'conversation_deleted')
  order by s.created_at desc;
$$;

-- ---------- a paused share keeps its files, and goes with its conversation like the others

create or replace function public.orphan_shared_assets(p_limit integer default 500)
returns table (name text, size bigint)
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select o.name::text, (o.metadata->>'size')::bigint
  from storage.objects o
  where o.bucket_id = 'shared-assets'
    and not exists (
      select 1 from public.conversation_shares s
      where s.id::text = (storage.foldername(o.name))[1] and s.status in ('active', 'building', 'suspended')
    )
  limit greatest(1, least(p_limit, 5000));
$$;

create or replace function public.conversation_shares_follow_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goes boolean := false;
begin
  if tg_op = 'DELETE' then
    v_goes := true;
  elsif new.deleted_at is not null and old.deleted_at is null then
    v_goes := true;
  end if;
  if v_goes then
    update public.conversation_shares
    set status = 'conversation_deleted', snapshot = '{}'::jsonb, snapshot_bytes = 0, updated_at = now()
    where owner_id = old.user_id and conversation_id = old.id and status in ('active', 'building', 'suspended');
  end if;
  return null;
end;
$$;

-- ---------- for the server: the reports not yet mailed (each is taken once)

create or replace function public.server_take_share_reports_to_mail(p_limit integer default 50)
returns table (share_id uuid, code text, title text, mode text, status text, owner_id uuid, readers integer, new_reports integer, reasons jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    update public.share_reports r
    set notified_at = now()
    where r.id in (select x.id from public.share_reports x where x.notified_at is null order by x.created_at limit greatest(1, least(p_limit, 500)))
    returning r.share_id, r.reason, r.created_at
  ), grouped as (
    select p.share_id, count(*)::integer as new_reports,
           coalesce(jsonb_agg(p.reason order by p.created_at desc) filter (where p.reason <> ''), '[]'::jsonb) as reasons
    from picked p group by p.share_id
  )
  select g.share_id, s.code, s.title, s.mode, s.status, s.owner_id,
         (select count(distinct x.reporter_hash)::integer from public.share_reports x where x.share_id = g.share_id),
         g.new_reports, g.reasons
  from grouped g left join public.conversation_shares s on s.id = g.share_id;
end;
$$;

-- A mail that could not be sent: the reports taken for it go back to the queue.
create or replace function public.server_requeue_share_reports(p_share_ids uuid[], p_since timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.share_reports set notified_at = null where share_id = any(p_share_ids) and notified_at >= p_since;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------- for the owner of the service

create or replace function public.admin_list_share_reports()
returns table (share_id uuid, code text, title text, mode text, status text, owner_id uuid, owner_email text, readers integer, total_reports integer, last_report_at timestamptz, reasons jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_service_admin() then
    raise exception 'Not allowed';
  end if;
  return query
  select s.id, s.code, s.title, s.mode, s.status, s.owner_id, u.email::text,
         (select count(distinct r.reporter_hash)::integer from public.share_reports r where r.share_id = s.id),
         (select count(*)::integer from public.share_reports r where r.share_id = s.id),
         (select max(r.created_at) from public.share_reports r where r.share_id = s.id),
         coalesce((select jsonb_agg(z.reason order by z.created_at desc) from (select r.reason, r.created_at from public.share_reports r where r.share_id = s.id and r.reason <> '' order by r.created_at desc limit 10) z), '[]'::jsonb)
  from public.conversation_shares s
  left join auth.users u on u.id = s.owner_id
  where exists (select 1 from public.share_reports r where r.share_id = s.id) or s.status = 'suspended'
  order by (s.status = 'suspended') desc, 10 desc nulls last;
end;
$$;

create or replace function public.admin_set_share_status(p_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not public.is_service_admin() then
    raise exception 'Not allowed';
  end if;
  if p_status = 'suspended' then
    update public.conversation_shares set status = 'suspended', updated_at = now() where id = p_id and status = 'active';
  elsif p_status = 'active' then
    update public.conversation_shares set status = 'active', updated_at = now() where id = p_id and status = 'suspended';
  else
    raise exception 'Unknown status';
  end if;
  get diagnostics v_rows = row_count;
  -- A share that works again starts with no reports against it.
  if v_rows = 1 and p_status = 'active' then
    delete from public.share_reports where share_id = p_id;
  end if;
  return v_rows = 1;
end;
$$;

create or replace function public.admin_dismiss_share_reports(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not public.is_service_admin() then
    raise exception 'Not allowed';
  end if;
  delete from public.share_reports where share_id = p_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.admin_delete_share(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not public.is_service_admin() then
    raise exception 'Not allowed';
  end if;
  delete from public.conversation_shares where id = p_id;
  get diagnostics v_rows = row_count;
  delete from public.share_reports where share_id = p_id;
  return v_rows = 1;
end;
$$;

create or replace function public.admin_get_shared_conversation(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.is_service_admin() then
    raise exception 'Not allowed';
  end if;
  select jsonb_build_object('title', s.title, 'mode', s.mode, 'ownerName', nullif(s.owner_name, ''), 'status', s.status, 'createdAt', s.created_at, 'updatedAt', s.updated_at, 'snapshot', s.snapshot)
  into v_out
  from public.conversation_shares s
  where s.code = p_code and s.status in ('active', 'suspended');
  return v_out;
end;
$$;

-- ---------- who may call what

revoke all on function public.is_service_admin() from public, anon;
revoke all on function public.admin_list_share_reports() from public, anon;
revoke all on function public.admin_set_share_status(uuid, text) from public, anon;
revoke all on function public.admin_dismiss_share_reports(uuid) from public, anon;
revoke all on function public.admin_delete_share(uuid) from public, anon;
revoke all on function public.admin_get_shared_conversation(text) from public, anon;
revoke all on function public.server_take_share_reports_to_mail(integer) from public, anon, authenticated;
revoke all on function public.server_requeue_share_reports(uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.report_shared_conversation(text, text) from public;
revoke all on function public.list_my_conversation_shares() from public, anon;
revoke all on function public.orphan_shared_assets(integer) from public, anon, authenticated;
revoke all on function public.conversation_shares_follow_conversation() from public, anon, authenticated;

grant execute on function public.is_service_admin() to authenticated, service_role;
grant execute on function public.admin_list_share_reports() to authenticated, service_role;
grant execute on function public.admin_set_share_status(uuid, text) to authenticated, service_role;
grant execute on function public.admin_dismiss_share_reports(uuid) to authenticated, service_role;
grant execute on function public.admin_delete_share(uuid) to authenticated, service_role;
grant execute on function public.admin_get_shared_conversation(text) to authenticated, service_role;
grant execute on function public.server_take_share_reports_to_mail(integer) to service_role;
grant execute on function public.server_requeue_share_reports(uuid[], timestamptz) to service_role;
grant execute on function public.report_shared_conversation(text, text) to anon, authenticated, service_role;
grant execute on function public.list_my_conversation_shares() to authenticated, service_role;
grant execute on function public.orphan_shared_assets(integer) to service_role;
