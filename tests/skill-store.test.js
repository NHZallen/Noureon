import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import JSZip from 'jszip';

import { MAX_USER_SKILLS } from '../src/data/skill-format.js';
import { SKILL_BUNDLE_BUCKET, readSkillBundle, skillBundlePath } from '../src/data/skill-bundle.js';
import { createSkillStore } from '../src/app/runtime/skill/skill-store.js';

// A table of rows behind the few calls the store makes.
function fakeClient({ rows = [], failWith = null, failOps = {}, storageFail = {} } = {}) {
  const calls = [];
  const stored = new Map();
  const table = {
    rows,
    stored,
    storage: {
      from(bucket) {
        return {
          async upload(path, body, options) {
            calls.push({ op: 'upload', bucket, path, options });
            if (storageFail.upload) return { data: null, error: { message: storageFail.upload } };
            stored.set(path, body);
            return { data: { path }, error: null };
          },
          async remove(paths) {
            calls.push({ op: 'remove-file', bucket, paths });
            for (const path of paths) stored.delete(path);
            return { data: [], error: null };
          },
          async download(path) {
            calls.push({ op: 'download', bucket, path });
            if (storageFail.download || !stored.has(path)) return { data: null, error: { message: 'missing' } };
            const bytes = stored.get(path);
            return { data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, error: null };
          }
        };
      }
    },
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
  assert.equal(await store.ensure(), true);
  assert.deepEqual(store.cached(), [], 'the next account starts empty');
  assert.equal(store.loaded, false);
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

test('the account library may answer later (it is loaded when first needed)', async () => {
  const fake = fakeClient({ rows: [{ user_id: 'u1', name: 'late-one', description: 'd', body: 'b' }] });
  const store = createSkillStore({ getClient: async () => fake.client, getUserId: async () => 'u1' });
  assert.equal(await store.ensure(), true);
  assert.deepEqual((await store.list()).skills.map((skill) => skill.name), ['late-one']);
  const nobody = createSkillStore({ getClient: async () => fake.client, getUserId: async () => '' });
  assert.equal(await nobody.ensure(), false);
});

test('the words of the skills are in all five languages with the same keys, every placeholder in each, and every refusal has a sentence', async () => {
  const { SKILL_TEXTS, skillText } = await import('../src/app/runtime/skill/skill-texts.js');
  const languages = Object.keys(SKILL_TEXTS);
  assert.deepEqual(languages, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  const keys = Object.keys(SKILL_TEXTS.en).sort();
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join();
  for (const language of languages) {
    assert.deepEqual(Object.keys(SKILL_TEXTS[language]).sort(), keys, language);
    for (const key of keys) {
      assert.ok(String(SKILL_TEXTS[language][key]).trim(), `${language} ${key}`);
      assert.equal(placeholders(SKILL_TEXTS[language][key]), placeholders(SKILL_TEXTS.en[key]), `${language} ${key} placeholders`);
    }
  }
  const { parseSkillMarkdown } = await import('../src/data/skill-format.js');
  // every reason the parser can give has a sentence, and so have the ones the store gives
  const reasons = ['empty', 'text_too_long', 'no_header', 'header_unclosed', 'header_invalid', 'name_missing', 'name_invalid', 'description_missing', 'description_too_long', 'body_empty', 'body_too_long', 'name_taken', 'too_many', 'failed', 'signed_out'];
  for (const reason of reasons) assert.ok(SKILL_TEXTS.en[`skillErr_${reason}`], reason);
  assert.equal(parseSkillMarkdown('x').ok, false);
  assert.equal(skillText('en', 'skillAdded_notice', { name: 'a-b' }), 'Skill “a-b” added.');
  assert.equal(skillText('xx', 'skillPasteCancel'), 'Cancel', 'English for a language it does not have');
});

test('the store the page holds loads the real one the first time it is asked, and holds nothing before', async () => {
  const { createLazySkillStore } = await import('../src/app/runtime/skill/lazy-skill-store.js');
  const fake = fakeClient({ rows: [{ user_id: 'u1', name: 'late-one', description: 'd', body: 'b' }] });
  const store = createLazySkillStore({ getClient: () => fake.client, getUserId: () => 'u1' });
  assert.deepEqual(store.cached(), []);
  assert.equal(store.loaded, false);
  assert.deepEqual((await store.list()).skills.map((skill) => skill.name), ['late-one']);
  assert.equal(store.loaded, true);
  assert.deepEqual(store.cached().map((skill) => skill.name), ['late-one']);
  assert.equal((await store.add(text('second-one'))).ok, true);
  assert.deepEqual(store.cached().map((skill) => skill.name), ['late-one', 'second-one']);
  assert.deepEqual(await store.remove('late-one'), { ok: true });
  assert.equal(await store.ensure(), true);
});

test('the store the page holds has every call the page makes (a skill as a zip too), not only the ones of a pasted skill', async () => {
  const { createLazySkillStore } = await import('../src/app/runtime/skill/lazy-skill-store.js');
  const { createSkillStore } = await import('../src/app/runtime/skill/skill-store.js');
  const real = createSkillStore({ getClient: () => fakeClient().client, getUserId: () => 'u1' });
  const lazy = createLazySkillStore({ getClient: () => fakeClient().client, getUserId: () => 'u1' });
  // Whatever the real store offers as a function, the one the page holds offers too (a call that is missing is a page that breaks only when it is used).
  for (const name of Object.keys(real).filter((key) => typeof real[key] === 'function')) assert.equal(typeof lazy[name], 'function', name);
  const fake = fakeClient();
  const held = createLazySkillStore({ getClient: () => fake.client, getUserId: () => 'u1' });
  assert.equal((await held.addBundle(await zipWith('zip-skill', { 'references/a.md': 'a' }))).ok, true);
  assert.equal(new TextDecoder().decode((await held.openBundle('zip-skill')).files[0].bytes), 'a');
});

const zipWith = async (name, extra = {}) => {
  const zip = new JSZip();
  zip.file('SKILL.md', text(name));
  for (const [path, content] of Object.entries(extra)) zip.file(path, content);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};

test('a skill with files: the clean zip goes to the bucket of bundles, then the row with the list of files', async () => {
  const fake = fakeClient();
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1' });
  const added = await store.addBundle(await zipWith('sales-report', { 'scripts/summary.py': 'print(1)\n', 'references/format.md': '# F\n' }));
  assert.equal(added.ok, true);
  assert.deepEqual(added.skill.files, [{ path: 'references/format.md', size: 4, kind: 'text' }, { path: 'scripts/summary.py', size: 9, kind: 'script' }]);
  const upload = fake.calls.find((call) => call.op === 'upload');
  assert.equal(upload.bucket, SKILL_BUNDLE_BUCKET);
  assert.equal(upload.path, skillBundlePath('u1', 'sales-report'));
  assert.deepEqual(upload.options, { upsert: true, contentType: 'application/zip' });
  const insert = fake.calls.find((call) => call.op === 'insert');
  assert.deepEqual(Object.keys(insert.payload).sort(), ['body', 'description', 'file_count', 'files', 'name', 'updated_at', 'user_id']);
  assert.equal(insert.payload.file_count, 2);
  // The copy that was kept reads back as the same skill.
  const kept = await readSkillBundle(fake.client.stored.get(upload.path), { buildBundle: false });
  assert.equal(kept.ok, true);
  assert.equal(kept.skill.name, 'sales-report');
  // Read again from the cloud the list comes back from the row.
  const again = await store.list({ force: true });
  assert.deepEqual(again.skills[0].files.map((file) => file.path), ['references/format.md', 'scripts/summary.py']);
});

test('what is wrong with a zip is said before anything is stored; the name rules are those of a pasted skill', async () => {
  const fake = fakeClient({ rows: [{ user_id: 'u1', name: 'taken', description: 'd', body: 'b' }] });
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1', isOfficial: (name) => name === 'official-one' });
  assert.equal((await store.addBundle(new Uint8Array([1, 2, 3]))).error, 'not_a_zip');
  assert.equal((await store.addBundle(await zipWith('a-skill', { 'tool.exe': 'x' }))).error, 'blocked_file');
  assert.equal((await store.addBundle(await zipWith('official-one'))).error, 'name_taken');
  assert.equal((await store.addBundle(await zipWith('taken'))).error, 'name_taken');
  assert.equal(fake.calls.some((call) => call.op === 'upload' || call.op === 'insert'), false);
  const replaced = await store.addBundle(await zipWith('taken', { 'references/a.md': 'a' }), { replace: true });
  assert.equal(replaced.ok, true);
  assert.ok(fake.calls.some((call) => call.op === 'update' && call.payload.file_count === 1));
});

test('a row that cannot be written takes the new copy back; a copy that cannot be stored writes no row', async () => {
  const row = fakeClient({ failOps: { insert: 'boom' } });
  const store = createSkillStore({ getClient: () => row.client, getUserId: () => 'u1' });
  assert.deepEqual(await store.addBundle(await zipWith('a-skill', { 'a.md': 'a' })), { ok: false, error: 'failed' });
  assert.equal(row.client.stored.size, 0, 'the copy is taken back');
  const limit = fakeClient({ failOps: { insert: 'skill_limit' } });
  assert.equal((await createSkillStore({ getClient: () => limit.client, getUserId: () => 'u1' }).addBundle(await zipWith('a-skill'))).error, 'too_many');
  const storage = fakeClient({ storageFail: { upload: 'quota' } });
  assert.equal((await createSkillStore({ getClient: () => storage.client, getUserId: () => 'u1' }).addBundle(await zipWith('a-skill'))).error, 'failed');
  assert.equal(storage.calls.some((call) => call.op === 'insert'), false);
});

test('with nobody signed in a zip is not taken', async () => {
  const store = createSkillStore({ getClient: () => null, getUserId: () => '' });
  assert.deepEqual(await store.addBundle(await zipWith('a-skill')), { ok: false, error: 'signed_out' });
  assert.deepEqual(await store.openBundle('a-skill'), { ok: false, error: 'signed_out' });
});

test('the files of a skill are opened from its zip once, and held until the skill changes', async () => {
  const fake = fakeClient();
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1' });
  await store.addBundle(await zipWith('sales-report', { 'references/format.md': '# Format\n' }));
  await store.add(text('plain-skill'));
  const first = await store.openBundle('sales-report');
  assert.equal(first.ok, true);
  assert.equal(new TextDecoder().decode(first.files[0].bytes), '# Format\n');
  await store.openBundle('sales-report');
  assert.equal(fake.calls.filter((call) => call.op === 'download').length, 1, 'held after the first');
  assert.deepEqual(await store.openBundle('plain-skill'), { ok: false, error: 'no_files' });
  assert.deepEqual(await store.openBundle('nobody'), { ok: false, error: 'no_files' });
  assert.equal((await store.openBundle('Bad Name')).error, 'name_invalid');
  await store.addBundle(await zipWith('sales-report', { 'references/format.md': 'new' }), { replace: true });
  const changed = await store.openBundle('sales-report');
  assert.equal(new TextDecoder().decode(changed.files[0].bytes), 'new');
  assert.equal(fake.calls.filter((call) => call.op === 'download').length, 2);
  const lost = fakeClient({ storageFail: { download: 'x' }, rows: [{ user_id: 'u1', name: 'sales-report', description: 'd', body: 'b', files: [{ path: 'a.md', size: 1, kind: 'text' }] }] });
  assert.deepEqual(await createSkillStore({ getClient: () => lost.client, getUserId: () => 'u1' }).openBundle('sales-report'), { ok: false, error: 'failed' });
});

test('removing a skill with files removes its zip; a text that takes the place of one leaves it without files', async () => {
  const fake = fakeClient();
  const store = createSkillStore({ getClient: () => fake.client, getUserId: () => 'u1' });
  await store.addBundle(await zipWith('sales-report', { 'a.md': 'a' }));
  await store.addBundle(await zipWith('other-skill', { 'b.md': 'b' }));
  assert.equal(fake.client.stored.size, 2);
  assert.equal((await store.remove('sales-report')).ok, true);
  assert.deepEqual([...fake.client.stored.keys()], [skillBundlePath('u1', 'other-skill')]);
  const replaced = await store.add(text('other-skill'), { replace: true });
  assert.equal(replaced.ok, true);
  assert.deepEqual(replaced.skill.files, []);
  assert.equal(fake.client.stored.size, 0);
  assert.ok(fake.calls.some((call) => call.op === 'update' && call.payload.file_count === 0));
  const plain = await store.add(text('plain-skill'));
  assert.equal(plain.ok, true);
  await store.remove('plain-skill');
  assert.equal(fake.calls.filter((call) => call.op === 'remove-file').length, 2, 'a skill without files asks for no removal');
});

test('the migration of the bundles: the columns, the private bucket, and each person reaches only their own folder', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261009020000_add_user_skill_bundles.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists file_count integer not null default 0 check \(file_count between 0 and 60\)/);
  assert.match(sql, /add column if not exists files jsonb not null default '\[\]'::jsonb/);
  assert.match(sql, /'user-skill-bundles', 'user-skill-bundles', false, 5242880/);
  for (const operation of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`on storage\\.objects for ${operation} to authenticated`));
  assert.equal((sql.match(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g) || []).length, 5, 'the four policies, the update with both clauses');
});
