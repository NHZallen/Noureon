import assert from 'node:assert/strict';
import test from 'node:test';

import { DRIVE_KINDS, createDriveSource } from '../src/app/runtime/projects/project-source-drive.js';

// The files of Google Drive as sources of a project: what is asked of the connector, what is offered, and what is read.

const listing = [
  { id: 'd1', name: 'Budget 2026', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-10-30T10:00:00.000Z', size: undefined },
  { id: 'd2', name: 'Plan', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-10-29T10:00:00.000Z' },
  { id: 'd3', name: 'photo.png', mimeType: 'image/png', modifiedTime: '2026-10-28T10:00:00.000Z' },
  { id: 'd4', name: 'notes.md', mimeType: 'text/markdown', modifiedTime: '2026-10-27T10:00:00.000Z', size: '120' }
];

test('a search asks for the readable kinds only, and what comes back that is not one is dropped', async () => {
  const asked = [];
  const drive = createDriveSource({ call: async (tool, args) => { asked.push([tool, args]); return { ok: true, text: JSON.stringify(listing), isError: false }; } });
  const found = await drive.search('budget');
  assert.equal(asked[0][0], 'drive_search_files');
  assert.equal(asked[0][1].text, 'budget');
  for (const type of Object.keys(DRIVE_KINDS)) assert.ok(asked[0][1].query.includes(`mimeType = '${type}'`), type);
  assert.ok(asked[0][1].max_results <= 100);
  assert.deepEqual(found.files.map((file) => [file.id, file.kind]), [['d1', 'doc'], ['d2', 'sheet'], ['d4', 'text']]);
  assert.equal(found.files[2].size, 120);
});

test('a search that fails says why: not connected, or a failure; a text that is not a list is a failure', async () => {
  assert.deepEqual(await createDriveSource({ call: async () => ({ ok: false, code: 'not_connected' }) }).search(), { ok: false, code: 'not_connected' });
  assert.deepEqual(await createDriveSource({ call: async () => ({ ok: false, code: 'http-500' }) }).search(), { ok: false, code: 'failed' });
  assert.deepEqual(await createDriveSource({ call: async () => ({ ok: true, text: 'Google said no', isError: true }) }).search(), { ok: false, code: 'failed' });
  assert.deepEqual(await createDriveSource({ call: async () => ({ ok: true, text: 'not json', isError: false }) }).search(), { ok: false, code: 'failed' });
  assert.deepEqual(await createDriveSource({ call: async () => ({ ok: true, text: '{}', isError: false }) }).search(), { ok: true, files: [] });
});

test('a file is read into the text of a source without the line the tool puts first', async () => {
  const asked = [];
  const drive = createDriveSource({ call: async (tool, args) => { asked.push([tool, args]); return { ok: true, text: 'Budget 2026 (application/vnd.google-apps.document)\n\nLine one\nLine two', isError: false }; } });
  const read = await drive.read({ id: 'd1', name: 'Budget 2026', mimeType: 'application/vnd.google-apps.document' });
  assert.deepEqual(asked, [['drive_read_file', { file_id: 'd1' }]]);
  assert.deepEqual(read, { ok: true, title: 'Budget 2026', mime: 'application/vnd.google-apps.document', size: 17, text: 'Line one\nLine two', truncated: false });
  assert.deepEqual(await createDriveSource({ call: async () => ({ ok: true, text: 'x (text/plain)\n\n   ', isError: false }) }).read({ id: 'e', name: 'x' }), { ok: false, code: 'empty' });
  assert.deepEqual(await createDriveSource({ call: async () => ({ ok: true, text: 'This kind of file cannot be read as text.', isError: true }) }).read({ id: 'e', name: 'x' }), { ok: false, code: 'failed' });
});
