import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeMemorySummaryCloudSync } from '../src/app/sync/memory-summary-cloud-sync.js';

function createWindowFixture() {
  const listeners = new Map();
  return {
    navigator: { onLine: true },
    CustomEvent: class {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); },
    setTimeout,
    clearTimeout
  };
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    async getItem(key) { return values.get(key) || null; },
    async setItem(key, value) { values.set(key, value); },
    values
  };
}

function createSupabaseFixture() {
  const rows = new Map();
  const writes = [];
  return {
    writes,
    from() {
      return {
        select() { return this; },
        async eq() { return { data: [...rows.values()], error: null }; }
      };
    },
    async rpc(name, { p_rows: records }) {
      assert.equal(name, 'upsert_workspace_memory_summary_records');
      writes.push(records);
      for (const record of records) rows.set(record.record_key, record);
      return { data: records, error: null };
    },
    channel() {
      return {
        on() { return this; },
        subscribe() { return this; }
      };
    },
    async removeChannel() {}
  };
}

test('memory summary cloud sync uploads only changed records after its first record-level save', async () => {
  const window = createWindowFixture();
  const storage = createStorage({ appData: JSON.stringify({ memoryState: {} }) });
  const supabase = createSupabaseFixture();
  const sync = initializeMemorySummaryCloudSync({
    window,
    storage,
    supabase,
    user: { id: 'user-1' },
    username: 'supabase:user-1',
    appDataKey: 'appData',
    logger: { warn() {} }
  });
  await sync.ready;
  const first = {
    memorySummary: {
      overview: 'Current setup.', updatedAt: '2026-07-29T00:00:00.000Z', sections: [
        { id: 'deploy', title: 'Deployment', content: 'NUC', updatedAt: '2026-07-29T00:00:00.000Z' },
        { id: 'style', title: 'Style', content: 'Concise', updatedAt: '2026-07-29T00:00:00.000Z' }
      ]
    }
  };
  sync.captureMemoryState(first);
  await sync.flush();
  assert.equal(supabase.writes.length, 1);
  assert.equal(supabase.writes[0].length, 3);

  sync.captureMemoryState({
    memorySummary: {
      ...first.memorySummary,
      updatedAt: '2026-07-30T00:00:00.000Z',
      sections: [
        { ...first.memorySummary.sections[0], content: 'VPS', updatedAt: '2026-07-30T00:00:00.000Z' },
        first.memorySummary.sections[1]
      ]
    }
  });
  await sync.flush();

  assert.equal(supabase.writes.length, 2);
  assert.deepEqual(supabase.writes[1].map(row => row.record_key).sort(), [
    'summary:meta',
    'summary:section:deploy'
  ]);
  assert.equal(JSON.stringify(supabase.writes[1]).includes('Concise'), false);
  await sync.stop();
});
