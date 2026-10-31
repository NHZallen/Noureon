-- A takedown can be taken back. A share taken down (`removed`) now keeps its snapshot and its files, hidden from whoever opens the link (get_shared_conversation gives only the status), until the
-- owner of the service either takes the takedown back (`admin_restore_share`: the link works again, the reports are cleared, the conversation can be shared again, and the owner of the share is told
-- by mail) or deletes the record (`admin_delete_share`, or the owner removing the record), which deletes the snapshot with it and the clean-up removes the files.
-- A share taken down before this migration has no snapshot left: it cannot be restored (`content_gone`) and is only a record to delete.
-- The conversation is lifted from `blocked_share_conversations` by `lifted_at`, which is also the queue of the mail about it (`lift_notified_at`, taken once like `owner_notified_at`).

alter table public.blocked_share_conversations add column if not exists lifted_at timestamptz;
alter table public.blocked_share_conversations add column if not exists lift_notified_at timestamptz;

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
  set status = 'removed', updated_at = now()
  where id = p_id and status in ('active', 'suspended');
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    insert into public.blocked_share_conversations (owner_id, conversation_id, title)
    select owner_id, conversation_id, left(title, 200) from public.conversation_shares where id = p_id
    on conflict (owner_id, conversation_id) do update
      set title = excluded.title, owner_notified_at = null, lifted_at = null, lift_notified_at = null;
  end if;
  return v_rows = 1;
end;
$$;

create or replace function public.admin_restore_share(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.conversation_shares%rowtype;
begin
  if not public.is_service_admin() then
    raise exception 'Not allowed';
  end if;
  select * into v_share from public.conversation_shares where id = p_id and status = 'removed' for update;
  if not found then
    return false;
  end if;
  if v_share.snapshot = '{}'::jsonb then
    raise exception 'content_gone' using errcode = 'P0001';
  end if;
  update public.conversation_shares set status = 'active', updated_at = now() where id = p_id;
  delete from public.share_reports where share_id = p_id;
  -- The owner is told of the restore only when the takedown mail went out; one that was never sent is not sent at all.
  update public.blocked_share_conversations
  set lifted_at = now(),
      lift_notified_at = case when owner_notified_at is null then now() else null end,
      owner_notified_at = coalesce(owner_notified_at, now())
  where owner_id = v_share.owner_id and conversation_id = v_share.conversation_id;
  return true;
end;
$$;

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
  if exists (select 1 from public.blocked_share_conversations where owner_id = p_user_id and conversation_id = p_conversation_id and lifted_at is null) then
    raise exception 'share_removed' using errcode = 'P0001';
  end if;
  if (select count(*) from public.conversation_shares where owner_id = p_user_id and status in ('active', 'building')) >= p_limit then
    raise exception 'share_limit' using errcode = 'P0001';
  end if;
  insert into public.conversation_shares (id, owner_id, conversation_id, code, mode, show_name, owner_name, title, status)
  values (p_share_id, p_user_id, p_conversation_id, p_code, p_mode, coalesce(p_show_name, false), left(coalesce(p_owner_name, ''), 80), left(coalesce(p_title, ''), 200), 'building');
end;
$$;

-- A taken-down share keeps its files too (they are not shown to anyone: the link says only that it was taken down).
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
      where s.id::text = (storage.foldername(o.name))[1] and s.status in ('active', 'building', 'suspended', 'removed')
    )
  limit greatest(1, least(p_limit, 5000));
$$;

-- A conversation deleted by its owner empties the share even when it was taken down.
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
    where owner_id = old.user_id and conversation_id = old.id and status in ('active', 'building', 'suspended', 'removed');
  end if;
  return null;
end;
$$;

-- The owner of the service can read a taken-down share before deciding to take the takedown back.
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
  where s.code = p_code and s.status in ('active', 'suspended', 'removed');
  return v_out;
end;
$$;

-- The mail about a takedown taken back: each is taken once, like the one about the takedown.
create or replace function public.server_take_restored_shares_to_mail(p_limit integer default 20)
returns table (share_id uuid, owner_email text, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    update public.blocked_share_conversations b
    set lift_notified_at = now()
    where b.id in (select x.id from public.blocked_share_conversations x where x.lifted_at is not null and x.lift_notified_at is null order by x.lifted_at limit greatest(1, least(p_limit, 100)))
    returning b.id, b.owner_id, b.title
  )
  select p.id, u.email::text, p.title from picked p left join auth.users u on u.id = p.owner_id;
end;
$$;

create or replace function public.server_requeue_restored_shares(p_share_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.blocked_share_conversations set lift_notified_at = null where id = any(p_share_ids) and lifted_at is not null;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.admin_remove_share(uuid) from public, anon;
revoke all on function public.admin_restore_share(uuid) from public, anon;
revoke all on function public.server_create_conversation_share(uuid, uuid, uuid, text, text, boolean, text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_get_shared_conversation(text) from public, anon;
revoke all on function public.server_take_restored_shares_to_mail(integer) from public, anon, authenticated;
revoke all on function public.server_requeue_restored_shares(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_remove_share(uuid) to authenticated, service_role;
grant execute on function public.admin_restore_share(uuid) to authenticated, service_role;
grant execute on function public.server_create_conversation_share(uuid, uuid, uuid, text, text, boolean, text, text, integer) to service_role;
grant execute on function public.admin_get_shared_conversation(text) to authenticated, service_role;
grant execute on function public.server_take_restored_shares_to_mail(integer) to service_role;
grant execute on function public.server_requeue_restored_shares(uuid[]) to service_role;
