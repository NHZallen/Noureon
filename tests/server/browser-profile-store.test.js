import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { createKeyVault } from '../../server/key-vault.js';
import { BrowserProfileError, createBrowserProfileStore, PROFILE_TTL_MS } from '../../server/browser-profile-store.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const keyOf = () => randomBytes(32).toString('base64');

// A small stand-in for the database (one table) and the bucket.
function world({ keys = [{ version: 1, key: keyOf() }], clock = { t: Date.UTC(2026, 10, 16) } } = {}) {
  const rows = new Map();
  const objects = new Map();
  const failures = { upload: 0, remove: 0 };
  const db = {
    async select(table, { filters = {} } = {}) {
      assert.equal(table, 'browser_profiles');
      return [...rows.values()].filter((row) => Object.entries(filters).every(([column, condition]) => {
        const [op, ...rest] = String(condition).split('.');
        const value = rest.join('.');
        return op === 'eq' ? String(row[column]) === value : op === 'lt' ? String(row[column]) < value : false;
      })).map((row) => ({ ...row }));
    },
    async upsert(table, row) { rows.set(row.user_id, { pending_clear: [], ...rows.get(row.user_id), ...row }); },
    async update(table, filters, values) { const id = String(filters.user_id).slice(3); if (!rows.has(id)) return []; Object.assign(rows.get(id), values); return [{ user_id: id }]; },
    async remove(table, filters) { rows.delete(String(filters.user_id).slice(3)); }
  };
  const fetchImpl = async (target, init = {}) => {
    const path = decodeURIComponent(new URL(target).pathname.replace('/storage/v1/object/browser-profiles/', '').replace('/storage/v1/object/browser-profiles', ''));
    const method = init.method || 'GET';
    assert.equal(init.headers.apikey, 'service');
    if (method === 'POST') { if (failures.upload) { failures.upload -= 1; return new Response('no', { status: 500 }); } objects.set(path, Buffer.from(init.body)); return new Response('{}', { status: 200 }); }
    if (method === 'DELETE') { if (failures.remove) { failures.remove -= 1; return new Response('no', { status: 500 }); } for (const prefix of JSON.parse(init.body).prefixes) objects.delete(prefix); return new Response('[]', { status: 200 }); }
    return objects.has(path) ? new Response(objects.get(path), { status: 200 }) : new Response('{}', { status: 404 });
  };
  const vault = createKeyVault(keys);
  const store = createBrowserProfileStore({ db, vault, url: 'https://db.example', serviceKey: 'service', fetchImpl, now: () => clock.t, maxBytes: 1000 });
  return { store, rows, objects, failures, clock, vault };
}

test('a login state is sealed before it is stored, comes back as it was, and is marked used', async () => {
  const w = world();
  assert.equal(await w.store.load(A), null);
  const archive = Buffer.from('COOKIES-secret '.repeat(20));
  await w.store.save(A, archive);
  const stored = w.objects.get(`${A}/profile.bin`);
  assert.ok(stored && !stored.includes('COOKIES-secret'), 'the stored file is sealed');
  assert.equal(w.rows.get(A).object_path, `${A}/profile.bin`);
  w.clock.t += 60_000;
  const loaded = await w.store.load(A);
  assert.deepEqual(loaded.archive, archive);
  assert.equal(w.rows.get(A).last_used_at, new Date(w.clock.t).toISOString());
});

test('a stored login state is only for its own person: another person gets nothing, and a moved file cannot be opened', async () => {
  const w = world();
  await w.store.save(A, Buffer.from('mine'));
  assert.equal(await w.store.load(B), null);
  w.objects.set(`${B}/profile.bin`, w.objects.get(`${A}/profile.bin`));
  w.rows.set(B, { ...w.rows.get(A), user_id: B, object_path: `${B}/profile.bin` });
  await assert.rejects(w.store.load(B), (error) => error instanceof BrowserProfileError && error.code === 'unreadable');
});

test('too large or empty is refused and the old one stays; a failed upload leaves the row alone', async () => {
  const w = world();
  await w.store.save(A, Buffer.from('first'));
  await assert.rejects(w.store.save(A, Buffer.alloc(1001)), (error) => error.code === 'too_large' && error.status === 413);
  await assert.rejects(w.store.save(A, Buffer.alloc(0)), (error) => error.code === 'empty');
  assert.equal((await w.store.load(A)).archive.toString(), 'first');
  const before = w.rows.get(A).updated_at;
  w.clock.t += 5000; w.failures.upload = 1;
  await assert.rejects(w.store.save(A, Buffer.from('second')), (error) => error.code === 'failed');
  assert.equal(w.rows.get(A).updated_at, before);
});

test('what cannot be opened is reported, not guessed: a changed file, and a key that is gone', async () => {
  const w = world();
  await w.store.save(A, Buffer.from('data'));
  const changed = Buffer.from(w.objects.get(`${A}/profile.bin`)); changed[changed.length - 1] ^= 1; w.objects.set(`${A}/profile.bin`, changed);
  await assert.rejects(w.store.load(A), (error) => error.code === 'unreadable');
  const old = world();
  await old.store.save(A, Buffer.from('data'));
  const other = createBrowserProfileStore({ db: { select: async () => [...old.rows.values()], update: async () => [] }, vault: createKeyVault([{ version: 1, key: keyOf() }]), url: 'https://db.example', serviceKey: 'service', fetchImpl: async () => new Response(old.objects.get(`${A}/profile.bin`), { status: 200 }) });
  await assert.rejects(other.load(A), (error) => error.code === 'unreadable');
});

test('sites to log out of are kept with the login state and handed over when it is loaded', async () => {
  const w = world();
  assert.equal(await w.store.addPendingClear(A, ['github.com']), false, 'nothing is kept for a person with no login state');
  await w.store.save(A, Buffer.from('data'));
  await w.store.addPendingClear(A, ['GitHub.com', 'bad site!', 'github.com', 'example.org']);
  assert.deepEqual((await w.store.load(A)).pendingClear, ['github.com', 'example.org']);
  await w.store.save(A, Buffer.from('newer'));
  assert.deepEqual((await w.store.load(A)).pendingClear, ['github.com', 'example.org'], 'saving does not forget them');
  await w.store.clearPending(A);
  assert.deepEqual((await w.store.load(A)).pendingClear, []);
});

test('remove deletes file and row; the sweep removes only what was unused for 14 days, and retries what failed', async () => {
  const w = world();
  await w.store.save(A, Buffer.from('old'));
  w.clock.t += PROFILE_TTL_MS - 1000;
  await w.store.save(B, Buffer.from('recent'));
  w.clock.t += 2000;
  w.failures.remove = 1;
  assert.equal(await w.store.sweepExpired(), 0, 'the first removal fails: the row stays');
  assert.ok(w.rows.has(A) && w.objects.has(`${A}/profile.bin`));
  assert.equal(await w.store.sweepExpired(), 1);
  assert.ok(!w.rows.has(A) && !w.objects.has(`${A}/profile.bin`));
  assert.ok(w.rows.has(B), 'a recent one stays');
  await w.store.remove(B);
  assert.equal(w.rows.size, 0);
  await w.store.remove(B);
  await assert.rejects(w.store.load('not-a-person'), (error) => error.code === 'bad_user');
});
