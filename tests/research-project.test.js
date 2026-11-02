import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { addFailureKey, addReportToProject } from '../src/app/ui/research/research-project.js';
import { reportMarkdown } from '../src/app/ui/research/research-export.js';

// A finished deep research added to a project as a Markdown file (research-project.js).

const REPORT = { title: 'Heat pumps: a survey', text: 'Heat pumps move heat.\n\n## Costs\n\nAbout 9 000 euros [1].', sources: [{ n: 1, title: 'Agency guide', url: 'https://example.org/guide' }] };

function setup(api) {
  const window = new Window({ url: 'https://noureon.test/' });
  const notes = [];
  const run = (options = {}) => addReportToProject({ report: REPORT, language: 'en', document: window.document, showNotification: (message, type) => notes.push([message, type]), api, ...options });
  return { window, notes, run };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test('the failure words: a report already there, a project with no room, anything else', () => {
  assert.equal(addFailureKey('duplicate'), 'alreadyInProject');
  for (const code of ['full', 'too_much', 'files_too_much']) assert.equal(addFailureKey(code), 'projectFull');
  for (const code of ['unreadable', 'failed', undefined]) assert.equal(addFailureKey(code), 'addToProjectFailed');
});

test('with no projects, or no projects service, the person is told and nothing opens', async () => {
  const none = setup({ list: () => [], addFile: async () => ({ ok: true }) });
  assert.deepEqual(await none.run(), { ok: false });
  assert.match(none.notes[0][0], /No project yet/);
  assert.equal(none.window.document.querySelector('.pj-backdrop'), null);
  const missing = setup(null);
  assert.deepEqual(await missing.run({ api: null }), { ok: false });
  assert.match(missing.notes[0][0], /Could not add it/);
});

test('the sheet lists the projects; the one chosen gets the report as a Markdown file with its sources, and the person is told', async () => {
  const added = [];
  const api = { list: () => [{ id: 'p1', name: 'Home' }, { id: 'p2', name: 'Work' }], addFile: async (id, file) => { added.push([id, file.name, file.type, await file.text()]); return { ok: true, truncated: false }; } };
  const { window, notes, run } = setup(api);
  const pending = run();
  await tick();
  const items = [...window.document.querySelectorAll('.pj-action-item')];
  assert.deepEqual(items.map((item) => item.textContent), ['Home', 'Work']);
  assert.equal(window.document.querySelector('.pj-action-title').textContent, 'Add to which project?');
  items[1].click();
  assert.deepEqual(await pending, { ok: true, project: 'p2' });
  assert.equal(added.length, 1);
  assert.deepEqual([added[0][0], added[0][1]], ['p2', 'Heat pumps a survey.md']);
  assert.match(added[0][2], /^text\/markdown/);
  assert.equal(added[0][3], reportMarkdown(REPORT, 'en'));
  assert.match(added[0][3], /\[1\] Agency guide — https:\/\/example\.org\/guide/, 'the list of sources comes with it');
  assert.deepEqual(notes, [['Added to "Work".', 'success']]);
  assert.equal(window.document.querySelector('.pj'), null, 'the sheet is gone');
});

test('a report that is already there, a project that is full and a report that is cut are each told; closing the sheet says nothing', async () => {
  let result = { ok: false, code: 'duplicate' };
  const api = { list: () => [{ id: 'p1', name: 'Home' }], addFile: async () => result };
  for (const [next, pattern, type] of [[{ ok: false, code: 'duplicate' }, /already has this report/, 'error'], [{ ok: false, code: 'full' }, /is full/, 'error'], [{ ok: true, truncated: true }, /first 100,000 characters/, 'success'], [{ ok: false, code: 'failed' }, /Could not add it/, 'error']]) {
    result = next;
    const { window, notes, run } = setup(api);
    const pending = run();
    await tick();
    window.document.querySelector('.pj-action-item').click();
    await pending;
    assert.match(notes.at(-1)[0], pattern);
    assert.equal(notes.at(-1)[1], type);
  }
  const { window, notes, run } = setup(api);
  const pending = run();
  await tick();
  window.document.querySelector('.pj-backdrop').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.deepEqual(await pending, { ok: false });
  assert.deepEqual(notes, []);
});
