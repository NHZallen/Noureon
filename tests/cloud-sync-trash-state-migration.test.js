import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260715010000_harden_workspace_trash_sync.sql',
  import.meta.url
);

function functionSql(sql, name) {
  const start = sql.search(new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'i'));
  assert.notEqual(start, -1, `missing function public.${name}`);
  const bodyStart = sql.indexOf('as $$', start);
  const end = sql.indexOf('$$;', bodyStart);
  assert.notEqual(bodyStart, -1, `missing body for public.${name}`);
  assert.notEqual(end, -1, `missing body terminator for public.${name}`);
  return sql.slice(start, end + 3);
}

test('trash clock parser accepts only finite offset timestamps under a locked-down function', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const helper = functionSql(sql, 'workspace_safe_timestamptz');

  assert.match(helper, /returns timestamptz[\s\S]*language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(helper, /p_value !~ '[^']*\[Zz\][^']*\[\+\-\][^']*'/i);
  assert.match(helper, /pg_catalog\.isfinite\(v_parsed\)/i);
  assert.match(sql, /revoke all on function public\.workspace_safe_timestamptz\(text\)\s+from public, anon, authenticated/i);
});

test('conversation trigger compares the dedicated clock atomically and lets deletion win ties', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const trigger = functionSql(sql, 'enforce_workspace_conversation_trash_state');

  assert.match(trigger, /security definer[\s\S]*set search_path = ''/i);
  assert.match(trigger, /old\.metadata ->> 'trashStateUpdatedAt'/i);
  assert.match(trigger, /new\.metadata ->> 'trashStateUpdatedAt'/i);
  assert.match(trigger, /workspace_safe_timestamptz[\s\S]*new\.deleted_at/i);
  assert.match(trigger, /when v_incoming_state_at > v_existing_state_at then true/i);
  assert.match(trigger, /when v_incoming_state_at < v_existing_state_at then false/i);
  assert.match(trigger, /else new\.deleted_at is not null and old\.deleted_at is null/i);
  assert.match(trigger, /if not v_incoming_wins then[\s\S]*new\.deleted_at := old\.deleted_at/i);
  assert.match(trigger, /if new\.deleted_at is not null then[\s\S]*new\.folder_id := null;[\s\S]*new\.archived := false;/i);
  assert.match(trigger, /new\.metadata := new\.metadata - 'legacyFolderId'/i);
});

test('migration exposes an authenticated capability probe so old databases fail closed', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const capability = functionSql(sql, 'workspace_trash_sync_capability');

  assert.match(capability, /returns integer[\s\S]*language sql[\s\S]*stable[\s\S]*security invoker[\s\S]*select 1;/i);
  assert.match(sql, /revoke all on function public\.workspace_trash_sync_capability\(\)\s+from public, anon/i);
  assert.match(sql, /grant execute on function public\.workspace_trash_sync_capability\(\)\s+to authenticated/i);
});

test('trigger is installed before backfill and existing rows receive a durable trash clock', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const triggerAt = sql.search(/create trigger enforce_workspace_conversation_trash_state/i);
  const backfillAt = sql.search(/update public\.workspace_conversations\s+set metadata = case/i);

  assert.ok(triggerAt >= 0);
  assert.ok(backfillAt > triggerAt, 'the trigger lock must close concurrent writes before backfill starts');
  assert.match(sql, /before insert or update on public\.workspace_conversations/i);
  assert.match(sql, /trashStateUpdatedAt[\s\S]*coalesce\([\s\S]*deleted_at[\s\S]*stateUpdatedAt[\s\S]*updated_at/i);
  assert.match(sql, /folder_id = case when deleted_at is not null then null else folder_id end/i);
  assert.match(sql, /archived = case when deleted_at is not null then false else archived end/i);
  assert.match(sql, /metadata ->> 'legacyFolderId' is distinct from folder_id::text/i);
});

test('normalized conversation and tombstone tables are added to Realtime idempotently without message noise', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of ['workspace_conversations', 'workspace_tombstones']) {
    assert.match(sql, new RegExp(`pg_catalog\\.pg_publication_tables[\\s\\S]*tablename = '${table}'`, 'i'));
    assert.match(sql, new RegExp(`alter publication supabase_realtime add table public\\.${table}`, 'i'));
  }
  assert.doesNotMatch(sql, /alter publication supabase_realtime add table public\.workspace_messages/i);
});
