import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../src/app/sync/cloud-sync-v2-baseline.js', import.meta.url);
const baselineModule = await import(moduleUrl).catch(() => null);

function subject() {
  assert.ok(baselineModule, 'cloud-sync-v2-baseline module must exist');
  return baselineModule;
}

const userId = '11111111-1111-4111-8111-111111111111';

test('remote baselines are versioned owner scoped and bigint safe', () => {
  const {
    CLOUD_SYNC_BASELINE_VERSION,
    createRemoteBaseline,
    validateRemoteBaseline
  } = subject();
  const baseline = createRemoteBaseline({
    userId,
    watermark: 42,
    rows: { folders: [], conversations: [], messages: [], astras: [], tombstones: [] }
  });

  assert.equal(baseline.version, CLOUD_SYNC_BASELINE_VERSION);
  assert.equal(baseline.userId, userId);
  assert.equal(baseline.watermark, '42');
  assert.deepEqual(validateRemoteBaseline(JSON.stringify(baseline), { userId }), baseline);
  assert.equal(validateRemoteBaseline(baseline, { userId: 'another-user' }), null);
  assert.equal(validateRemoteBaseline({ ...baseline, version: 999 }, { userId }), null);
  assert.equal(validateRemoteBaseline({ ...baseline, watermark: Number.MAX_SAFE_INTEGER + 1 }, { userId }), null);
});

test('snapshot baselines deduplicate rows deterministically without mutating input', () => {
  const { createRemoteBaseline } = subject();
  const rows = {
    folders: [
      { id: 'folder-b', sync_seq: 2, name: 'B' },
      { id: 'folder-a', sync_seq: 1, name: 'old A' },
      { id: 'folder-a', sync_seq: 3, name: 'new A' }
    ],
    conversations: [],
    messages: [],
    astras: [],
    tombstones: []
  };
  const original = structuredClone(rows);

  const baseline = createRemoteBaseline({ userId, watermark: '3', rows });

  assert.deepEqual(baseline.rows.folders.map(row => [row.id, row.name]), [
    ['folder-b', 'B'],
    ['folder-a', 'new A']
  ]);
  assert.deepEqual(rows, original);
});

test('baseline rows normalize bigint sequences into JSON-safe strings', () => {
  const { createRemoteBaseline } = subject();
  const baseline = createRemoteBaseline({
    userId,
    watermark: 42n,
    rows: {
      folders: [{ id: 'folder-1', user_id: userId, sync_seq: 42n }],
      conversations: [],
      messages: [],
      astras: [],
      tombstones: []
    }
  });

  assert.equal(baseline.rows.folders[0].sync_seq, '42');
  assert.doesNotThrow(() => JSON.stringify(baseline));
});

test('ordered delta pages upsert rows and apply tombstones before decoding', () => {
  const { applyRemoteDeltaPage, createRemoteBaseline } = subject();
  const baseline = createRemoteBaseline({
    userId,
    watermark: '10',
    rows: {
      folders: [{ id: 'folder-1', user_id: userId, sync_seq: 1 }],
      conversations: [{ id: 'conversation-1', user_id: userId, folder_id: 'folder-1', sync_seq: 2 }],
      messages: [{ id: 'message-1', user_id: userId, conversation_id: 'conversation-1', sync_seq: 3 }],
      astras: [],
      tombstones: []
    }
  });
  const original = structuredClone(baseline);

  const result = applyRemoteDeltaPage(baseline, {
    changes: [
      {
        collection: 'folders',
        sync_seq: 11,
        row: { id: 'folder-2', user_id: userId, sync_seq: 11 }
      },
      {
        collection: 'tombstones',
        sync_seq: 12,
        row: {
          user_id: userId,
          entity_type: 'conversation',
          entity_id: 'conversation-1',
          deleted_at: '2026-07-16T00:00:00.000Z',
          sync_seq: 12
        }
      },
      {
        collection: 'tombstones',
        sync_seq: 13,
        row: {
          user_id: userId,
          entity_type: 'folder',
          entity_id: 'folder-1',
          deleted_at: '2026-07-16T00:01:00.000Z',
          sync_seq: 13
        }
      }
    ],
    next_seq: 13,
    has_more: false
  });

  assert.equal(result.watermark, '13');
  assert.deepEqual(result.rows.folders.map(row => row.id), ['folder-2']);
  assert.deepEqual(result.rows.conversations, []);
  assert.deepEqual(result.rows.messages, []);
  assert.equal(result.rows.tombstones.length, 2);
  assert.deepEqual(baseline, original);
});

test('delta pages reject malformed unknown or non-monotonic changes', () => {
  const { applyRemoteDeltaPage, createRemoteBaseline } = subject();
  const baseline = createRemoteBaseline({
    userId,
    watermark: '20',
    rows: { folders: [], conversations: [], messages: [], astras: [], tombstones: [] }
  });

  assert.throws(() => applyRemoteDeltaPage(baseline, {
    changes: [{ collection: 'folders', sync_seq: 20, row: { id: 'folder-1' } }],
    next_seq: 20,
    has_more: false
  }), /strictly increasing/i);
  assert.throws(() => applyRemoteDeltaPage(baseline, {
    changes: [{ collection: 'unknown', sync_seq: 21, row: { id: 'row-1' } }],
    next_seq: 21,
    has_more: false
  }), /collection/i);
  assert.throws(() => applyRemoteDeltaPage(baseline, {
    changes: [{ collection: 'folders', sync_seq: 21, row: { id: 'folder-1' } }],
    next_seq: 22,
    has_more: false
  }), /next_seq/i);
});
