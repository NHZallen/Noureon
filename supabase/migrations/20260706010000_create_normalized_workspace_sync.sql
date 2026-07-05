create table if not exists public.sync_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 2,
  migration_state text not null default 'pending'
    check (migration_state in ('pending', 'shadow', 'ready', 'active')),
  legacy_backup_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_folders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'gray',
  icon text not null default 'default',
  text_color text not null default 'gray',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.workspace_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid,
  title text not null,
  summary text not null default '',
  model text not null,
  provider text not null,
  metadata jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  constraint workspace_conversations_folder_owner_fk
    foreign key (folder_id, user_id)
    references public.workspace_folders(id, user_id)
    on delete set null (folder_id)
);

create table if not exists public.workspace_messages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'model', 'system')),
  parts jsonb not null default '[]'::jsonb,
  status text not null default 'complete'
    check (status in ('streaming', 'complete', 'error')),
  sequence bigint not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (conversation_id, sequence),
  constraint workspace_messages_conversation_owner_fk
    foreign key (conversation_id, user_id)
    references public.workspace_conversations(id, user_id)
    on delete cascade
);

create table if not exists public.workspace_astras (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  instructions text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workspace_memories (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workspace_assets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null,
  sha256 text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  status text not null default 'uploading'
    check (status in ('uploading', 'ready', 'missing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sha256)
);

create index if not exists workspace_folders_user_updated_idx
  on public.workspace_folders(user_id, updated_at desc);
create index if not exists workspace_conversations_user_updated_idx
  on public.workspace_conversations(user_id, updated_at desc);
create index if not exists workspace_messages_conversation_sequence_idx
  on public.workspace_messages(conversation_id, sequence);
create index if not exists workspace_messages_user_updated_idx
  on public.workspace_messages(user_id, updated_at desc);
create index if not exists workspace_astras_user_updated_idx
  on public.workspace_astras(user_id, updated_at desc);
create index if not exists workspace_memories_user_updated_idx
  on public.workspace_memories(user_id, updated_at desc);
create index if not exists workspace_assets_user_updated_idx
  on public.workspace_assets(user_id, updated_at desc);

create or replace function public.touch_workspace_entity_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists touch_sync_profiles_updated_at on public.sync_profiles;
create trigger touch_sync_profiles_updated_at
before update on public.sync_profiles
for each row execute function public.touch_workspace_entity_updated_at();

drop trigger if exists touch_workspace_folders_updated_at on public.workspace_folders;
create trigger touch_workspace_folders_updated_at
before update on public.workspace_folders
for each row execute function public.touch_workspace_entity_updated_at();

drop trigger if exists touch_workspace_conversations_updated_at on public.workspace_conversations;
create trigger touch_workspace_conversations_updated_at
before update on public.workspace_conversations
for each row execute function public.touch_workspace_entity_updated_at();

drop trigger if exists touch_workspace_messages_updated_at on public.workspace_messages;
create trigger touch_workspace_messages_updated_at
before update on public.workspace_messages
for each row execute function public.touch_workspace_entity_updated_at();

drop trigger if exists touch_workspace_astras_updated_at on public.workspace_astras;
create trigger touch_workspace_astras_updated_at
before update on public.workspace_astras
for each row execute function public.touch_workspace_entity_updated_at();

drop trigger if exists touch_workspace_memories_updated_at on public.workspace_memories;
create trigger touch_workspace_memories_updated_at
before update on public.workspace_memories
for each row execute function public.touch_workspace_entity_updated_at();

drop trigger if exists touch_workspace_assets_updated_at on public.workspace_assets;
create trigger touch_workspace_assets_updated_at
before update on public.workspace_assets
for each row execute function public.touch_workspace_entity_updated_at();

alter table public.sync_profiles enable row level security;
alter table public.workspace_folders enable row level security;
alter table public.workspace_conversations enable row level security;
alter table public.workspace_messages enable row level security;
alter table public.workspace_astras enable row level security;
alter table public.workspace_memories enable row level security;
alter table public.workspace_assets enable row level security;

drop policy if exists "Users manage their own sync profile" on public.sync_profiles;
create policy "Users manage their own sync profile"
on public.sync_profiles for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace folders" on public.workspace_folders;
create policy "Users manage their own workspace folders"
on public.workspace_folders for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace conversations" on public.workspace_conversations;
create policy "Users manage their own workspace conversations"
on public.workspace_conversations for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace messages" on public.workspace_messages;
create policy "Users manage their own workspace messages"
on public.workspace_messages for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace Astras" on public.workspace_astras;
create policy "Users manage their own workspace Astras"
on public.workspace_astras for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace memories" on public.workspace_memories;
create policy "Users manage their own workspace memories"
on public.workspace_memories for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own workspace assets" on public.workspace_assets;
create policy "Users manage their own workspace assets"
on public.workspace_assets for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.sync_profiles to authenticated;
grant select, insert, update, delete on public.workspace_folders to authenticated;
grant select, insert, update, delete on public.workspace_conversations to authenticated;
grant select, insert, update, delete on public.workspace_messages to authenticated;
grant select, insert, update, delete on public.workspace_astras to authenticated;
grant select, insert, update, delete on public.workspace_memories to authenticated;
grant select, insert, update, delete on public.workspace_assets to authenticated;

revoke all on public.sync_profiles from anon;
revoke all on public.workspace_folders from anon;
revoke all on public.workspace_conversations from anon;
revoke all on public.workspace_messages from anon;
revoke all on public.workspace_astras from anon;
revoke all on public.workspace_memories from anon;
revoke all on public.workspace_assets from anon;
