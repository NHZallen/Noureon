import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { callWith, createDatabase } from '../helpers/database/supabase-database.js';

// The instructions of a project (supabase/migrations/20261031090000_add_project_instructions.sql) with the real SQL: they are saved with the folder, come back through the delta,
// and a page that does not know them (an older one) writes the folder back without losing them.

let database;
let ada;
let A;
const id = () => crypto.randomUUID();

before(async () => {
  database = await createDatabase();
  ada = await database.createUser('ada@example.test');
  A = database.asUser(ada);
}, { timeout: 120_000 });
after(() => database?.close());

const folderRow = async (folderId) => (await database.service.query('select name, instructions from public.workspace_folders where id = $1', [folderId]))[0];
const delta = async () => (await A.query('select public.fetch_workspace_delta(0, 1000) as d'))[0].d;

test('the instructions are saved with the folder and come back in the delta', async () => {
  const folderId = id();
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'Translation', instructions: 'Answer in English.' }]);
  assert.deepEqual(await folderRow(folderId), { name: 'Translation', instructions: 'Answer in English.' });
  const rows = JSON.stringify(await delta());
  assert.match(rows, /Answer in English\./);
});

test('a folder that never had instructions has an empty text', async () => {
  const folderId = id();
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'Old' }]);
  assert.equal((await folderRow(folderId)).instructions, '');
});

test('a page that sends no instructions (an older version) keeps what is saved; one that sends an empty text clears it', async () => {
  const folderId = id();
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P', instructions: 'Be brief.' }]);
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P renamed' }]);
  assert.deepEqual(await folderRow(folderId), { name: 'P renamed', instructions: 'Be brief.' });
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P renamed', instructions: '' }]);
  assert.equal((await folderRow(folderId)).instructions, '');
});

test('several folders in one write each keep their own instructions, and a long text is cut to what is kept', async () => {
  const one = id();
  const two = id();
  await callWith(A, 'upsert_workspace_folders', [{ id: one, name: 'One', instructions: 'a' }, { id: two, name: 'Two', instructions: 'b'.repeat(9000) }]);
  assert.equal((await folderRow(one)).instructions, 'a');
  assert.equal((await folderRow(two)).instructions.length, 8000);
  await callWith(A, 'upsert_workspace_folders', [{ id: one, name: 'One' }, { id: two, name: 'Two', instructions: 'c' }]);
  assert.equal((await folderRow(one)).instructions, 'a');
  assert.equal((await folderRow(two)).instructions, 'c');
});

test('a folder is pinned or not, and a page that sends no pin (an older version) keeps what is saved', async () => {
  const folderId = id();
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P' }]);
  const pinned = async () => (await database.service.query('select pinned from public.workspace_folders where id = $1', [folderId]))[0].pinned;
  assert.equal(await pinned(), false);
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P', pinned: true }]);
  assert.equal(await pinned(), true);
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P renamed', instructions: 'x' }]);
  assert.equal(await pinned(), true, 'a write without the pin keeps it');
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P renamed', pinned: false }]);
  assert.equal(await pinned(), false);
  assert.equal((await folderRow(folderId)).instructions, 'x', 'and a write without the instructions keeps them');
});

test('the sources of a project are saved with the folder, an older page that sends none keeps them, and more than 20 are refused', async () => {
  const folderId = id();
  const sourcesOf = async () => (await database.service.query('select sources from public.workspace_folders where id = $1', [folderId]))[0].sources;
  const source = (n) => ({ id: `s${n}`, kind: 'text', title: `Note ${n}`, mime: '', size: 5, text: 'hello', addedAt: '2026-10-31T00:00:00.000Z' });
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P' }]);
  assert.deepEqual(await sourcesOf(), [], 'a folder starts with none');
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P', sources: [source(1), source(2)] }]);
  assert.equal((await sourcesOf()).length, 2);
  assert.match(JSON.stringify(await delta()), /Note 2/, 'and they come back in the delta');
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P renamed' }]);
  assert.equal((await sourcesOf()).length, 2, 'a write without them keeps them');
  await callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P renamed', sources: [] }]);
  assert.deepEqual(await sourcesOf(), [], 'an empty list takes them away');
  await assert.rejects(callWith(A, 'upsert_workspace_folders', [{ id: folderId, name: 'P', sources: Array.from({ length: 21 }, (_, n) => source(n)) }]), /sources_check|check constraint/);
});
