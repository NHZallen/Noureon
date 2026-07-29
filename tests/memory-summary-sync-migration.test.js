import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('memory summaries use an owner-scoped record table, RPC, tombstones, and Realtime', async () => {
  const source = await readFile(
    new URL('../supabase/migrations/20260729020000_add_workspace_memory_summary_records.sql', import.meta.url),
    'utf8'
  );

  assert.match(source, /create table if not exists public\.workspace_memory_summary_records/i);
  assert.match(source, /primary key \(user_id, record_key\)/i);
  assert.match(source, /deleted_at timestamptz/i);
  assert.match(source, /enable row level security/i);
  assert.match(source, /create or replace function public\.upsert_workspace_memory_summary_records\(p_rows jsonb\)/i);
  assert.match(source, /workspace_memory_summary_records\.updated_at <= excluded\.updated_at/i);
  assert.match(source, /payload ->> 'authority'.*?manual/is);
  assert.match(source, /alter publication supabase_realtime add table public\.workspace_memory_summary_records/i);
});

test('memory summary recovery removes legacy meta tombstones and permits a newer row to recreate a key', async () => {
  const source = await readFile(
    new URL('../supabase/migrations/20260729030000_recover_memory_summary_meta_records.sql', import.meta.url),
    'utf8'
  );

  assert.match(source, /delete from public\.workspace_memory_summary_records[\s\S]*record_type = 'meta'[\s\S]*deleted_at is not null/i);
  assert.match(source, /create or replace function public\.upsert_workspace_memory_summary_records\(p_rows jsonb\)/i);
  assert.match(source, /workspace_memory_summary_records\.updated_at <= excluded\.updated_at/i);
  assert.doesNotMatch(source, /workspace_memory_summary_records\.deleted_at is null/i);
});
