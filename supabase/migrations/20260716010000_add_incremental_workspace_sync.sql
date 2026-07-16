create sequence if not exists public.workspace_sync_seq as bigint;

alter table public.workspace_folders
  add column if not exists sync_seq bigint;
alter table public.workspace_conversations
  add column if not exists sync_seq bigint;
alter table public.workspace_messages
  add column if not exists sync_seq bigint;
alter table public.workspace_astras
  add column if not exists sync_seq bigint;
alter table public.workspace_tombstones
  add column if not exists sync_seq bigint;

lock table public.workspace_folders in share row exclusive mode;
lock table public.workspace_conversations in share row exclusive mode;
lock table public.workspace_messages in share row exclusive mode;
lock table public.workspace_astras in share row exclusive mode;
lock table public.workspace_tombstones in share row exclusive mode;

create or replace function public.assign_workspace_sync_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sync_seq := pg_catalog.nextval('public.workspace_sync_seq'::regclass);
  return new;
end;
$$;

drop trigger if exists assign_workspace_folders_sync_seq
  on public.workspace_folders;
create trigger assign_workspace_folders_sync_seq
before insert or update on public.workspace_folders
for each row execute function public.assign_workspace_sync_seq();

drop trigger if exists assign_workspace_conversations_sync_seq
  on public.workspace_conversations;
create trigger assign_workspace_conversations_sync_seq
before insert or update on public.workspace_conversations
for each row execute function public.assign_workspace_sync_seq();

drop trigger if exists assign_workspace_messages_sync_seq
  on public.workspace_messages;
create trigger assign_workspace_messages_sync_seq
before insert or update on public.workspace_messages
for each row execute function public.assign_workspace_sync_seq();

drop trigger if exists assign_workspace_astras_sync_seq
  on public.workspace_astras;
create trigger assign_workspace_astras_sync_seq
before insert or update on public.workspace_astras
for each row execute function public.assign_workspace_sync_seq();

drop trigger if exists assign_workspace_tombstones_sync_seq
  on public.workspace_tombstones;
create trigger assign_workspace_tombstones_sync_seq
before insert or update on public.workspace_tombstones
for each row execute function public.assign_workspace_sync_seq();

update public.workspace_folders
set sync_seq = pg_catalog.nextval('public.workspace_sync_seq'::regclass)
where sync_seq is null;

update public.workspace_conversations
set sync_seq = pg_catalog.nextval('public.workspace_sync_seq'::regclass)
where sync_seq is null;

update public.workspace_messages
set sync_seq = pg_catalog.nextval('public.workspace_sync_seq'::regclass)
where sync_seq is null;

update public.workspace_astras
set sync_seq = pg_catalog.nextval('public.workspace_sync_seq'::regclass)
where sync_seq is null;

update public.workspace_tombstones
set sync_seq = pg_catalog.nextval('public.workspace_sync_seq'::regclass)
where sync_seq is null;

alter table public.workspace_folders
  alter column sync_seq set not null;
alter table public.workspace_conversations
  alter column sync_seq set not null;
alter table public.workspace_messages
  alter column sync_seq set not null;
alter table public.workspace_astras
  alter column sync_seq set not null;
alter table public.workspace_tombstones
  alter column sync_seq set not null;

create index if not exists workspace_folders_user_sync_seq_idx
  on public.workspace_folders(user_id, sync_seq);
create index if not exists workspace_conversations_user_sync_seq_idx
  on public.workspace_conversations(user_id, sync_seq);
create index if not exists workspace_messages_user_sync_seq_idx
  on public.workspace_messages(user_id, sync_seq);
create index if not exists workspace_astras_user_sync_seq_idx
  on public.workspace_astras(user_id, sync_seq);
create index if not exists workspace_tombstones_user_sync_seq_idx
  on public.workspace_tombstones(user_id, sync_seq);

create or replace function public.fetch_workspace_delta(
  p_after_seq bigint default 0,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_after_seq bigint := greatest(coalesce(p_after_seq, 0), 0);
  v_page_limit integer := greatest(1, least(coalesce(p_limit, 500), 1000));
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  with candidates as (
    select
      'folders'::text as collection,
      folders.id::text as entity_id,
      folders.sync_seq,
      pg_catalog.to_jsonb(folders) as row_data
    from public.workspace_folders folders
    where folders.user_id = v_user_id
      and folders.sync_seq > v_after_seq

    union all

    select
      'conversations'::text,
      conversations.id::text,
      conversations.sync_seq,
      pg_catalog.to_jsonb(conversations)
    from public.workspace_conversations conversations
    where conversations.user_id = v_user_id
      and conversations.sync_seq > v_after_seq

    union all

    select
      'messages'::text,
      messages.id::text,
      messages.sync_seq,
      pg_catalog.to_jsonb(messages)
    from public.workspace_messages messages
    where messages.user_id = v_user_id
      and messages.sync_seq > v_after_seq

    union all

    select
      'astras'::text,
      astras.id::text,
      astras.sync_seq,
      pg_catalog.to_jsonb(astras)
    from public.workspace_astras astras
    where astras.user_id = v_user_id
      and astras.sync_seq > v_after_seq

    union all

    select
      'tombstones'::text,
      pg_catalog.concat_ws(':', tombstones.entity_type, tombstones.entity_id::text),
      tombstones.sync_seq,
      pg_catalog.to_jsonb(tombstones)
    from public.workspace_tombstones tombstones
    where tombstones.user_id = v_user_id
      and tombstones.sync_seq > v_after_seq

    order by sync_seq, collection, entity_id
    limit v_page_limit + 1
  ),
  page as (
    select collection, entity_id, sync_seq, row_data
    from candidates
    order by sync_seq, collection, entity_id
    limit v_page_limit
  )
  select pg_catalog.jsonb_build_object(
    'changes', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'collection', page.collection,
          'sync_seq', page.sync_seq,
          'row', page.row_data
        )
        order by page.sync_seq, page.collection, page.entity_id
      )
      from page
    ), '[]'::jsonb),
    'next_seq', coalesce((select pg_catalog.max(page.sync_seq) from page), v_after_seq),
    'has_more', (select pg_catalog.count(*) > v_page_limit from candidates)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.assign_workspace_sync_seq()
  from public, anon, authenticated;
revoke all on function public.fetch_workspace_delta(bigint, integer)
  from public, anon;
grant execute on function public.fetch_workspace_delta(bigint, integer)
  to authenticated;

grant usage, select on sequence public.workspace_sync_seq to authenticated;
revoke all on sequence public.workspace_sync_seq from anon;
