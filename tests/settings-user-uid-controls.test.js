import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createUserUidControls, userUidMarkup } from '../src/app/runtime/legacy-core/settings-user-uid-controls.js';

function createHarness({ rows = {}, error = null, configured = true, clipboard } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = userUidMarkup('Copy UID');
  if (clipboard) Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
  const queries = [];
  const timers = [];
  const controls = createUserUidControls({
    document,
    isConfigured: () => configured,
    getText: (key, fallback) => ({ userUidCopy: 'Copy UID', userUidCopied: 'UID copied' })[key] || fallback,
    scheduleTimeout: (callback, delay) => timers.push({ callback, delay }),
    getSupabase: () => ({
      from: (table) => ({
        select: (columns) => ({
          eq: (column, value) => ({
            maybeSingle: async () => {
              queries.push([table, columns, column, value]);
              return error ? { data: null, error } : { data: rows[value] ? { uid: rows[value] } : null, error: null };
            }
          })
        })
      })
    })
  });
  const row = () => document.getElementById('user-uid-row');
  const value = () => document.getElementById('user-uid-value').textContent;
  const digits = () => document.getElementById('user-uid-value').dataset.uid;
  return { document, controls, queries, timers, row, value, digits };
}

const cloudUser = { authProvider: 'supabase', supabaseUserId: 'user-1' };

test('the UID of a cloud account is read from its own row and shown', async () => {
  const { controls, queries, row, value, digits } = createHarness({ rows: { 'user-1': '48201735' } });
  assert.equal(row().classList.contains('hidden'), true, 'nothing is shown before it is known');

  await controls.refresh(cloudUser);

  assert.deepEqual(queries, [['user_uids', 'uid', 'user_id', 'user-1']]);
  assert.equal(row().classList.contains('hidden'), false);
  assert.equal(value(), 'NR-48201735', 'the prefix is for the eye');
  assert.equal(digits(), '48201735');
});

test('the same account is asked only once', async () => {
  const { controls, queries, value } = createHarness({ rows: { 'user-1': '48201735' } });
  await controls.refresh(cloudUser);
  await controls.refresh(cloudUser);
  assert.equal(queries.length, 1);
  assert.equal(value(), 'NR-48201735');
});

test('a local account, an account without a UID, a failed read and a bad value show no line', async () => {
  const local = createHarness({ rows: { 'user-1': '48201735' } });
  await local.controls.refresh({ authProvider: 'local', username: 'allen' });
  assert.equal(local.row().classList.contains('hidden'), true);
  assert.deepEqual(local.queries, []);

  const unconfigured = createHarness({ rows: { 'user-1': '48201735' }, configured: false });
  await unconfigured.controls.refresh(cloudUser);
  assert.equal(unconfigured.row().classList.contains('hidden'), true);

  const missing = createHarness({ rows: {} });
  await missing.controls.refresh(cloudUser);
  assert.equal(missing.row().classList.contains('hidden'), true);

  const failed = createHarness({ error: { message: 'relation "user_uids" does not exist' } });
  await failed.controls.refresh(cloudUser);
  assert.equal(failed.row().classList.contains('hidden'), true);

  const malformed = createHarness({ rows: { 'user-1': '12ab' } });
  await malformed.controls.refresh(cloudUser);
  assert.equal(malformed.row().classList.contains('hidden'), true);
});

test('another account replaces the shown UID, and signing out hides it', async () => {
  const { controls, row, value } = createHarness({ rows: { 'user-1': '48201735', 'user-2': '61937402' } });
  await controls.refresh(cloudUser);
  await controls.refresh({ authProvider: 'supabase', supabaseUserId: 'user-2' });
  assert.equal(value(), 'NR-61937402');
  await controls.refresh(null);
  assert.equal(row().classList.contains('hidden'), true);
});

test('the copy button copies the 8 digits without the prefix and says so for a moment', async () => {
  const written = [];
  const { document, controls, timers } = createHarness({
    rows: { 'user-1': '48201735' },
    clipboard: { writeText: async (text) => { written.push(text); } }
  });
  await controls.refresh(cloudUser);
  controls.bind();
  controls.bind();
  const button = document.getElementById('user-uid-copy');
  assert.equal(button.getAttribute('aria-label'), 'Copy UID');

  button.dispatchEvent(new document.defaultView.Event('click'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(written, ['48201735']);
  assert.equal(button.classList.contains('is-copied'), true);
  assert.equal(button.getAttribute('aria-label'), 'UID copied');
  assert.equal(timers.length, 1, 'a second bind does not add a second listener');

  timers[0].callback();
  assert.equal(button.classList.contains('is-copied'), false);
  assert.equal(button.getAttribute('aria-label'), 'Copy UID');
});

test('a copy that fails changes nothing on the button', async () => {
  const { document, controls, timers } = createHarness({
    rows: { 'user-1': '48201735' },
    clipboard: { writeText: async () => { throw new Error('denied'); } }
  });
  await controls.refresh(cloudUser);
  controls.bind();
  const button = document.getElementById('user-uid-copy');
  button.dispatchEvent(new document.defaultView.Event('click'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(button.classList.contains('is-copied'), false);
  assert.equal(timers.length, 0);
});

test('the migration gives a UID to every account, once, with no way to change it', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../supabase/migrations/20261006010000_add_user_uids.sql', import.meta.url), 'utf8');
  assert.match(sql, /uid text not null unique check \(uid ~ '\^\[1-9\]\[0-9\]\{7\}\$'\)/);
  assert.match(sql, /after insert on auth\.users/);
  assert.match(sql, /coalesce\(new\.is_anonymous, false\)/);
  assert.match(sql, /create policy "Users read their own UID" on public\.user_uids\s+for select to authenticated/);
  assert.doesNotMatch(sql, /for (insert|update|delete)\s+to authenticated/);
  assert.match(sql, /grant select on table public\.user_uids to authenticated;/);
  assert.match(sql, /raise exception 'A UID cannot be changed'/);
  assert.match(sql, /select u\.id from auth\.users u/, 'accounts that exist already are given one');
});
