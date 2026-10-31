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
