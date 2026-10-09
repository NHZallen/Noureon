import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MAX_USER_SKILLS } from '../src/data/skill-format.js';
import { createSkillStore } from '../src/app/runtime/skill/skill-store.js';

// A table of rows behind the few calls the store makes.
function fakeClient({ rows = [], failWith = null, failOps = {} } = {}) {
  const calls = [];
  const table = {
    rows,
    from(name) {
      assert.equal(name, 'user_skills');
      const state = { op: 'select', filters: {}, payload: null };
      const done = () => {
        calls.push({ op: state.op, filters: { ...state.filters }, payload: state.payload });
        if (failWith) return { data: null, error: { message: failWith } };
        if (failOps[state.op]) return { data: null, error: { message: failOps[state.op] } };
        if (state.op === 'insert') table.rows.push({ ...state.payload, created_at: state.payload.updated_at });
        if (state.op === 'update') table.rows = table.rows.map((row) => (row.user_id === state.filters.user_id && row.name === state.filters.name ? { ...row, ...state.payload } : row));
        if (state.op === 'delete') table.rows = table.rows.filter((row) => !(row.user_id === state.filters.user_id && row.name === state.filters.name));
        const data = state.op === 'select' ? table.rows.filter((row) => row.user_id === state.filters.user_id).sort((a, b) => a.name.localeCompare(b.name)) : null;
        return { data, error: null };
      };
      const chain = {
        select: () => chain,
        insert: (payload) => { state.op = 'insert'; state.payload = payload; return chain; },
        update: (payload) => { state.op = 'update'; state.payload = payload; return chain; },
        delete: () => { state.op = 'delete'; return chain; },
        eq: (key, value) => { state.filters[key] = value; return chain; },
        order: () => chain,
        limit: () => chain,
        then: (resolve, reject) => Promise.resolve(done()).then(resolve, reject)
      };
      return chain;
    }
  };
  return { client: table, calls };
}

const text = (name, description = 'Does a thing. Use it for things.') => `---\nname: ${name}\ndescription: ${description}\n---\n\nSteps:\n1. one\n2. two\n`;

test('the skills of the signed-in person are read once, then held', async () => {
  const fake = fakeClient({ rows: [{ user_id: 'u1', name: 'b-skill', description: 'd', body: 'b', created_at: '2026-10-01', updated_at: '2026-10-02' }, { user_id: 'u2', name: 'other', description: 'd', body: 'b' }, { user_id: 'u1', name: 'a-skill', description: 'd', body: 'b' }, { user_id: 'u1', name: 'Bad Name', description: 'd', body: 'b' }] });
  let changes = 0;
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1', onChange: () => { changes += 1; } });
  assert.deepEqual(store.cached(), []);
  assert.equal(store.loaded, false);
  const first = await store.list();
  assert.equal(first.ok, true);
  assert.deepEqual(first.skills.map((skill) => skill.name), ['a-skill', 'b-skill'], 'only her own, only real names, in name order');
  assert.equal(first.skills[1].source, 'user');
  assert.equal(first.skills[1].updatedAt, '2026-10-02');
  await store.list();
  assert.equal(fake.calls.length, 1, 'held after the first reading');
  await store.list({ force: true });
  assert.equal(fake.calls.length, 2);
  assert.equal(store.loaded, true);
  assert.ok(changes >= 2);
});

test('with nobody signed in, or no cloud, nothing is read or kept; another account does not see the first one\'s', async () => {
  let userId = '';
  let client = null;
  const fake = fakeClient({ rows: [{ user_id: 'u1', name: 'mine', description: 'd', body: 'b' }] });
  const store = createSkillStore({ getClient: () => client, getUserId: () => userId });
  assert.deepEqual(await store.list(), { ok: false, error: 'signed_out', skills: [] });
  assert.deepEqual(await store.add(text('x1')), { ok: false, error: 'signed_out' });
  assert.deepEqual(await store.remove('x1'), { ok: false, error: 'signed_out' });
  userId = 'u1';
  assert.equal((await store.list()).ok, false, 'signed in but no cloud client');
  client = fake.client;
  assert.equal((await store.list()).skills.length, 1);
  userId = 'u2';
  assert.deepEqual(store.cached(), [], 'the next account starts empty');
  assert.equal((await store.list()).skills.length, 0);
});

test('a skill is added from its text; the same name needs "replace"; the cloud gets exactly the row', async () => {
  const fake = fakeClient();
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1' });
  const added = await store.add(text('meeting-notes'));
  assert.equal(added.ok, true);
  assert.equal(added.skill.name, 'meeting-notes');
  const insert = fake.calls.find((call) => call.op === 'insert');
  assert.deepEqual(Object.keys(insert.payload).sort(), ['body', 'description', 'name', 'updated_at', 'user_id']);
  assert.equal(insert.payload.user_id, 'u1');
  assert.deepEqual(store.cached().map((skill) => skill.name), ['meeting-notes']);

  assert.deepEqual(await store.add(text('meeting-notes')), { ok: false, error: 'name_taken' });
  const replaced = await store.add(text('meeting-notes', 'A new description.'), { replace: true });
  assert.equal(replaced.ok, true);
  const update = fake.calls.find((call) => call.op === 'update');
  assert.deepEqual(update.filters, { user_id: 'u1', name: 'meeting-notes' });
  assert.equal(store.cached()[0].description, 'A new description.');
  assert.equal(fake.client.rows.length, 1);
});

test('what is wrong with a skill is said before the cloud is asked', async () => {
  const fake = fakeClient();
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1', isOfficial: (name) => name === 'official-one' });
  assert.equal((await store.add('no header at all')).error, 'no_header');
  assert.equal((await store.add(text('Bad Name'))).error, 'name_invalid');
  assert.deepEqual(await store.add(text('official-one')), { ok: false, error: 'name_taken' });
  assert.equal(fake.calls.length, 0, 'no call yet');
});

test('at most 50 skills, and a refusal from the cloud is told as it is', async () => {
  const rows = Array.from({ length: MAX_USER_SKILLS }, (_, index) => ({ user_id: 'u1', name: `s${index}`, description: 'd', body: 'b' }));
  const fake = fakeClient({ rows });
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1' });
  assert.deepEqual(await store.add(text('one-more')), { ok: false, error: 'too_many' });
  assert.equal((await store.add(text('s3'), { replace: true })).ok, true, 'changing one is not adding');

  const refused = fakeClient({ failWith: 'skill_limit' });
  const other = createSkillStore({ getClient: () => refused.client, getUserId: () => 'u1' });
  assert.equal((await other.list()).error, 'failed');

  // the cloud's own backstop (the trigger) and any other refusal on adding, and on removing
  const backstop = fakeClient({ failOps: { insert: 'skill_limit' } });
  assert.equal((await createSkillStore({ getClient: () => backstop.client, getUserId: () => 'u1' }).add(text('fine-one'))).error, 'too_many');
  const broken = fakeClient({ rows: [{ user_id: 'u1', name: 'keep-me', description: 'd', body: 'b' }], failOps: { insert: 'network', delete: 'network' } });
  const unlucky = createSkillStore({ getClient: () => broken.client, getUserId: () => 'u1' });
  assert.equal((await unlucky.add(text('fine-one'))).error, 'failed');
  assert.equal((await unlucky.remove('keep-me')).error, 'failed');
  assert.deepEqual(unlucky.cached().map((skill) => skill.name), ['keep-me'], 'what failed is not forgotten or invented');
});

test('a skill is removed by its name, and only a real name is asked for', async () => {
  const fake = fakeClient({ rows: [{ user_id: 'u1', name: 'gone-soon', description: 'd', body: 'b' }] });
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1' });
  await store.list();
  assert.deepEqual(await store.remove('Bad Name'), { ok: false, error: 'name_invalid' });
  assert.deepEqual(await store.remove('gone-soon'), { ok: true });
  assert.deepEqual(store.cached(), []);
  assert.equal(fake.client.rows.length, 0);
  assert.deepEqual(fake.calls.at(-1).filters, { user_id: 'u1', name: 'gone-soon' });
});

test('the migration has the same limits as the app, and each person reaches only their own rows', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261009010000_add_user_skills.sql', import.meta.url), 'utf8');
  assert.match(sql, /char_length\(name\) <= 64 and name ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/);
  assert.match(sql, /char_length\(description\) between 1 and 1024/);
  assert.match(sql, /char_length\(body\) between 1 and 20000/);
  assert.match(sql, />= 50/);
  assert.match(sql, /enable row level security/);
  for (const action of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`for ${action} to authenticated`), action);
  assert.equal((sql.match(/\(select auth\.uid\(\)\)/g) || []).length >= 5, true);
  assert.doesNotMatch(sql, /to anon/);
});
