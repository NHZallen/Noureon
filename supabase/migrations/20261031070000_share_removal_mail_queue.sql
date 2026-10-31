-- The mail to the owner of a share that was taken down no longer depends on the share's row: the owner can remove the record of the share before the server has sent it, and then nothing was left to
-- send. The queue is now `blocked_share_conversations` (the conversations that cannot be shared again): it keeps the title and whether the owner has been told.
-- `share_id` in what `server_take_removed_shares_to_mail` returns is the id of that row (`id` of the blocked conversation), which `server_requeue_removed_shares` takes back.

alter table public.blocked_share_conversations add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists blocked_share_conversations_id_idx on public.blocked_share_conversations (id);
alter table public.blocked_share_conversations add column if not exists title text not null default '';
alter table public.blocked_share_conversations add column if not exists owner_notified_at timestamptz;

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
    insert into public.blocked_share_conversations (owner_id, conversation_id, title)
    select owner_id, conversation_id, left(title, 200) from public.conversation_shares where id = p_id
    on conflict (owner_id, conversation_id) do update set title = excluded.title, owner_notified_at = null;
  end if;
  return v_rows = 1;
end;
$$;

create or replace function public.server_take_removed_shares_to_mail(p_limit integer default 20)
returns table (share_id uuid, owner_email text, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    update public.blocked_share_conversations b
    set owner_notified_at = now()
    where b.id in (select x.id from public.blocked_share_conversations x where x.owner_notified_at is null order by x.created_at limit greatest(1, least(p_limit, 100)))
    returning b.id, b.owner_id, b.title
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
  update public.blocked_share_conversations set owner_notified_at = null where id = any(p_share_ids);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.admin_remove_share(uuid) from public, anon;
revoke all on function public.server_take_removed_shares_to_mail(integer) from public, anon, authenticated;
revoke all on function public.server_requeue_removed_shares(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_remove_share(uuid) to authenticated, service_role;
grant execute on function public.server_take_removed_shares_to_mail(integer) to service_role;
grant execute on function public.server_requeue_removed_shares(uuid[]) to service_role;
