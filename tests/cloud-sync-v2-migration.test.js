import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260706010000_create_normalized_workspace_sync.sql',
  import.meta.url
);
const sequenceGrantMigrationUrl = new URL(
  '../supabase/migrations/20260709090000_grant_workspace_sync_sequence.sql',
  import.meta.url
);

test('normalized workspace migration creates owner-scoped entity tables without realtime publication', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of [
    'sync_profiles',
    'workspace_folders',
    'workspace_conversations',
    'workspace_messages',
    'workspace_astras',
    'workspace_memories',
    'workspace_assets'
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /foreign key \(conversation_id, user_id\)/);
  assert.match(sql, /foreign key \(folder_id, user_id\)/);
  assert.doesNotMatch(sql, /alter publication|supabase_realtime/i);
});

test('workspace sync sequence grants authenticated writes and keeps anon locked out', async () => {
  const sql = await readFile(sequenceGrantMigrationUrl, 'utf8');

  assert.match(sql, /grant usage, select on sequence public\.workspace_sync_seq to authenticated/i);
  assert.match(sql, /revoke all on sequence public\.workspace_sync_seq from anon/i);
});
