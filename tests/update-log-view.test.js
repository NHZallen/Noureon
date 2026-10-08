import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import updateLogs from '../src/data/update-logs/entries.js';
import fragment06 from '../src/templates/fragments/06-shell.fragment.js';
import { parseLogBlocks, renderLatestUpdates } from '../src/app/ui/updates/update-log-view.js';

const entry = (version) => updateLogs.find((log) => log.version === version);
const plain = (html) => html;

test('a release note with a heading, a sentence and lists is split into its blocks', () => {
  const blocks = parseLogBlocks(entry('17.7.0').content);
  assert.deepEqual(blocks.slice(0, 3).map((block) => block.type), ['heading', 'paragraph', 'heading']);
  assert.equal(blocks[0].html, 'Noureon 17.7.0 發布說明');
  assert.equal(blocks[2].html, '主要變更');
  const list = blocks[3];
  assert.equal(list.type, 'list');
  assert.equal(list.labelled, true, 'every point starts with a bold lead-in');
});

test('an old note of bold-led lines becomes one list, and a lone sentence a paragraph', () => {
  const [list] = parseLogBlocks(entry('14.8.5').content);
  assert.equal(list.type, 'list');
  assert.equal(list.items.length, 3);
  assert.deepEqual(parseLogBlocks(['只有一句話。']), [{ type: 'paragraph', html: '只有一句話。' }]);
  assert.deepEqual(parseLogBlocks([]), []);
});

test('every note that has text has something to show; the few old empty ones stay empty', () => {
  for (const log of updateLogs) {
    assert.equal(parseLogBlocks(log.content).length > 0, log.content.length > 0, `${log.version} has blocks exactly when it has text`);
  }
});

test('the new-version window turns the first sentence into the headline and numbers the labelled changes', () => {
  const { document } = new Window({ url: 'https://example.test/' });
  const container = document.createElement('div');
  renderLatestUpdates({ document, container, logs: [entry('17.7.0')], sanitize: plain });
  assert.equal(container.querySelector('.ul-v').textContent, '17.7.0');
  assert.match(container.querySelector('.ul-hl').textContent, /^本版本新增「命令工具」/);
  assert.equal(container.textContent.includes('Noureon 17.7.0 發布說明'), false, 'the line that only repeats the version is dropped');
  const numbers = [...container.querySelectorAll('.ul-n')].map((node) => node.textContent);
  assert.deepEqual(numbers.slice(0, 2), ['01', '02']);
  assert.ok(container.querySelector('.ul-it-title').textContent.length > 0);
});

test('the new-version window lists several versions newest first', () => {
  const { document } = new Window({ url: 'https://example.test/' });
  const container = document.createElement('div');
  renderLatestUpdates({ document, container, logs: updateLogs.slice(0, 2), sanitize: plain });
  assert.deepEqual([...container.querySelectorAll('.ul-new .ul-v')].map((node) => node.textContent), updateLogs.slice(0, 2).map((log) => log.version));
});

test('the new-version window keeps the ids the app binds to, and the window of the history is gone (it is the page /updates)', () => {
  const { document } = new Window({ url: 'https://example.test/' });
  document.body.innerHTML = fragment06;
  for (const id of ['latest-update-modal', 'latest-update-content', 'close-latest-update-modal-btn', 'close-latest-update-x-btn', 'latest-update-history-btn']) {
    assert.ok(document.getElementById(id), `${id} is in the page`);
  }
  assert.equal(document.querySelector('#latest-update-modal h2').dataset.langKey, 'newVersionReleased');
  for (const id of ['update-info-modal', 'update-info-content', 'close-update-info-modal-btn']) assert.equal(document.getElementById(id), null, `${id} is gone`);
});
