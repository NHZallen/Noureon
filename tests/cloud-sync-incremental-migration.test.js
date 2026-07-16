import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260716010000_add_incremental_workspace_sync.sql',
  import.meta.url
);

async function readMigration() {
  return readFile(migrationUrl, 'utf8').catch(() => '');
}

function functionSql(sql, name) {
  const start = sql.search(new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'i'));
  assert.notEqual(start, -1, `missing function public.${name}`);
  const bodyStart = sql.indexOf('as $$', start);
  const end = sql.indexOf('$$;', bodyStart);
  assert.notEqual(bodyStart, -1, `missing body for public.${name}`);
  assert.notEqual(end, -1, `missing body terminator for public.${name}`);
  return sql.slice(start, end + 3);
}

const synchronizedTables = [
  'workspace_folders',
  'workspace_conversations',
  'workspace_messages',
  'workspace_astras',
  'workspace_tombstones'
];

test('incremental sync migration creates and backfills one monotonic sequence', async () => {
  const sql = await readMigration();

  assert.match(sql, /create sequence if not exists public\.workspace_sync_seq/i);
  for (const table of synchronizedTables) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?add column if not exists sync_seq bigint`, 'i')
    );
    assert.match(
      sql,
      new RegExp(`update public\\.${table}[\\s\\S]*?nextval\\('public\\.workspace_sync_seq'::regclass\\)[\\s\\S]*?where sync_seq is null`, 'i')
    );
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table}[\\s\\S]*?alter column sync_seq set not null`, 'i')
    );
    assert.match(
      sql,
      new RegExp(`create index if not exists ${table}_user_sync_seq_idx[\\s\\S]*?on public\\.${table}\\(user_id, sync_seq\\)`, 'i')
    );
  }
});

test('every synchronized table assigns a new sequence on insert or update', async () => {
  const sql = await readMigration();
  const triggerFunction = functionSql(sql, 'assign_workspace_sync_seq');

  assert.match(triggerFunction, /returns trigger[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(triggerFunction, /new\.sync_seq\s*:=\s*pg_catalog\.nextval\('public\.workspace_sync_seq'::regclass\)/i);
  for (const table of synchronizedTables) {
    assert.match(
      sql,
      new RegExp(`create trigger assign_${table}_sync_seq[\\s\\S]*?before insert or update on public\\.${table}[\\s\\S]*?assign_workspace_sync_seq\\(\\)`, 'i')
    );
  }
});

test('delta RPC is owner scoped exclusive ordered and page bounded', async () => {
  const sql = await readMigration();
  const rpc = functionSql(sql, 'fetch_workspace_delta');

  assert.match(rpc, /p_after_seq bigint/i);
  assert.match(rpc, /p_limit integer/i);
  assert.doesNotMatch(rpc, /p_user(_id)?/i);
  assert.match(rpc, /returns jsonb[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(rpc, /v_user_id uuid\s*:=\s*\(select auth\.uid\(\)\)/i);
  assert.match(rpc, /greatest\(1,\s*least\(coalesce\(p_limit,\s*500\),\s*1000\)\)/i);
  assert.match(rpc, /sync_seq\s*>\s*v_after_seq/i);
  assert.match(rpc, /order by[\s\S]*sync_seq[\s\S]*limit v_page_limit \+ 1/i);
  assert.match(rpc, /'changes'[\s\S]*'next_seq'[\s\S]*'has_more'/i);

  for (const table of synchronizedTables) {
    assert.match(
      rpc,
      new RegExp(`from public\\.${table}[\\s\\S]*?user_id = v_user_id`, 'i')
    );
  }
});

test('delta protocol grants only the required authenticated capabilities', async () => {
  const sql = await readMigration();

  assert.match(sql, /grant usage, select on sequence public\.workspace_sync_seq to authenticated/i);
  assert.match(sql, /revoke all on sequence public\.workspace_sync_seq from anon/i);
  assert.match(
    sql,
    /revoke all on function public\.fetch_workspace_delta\(bigint, integer\)\s+from public, anon/i
  );
  assert.match(
    sql,
    /grant execute on function public\.fetch_workspace_delta\(bigint, integer\)\s+to authenticated/i
  );
  assert.doesNotMatch(sql, /grant execute[\s\S]*fetch_workspace_delta[\s\S]*to anon/i);
});
