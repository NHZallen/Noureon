import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20261019010000_server_message_next_sequence_live.sql',
  import.meta.url
);

test('the next place of a server message counts only the messages that are still there', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /max\(messages\.sequence\) filter \(where messages\.deleted_at is null and messages\.sequence >= 0\)/);
  // The message that holds the place (a deleted one) is still moved out of the way, and the function stays server-only.
  assert.match(sql, /messages\.role = 'model' or messages\.deleted_at is not null/);
  assert.match(sql, /revoke all on function public\.server_upsert_workspace_message\(uuid, jsonb\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.server_upsert_workspace_message\(uuid, jsonb\) to service_role;/);
});
