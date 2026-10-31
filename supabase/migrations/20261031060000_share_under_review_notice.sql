-- A link that is paused (reported by several readers, see 20261031050000_add_share_report_review.sql) tells whoever opens it that the conversation is under review, and one that the owner of the
-- service took down (`removed`) says it was taken down after review, instead of both answering like a link that is not there. Nothing of the conversation is given: only the status.
-- A conversation whose share was taken down cannot be shared again (`blocked_share_conversations`; it stays even when the owner removes the record), and the owner of the share is told by mail
-- (the server takes each removal once: server_take_removed_shares_to_mail).
-- A removed share keeps its record (so its owner sees why) but no snapshot, and its files are removed by the clean-up.

alter table public.conversation_shares drop constraint if exists conversation_shares_status_check;
alter table public.conversation_shares add constraint conversation_shares_status_check
  check (status in ('building', 'active', 'suspended', 'removed', 'conversation_deleted'));

create or replace function public.get_shared_conversation(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case s.status
    when 'active' then jsonb_build_object(
      'title', s.title,
      'mode', s.mode,
      'ownerName', case when s.show_name then nullif(s.owner_name, '') else null end,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at,
      'snapshot', s.snapshot
    )
    else jsonb_build_object('status', s.status)
  end
  from public.conversation_shares s
  where s.code = p_code and s.status in ('active', 'suspended', 'removed');
$$;

create or replace function public.list_my_conversation_shares()
returns table (id uuid, conversation_id uuid, code text, mode text, show_name boolean, title text, status text, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.conversation_id, s.code, s.mode, s.show_name, s.title, s.status, s.created_at, s.updated_at
  from public.conversation_shares s
  where s.owner_id = (select auth.uid()) and s.status in ('active', 'suspended', 'removed', 'conversation_deleted')
  order by s.created_at desc;
$$;

create table if not exists public.blocked_share_conversations (
  owner_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, conversation_id)
);
alter table public.blocked_share_conversations enable row level security;
revoke all on table public.blocked_share_conversations from public, anon, authenticated;
grant all on table public.blocked_share_conversations to service_role;

alter table public.conversation_shares add column if not exists removal_mailed_at timestamptz;

-- A conversation that was taken down once is not shared again.
create or replace function public.server_create_conversation_share(
  p_share_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_code text,
  p_mode text,
  p_show_name boolean,
  p_owner_name text,
  p_title text,
  p_limit integer default 30
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.blocked_share_conversations where owner_id = p_user_id and conversation_id = p_conversation_id) then
    raise exception 'share_removed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.conversation_shares where owner_id = p_user_id and status in ('active', 'building')) >= p_limit then
    raise exception 'share_limit' using errcode = 'P0001';
  end if;
  insert into public.conversation_shares (id, owner_id, conversation_id, code, mode, show_name, owner_name, title, status)
  values (p_share_id, p_user_id, p_conversation_id, p_code, p_mode, coalesce(p_show_name, false), left(coalesce(p_owner_name, ''), 80), left(coalesce(p_title, ''), 200), 'building');
end;
$$;

-- The share and the conversation it came from, for the mail to the owner: each removal is taken once.
create or replace function public.server_take_removed_shares_to_mail(p_limit integer default 20)
returns table (share_id uuid, owner_email text, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    update public.conversation_shares s
    set removal_mailed_at = now()
    where s.id in (select x.id from public.conversation_shares x where x.status = 'removed' and x.removal_mailed_at is null order by x.updated_at limit greatest(1, least(p_limit, 100)))
    returning s.id, s.owner_id, s.title
  )
  select p.id, u.email::text, p.title from picked p left join auth.users u on u.id = p.owner_id;
end;
$$;

create or replace function public.server_requeue_removed_shares(p_share_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.conversation_shares set removal_mailed_at = null where id = any(p_share_ids) and status = 'removed';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- The owner of the service takes a share down: the link says so, the snapshot goes, the record stays.
create or replace function public.admin_remove_share(p_id uuid)
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
  update public.conversation_shares
  set status = 'removed', snapshot = '{}'::jsonb, snapshot_bytes = 0, updated_at = now()
  where id = p_id and status in ('active', 'suspended');
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    insert into public.blocked_share_conversations (owner_id, conversation_id)
    select owner_id, conversation_id from public.conversation_shares where id = p_id
    on conflict do nothing;
  end if;
  return v_rows = 1;
end;
$$;

-- The reports list also keeps the shares that were taken down.
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
  where exists (select 1 from public.share_reports r where r.share_id = s.id) or s.status in ('suspended', 'removed')
  order by (s.status = 'suspended') desc, 10 desc nulls last;
end;
$$;

revoke all on function public.get_shared_conversation(text) from public;
revoke all on function public.list_my_conversation_shares() from public, anon;
revoke all on function public.admin_remove_share(uuid) from public, anon;
revoke all on function public.server_create_conversation_share(uuid, uuid, uuid, text, text, boolean, text, text, integer) from public, anon, authenticated;
revoke all on function public.server_take_removed_shares_to_mail(integer) from public, anon, authenticated;
revoke all on function public.server_requeue_removed_shares(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_list_share_reports() from public, anon;
grant execute on function public.get_shared_conversation(text) to anon, authenticated, service_role;
grant execute on function public.list_my_conversation_shares() to authenticated, service_role;
grant execute on function public.admin_remove_share(uuid) to authenticated, service_role;
grant execute on function public.server_create_conversation_share(uuid, uuid, uuid, text, text, boolean, text, text, integer) to service_role;
grant execute on function public.server_take_removed_shares_to_mail(integer) to service_role;
grant execute on function public.server_requeue_removed_shares(uuid[]) to service_role;
grant execute on function public.admin_list_share_reports() to authenticated, service_role;
