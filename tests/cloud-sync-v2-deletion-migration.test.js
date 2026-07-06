import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260706030000_add_workspace_tombstones.sql',
  import.meta.url
);

async function readMigration() {
  return readFile(migrationUrl, 'utf8');
}

function functionSql(sql, name) {
  const start = sql.search(new RegExp(`create(?: or replace)? function public\\.${name}\\s*\\(`, 'i'));
  assert.notEqual(start, -1, `missing function public.${name}`);
  const bodyStart = sql.indexOf('as $$', start);
  const end = sql.indexOf('$$;', bodyStart);
  assert.notEqual(bodyStart, -1, `missing body for public.${name}`);
  assert.notEqual(end, -1, `missing body terminator for public.${name}`);
  return sql.slice(start, end + 3);
}

function assertOrdered(source, first, second, message) {
  const firstIndex = source.search(first);
  const secondIndex = source.search(second);
  assert.notEqual(firstIndex, -1, `${message}: missing first expression`);
  assert.notEqual(secondIndex, -1, `${message}: missing second expression`);
  assert.ok(firstIndex < secondIndex, message);
}

test('creates immutable content-free tombstones with owner-only reads and no realtime', async () => {
  const sql = await readMigration();

  assert.match(sql, /create table if not exists public\.workspace_tombstones\s*\([\s\S]*primary key \(user_id, entity_type, entity_id\)/i);
  assert.match(sql, /entity_type text not null check \(entity_type in \('conversation', 'folder'\)\)/i);
  assert.doesNotMatch(sql, /workspace_tombstones[\s\S]{0,500}\b(content|parts|metadata|payload)\b/i);
  assert.match(sql, /on public\.workspace_tombstones for select to authenticated[\s\S]*auth\.uid\(\)[\s\S]*user_id/i);
  assert.doesNotMatch(sql, /on public\.workspace_tombstones for (insert|update|delete|all) to authenticated/i);
  assert.match(sql, /revoke all on table public\.workspace_tombstones from authenticated/i);
  assert.match(sql, /grant select on table public\.workspace_tombstones to authenticated/i);
  assert.match(sql, /revoke all on table public\.workspace_tombstones from (public, anon|anon, public)/i);
  assert.doesNotMatch(sql, /alter publication|supabase_realtime/i);
});

test('removes browser writes and exposes only owner SELECT policies on normalized content', async () => {
  const sql = await readMigration();

  for (const table of ['workspace_folders', 'workspace_conversations', 'workspace_messages']) {
    assert.match(sql, new RegExp(`revoke insert, update, delete on table public\\.${table} from authenticated`, 'i'));
    assert.match(sql, new RegExp(`grant select on table public\\.${table} to authenticated`, 'i'));
    assert.match(sql, new RegExp(`on public\\.${table} for select to authenticated[\\s\\S]*auth\\.uid\\(\\)[\\s\\S]*user_id`, 'i'));
    assert.doesNotMatch(sql, new RegExp(`on public\\.${table} for (all|insert|update|delete) to authenticated`, 'i'));
  }
});

test('defines one private deterministic advisory-lock key for every protected entity operation', async () => {
  const sql = await readMigration();
  const helper = functionSql(sql, 'workspace_entity_lock_key');

  assert.match(helper, /returns bigint[\s\S]*language sql[\s\S]*immutable[\s\S]*security invoker[\s\S]*set search_path = ''/i);
  assert.match(helper, /pg_catalog\.hashtextextended[\s\S]*p_entity_type[\s\S]*p_entity_id/i);
  assert.doesNotMatch(helper, /p_user_id/i, 'global entity IDs must serialize across users too');
  assert.match(sql, /revoke all on function public\.workspace_entity_lock_key\(text, uuid\)\s+from (public, anon, authenticated|authenticated, anon, public)/i);
});

test('batch write RPCs validate auth, sort locks, check tombstones after locking, and preserve upserts', async () => {
  const sql = await readMigration();
  const specs = [
    ['upsert_workspace_folders', 'folder', 'workspace_folders'],
    ['upsert_workspace_conversations', 'conversation', 'workspace_conversations'],
    ['upsert_workspace_messages', 'conversation', 'workspace_messages']
  ];

  for (const [name, lockType, table] of specs) {
    const fn = functionSql(sql, name);
    assert.match(fn, /\(p_rows jsonb\)[\s\S]*returns void[\s\S]*security definer[\s\S]*set search_path = ''/i);
    assert.match(fn, /auth\.uid\(\)[\s\S]*Authentication required/i);
    assert.match(fn, /jsonb_typeof\(p_rows\) <> 'array'[\s\S]*JSON array required/i);
    assert.match(fn, /order by[\s\S]*::uuid/i, `${name} must acquire batch locks in UUID order`);
    assertOrdered(
      fn,
      new RegExp(`pg_catalog\\.pg_advisory_xact_lock[\\s\\S]*'${lockType}'`, 'i'),
      /from public\.workspace_tombstones/i,
      `${name} must check tombstones only after acquiring its entity lock`
    );
    assert.match(fn, new RegExp(`insert into public\\.${table}[\\s\\S]*on conflict \\(id\\) do update`, 'i'));
  }

  const conversations = functionSql(sql, 'upsert_workspace_conversations');
  assertOrdered(
    conversations,
    /workspace_entity_lock_key\('folder'/i,
    /workspace_entity_lock_key\('conversation'/i,
    'conversation upserts must lock referenced folders before conversations'
  );
  assert.match(conversations, /entity_type = 'folder'[\s\S]*Workspace folder is deleted/i);
  assert.match(conversations, /from public\.workspace_folders[\s\S]*Workspace folder not found/i);

  const messages = functionSql(sql, 'upsert_workspace_messages');
  assert.match(messages, /entity_type = 'conversation'[\s\S]*Workspace conversation is deleted/i);
  assert.match(messages, /from public\.workspace_conversations[\s\S]*Workspace conversation not found/i);
});

test('batch write RPCs reject duplicate IDs and normalize structured JSON payloads', async () => {
  const sql = await readMigration();
  for (const [name, label] of [
    ['upsert_workspace_folders', 'folder'],
    ['upsert_workspace_conversations', 'conversation'],
    ['upsert_workspace_messages', 'message']
  ]) {
    const fn = functionSql(sql, name);
    assertOrdered(
      fn,
      /group by[\s\S]*having pg_catalog\.count\(\*\) > 1/i,
      new RegExp(`insert into public\\.workspace_${label === 'folder' ? 'folders' : `${label}s`}`, 'i'),
      `${name} must reject duplicate IDs before writing`
    );
    assert.match(fn, new RegExp(`Duplicate workspace ${label} ids are not allowed`, 'i'));
  }

  const conversations = functionSql(sql, 'upsert_workspace_conversations');
  assert.match(conversations, /case[\s\S]*jsonb_typeof\(items\.value -> 'metadata'\) = 'object'[\s\S]*items\.value -> 'metadata'[\s\S]*else '\{\}'::jsonb[\s\S]*end/i);

  const messages = functionSql(sql, 'upsert_workspace_messages');
  assert.match(messages, /case[\s\S]*jsonb_typeof\(items\.value -> 'parts'\) = 'array'[\s\S]*items\.value -> 'parts'[\s\S]*else '\[\]'::jsonb[\s\S]*end/i);
});

test('deletion RPCs lock first, recheck tombstones, and delete only database content', async () => {
  const sql = await readMigration();
  const conversations = functionSql(sql, 'permanently_delete_workspace_conversations');
  const folder = functionSql(sql, 'permanently_delete_workspace_folder');

  assert.match(conversations, /\(\s*p_conversation_ids uuid\[\]\s*\)[\s\S]*returns void/i);
  assert.match(conversations, /order by[\s\S]*conversation_id/i);
  assertOrdered(conversations, /pg_catalog\.pg_advisory_xact_lock/i, /from public\.workspace_tombstones/i, 'conversation deletion must lock before checking tombstones');
  assert.match(conversations, /insert into public\.workspace_tombstones[\s\S]*'conversation'[\s\S]*delete from public\.workspace_conversations/i);

  assert.match(folder, /\(\s*p_folder_id uuid\s*\)[\s\S]*returns void/i);
  assertOrdered(folder, /pg_catalog\.pg_advisory_xact_lock/i, /from public\.workspace_tombstones/i, 'folder deletion must lock before checking tombstones');
  assert.match(folder, /insert into public\.workspace_tombstones[\s\S]*'folder'[\s\S]*update public\.workspace_conversations[\s\S]*set folder_id = null[\s\S]*delete from public\.workspace_folders/i);

  assert.doesNotMatch(sql, /workspace_asset_paths|workspace_assets|object_path|storage\./i);
});

test('deletion RPCs tombstone absent IDs idempotently and reject IDs actively owned by another user', async () => {
  const sql = await readMigration();
  for (const [name, table, tombstoneSelect, error] of [
    [
      'permanently_delete_workspace_conversations',
      'workspace_conversations',
      "select distinct v_user_id, 'conversation', conversation_ids\\.conversation_id",
      'Workspace conversation belongs to another user'
    ],
    [
      'permanently_delete_workspace_folder',
      'workspace_folders',
      "select v_user_id, 'folder', p_folder_id",
      'Workspace folder belongs to another user'
    ]
  ]) {
    const fn = functionSql(sql, name);
    assertOrdered(
      fn,
      new RegExp(`from public\\.${table}[\\s\\S]*user_id <> v_user_id[\\s\\S]*${error}`, 'i'),
      /insert into public\.workspace_tombstones/i,
      `${name} must reject another owner's active ID before tombstoning`
    );
    assert.match(fn, new RegExp(`insert into public\\.workspace_tombstones[\\s\\S]*${tombstoneSelect}[\\s\\S]*on conflict \\(user_id, entity_type, entity_id\\) do nothing`, 'i'));
  }

  const conversations = functionSql(sql, 'permanently_delete_workspace_conversations');
  assert.match(conversations, /from pg_catalog\.unnest[\s\S]*order by conversation_id[\s\S]*insert into public\.workspace_tombstones[\s\S]*from pg_catalog\.unnest/i);
});

test('all protected RPCs are authenticated-only and use qualified empty-search-path bodies', async () => {
  const sql = await readMigration();
  const signatures = [
    ['upsert_workspace_folders', 'jsonb'],
    ['upsert_workspace_conversations', 'jsonb'],
    ['upsert_workspace_messages', 'jsonb'],
    ['permanently_delete_workspace_conversations', 'uuid\\[\\]'],
    ['permanently_delete_workspace_folder', 'uuid']
  ];

  for (const [name, args] of signatures) {
    const fn = functionSql(sql, name);
    assert.match(fn, /security definer[\s\S]*set search_path = ''/i);
    assert.match(fn, /auth\.uid\(\)[\s\S]*Authentication required/i);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(${args}\\)\\s+from (public, anon|anon, public)`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(${args}\\)\\s+to authenticated`, 'i'));
  }
});
