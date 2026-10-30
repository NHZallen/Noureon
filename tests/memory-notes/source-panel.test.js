import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createSourcePanel } from '../../src/app/ui/citations/source-panel.js';

const web = [{ n: 1, url: 'https://www.cwa.gov.tw/a', title: 'Forecast' }, { n: 2, url: 'https://weather.yam.com/b', title: 'Week' }];
const groups = {
  web,
  notes: [{ id: 'n1', text: 'Allen lives in Banqiao.', kind: 'fact', standing: false }, { id: 'n2', gone: true }, { id: 'n3', text: 'Always answer in Traditional Chinese.', kind: 'preference', standing: true }],
  conversations: [{ id: 'c1', title: 'Scooter commute', at: '2026-10-21T00:00:00.000Z', available: true }, { id: 'c2', title: 'Old chat', at: '2026-09-01T00:00:00.000Z', available: false }]
};

function setup(extra = {}) {
  const window = new Window();
  const { document } = window;
  const calls = { marked: [], opened: [] };
  const panel = createSourcePanel(document, groups, { language: 'en', kindLabel: (kind) => ({ fact: 'Fact', preference: 'Preference' }[kind]), onNotRelevant: async (id) => { calls.marked.push(id); }, onOpenChat: (id) => calls.opened.push(id), ...extra });
  document.body.append(panel);
  return { window, document, panel, calls };
}

test('the panel has a tab for each kind that has something, with its count, and starts on All with the memory and chats before the pages', () => {
  const { window, panel } = setup();
  const tabs = [...panel.querySelectorAll('.source-panel-tab')].map((tab) => tab.textContent);
  assert.deepEqual(tabs, ['All7', 'Web2', 'Memory3', 'Chats2']);
  const rows = [...panel.querySelectorAll('.source-panel-body > *')];
  assert.equal(rows.length, 7);
  assert.ok(rows[0].classList.contains('is-memory') && rows[3].classList.contains('is-chat') && rows[5].classList.contains('source-item'));
  window.happyDOM.abort();
});

test('a tab shows only its kind, and a kind with nothing has no tab', () => {
  const { window, panel } = setup();
  panel.querySelector('[data-tab="memory"]').click();
  assert.equal(panel.querySelectorAll('.source-panel-body > .is-memory').length, 3);
  assert.equal(panel.querySelectorAll('.source-panel-body > .is-chat').length, 0);
  assert.equal(panel.querySelector('[data-tab="memory"]').getAttribute('aria-selected'), 'true');
  window.happyDOM.abort();
  const { document, window: other } = setup();
  const onlyChats = createSourcePanel(document, { conversations: groups.conversations }, { language: 'en' });
  assert.deepEqual([...onlyChats.querySelectorAll('.source-panel-tab')].map((tab) => tab.dataset.tab), ['all', 'chats']);
  other.happyDOM.abort();
});

test('a note says what it is, a standing one says it comes with every reply and cannot be marked, a deleted one says so', () => {
  const { window, panel } = setup();
  panel.querySelector('[data-tab="memory"]').click();
  const [normal, gone, standing] = [...panel.querySelectorAll('.is-memory')];
  assert.match(normal.textContent, /Allen lives in Banqiao\./);
  assert.match(normal.textContent, /Memory・Fact/);
  assert.ok(normal.querySelector('.source-row-action'));
  assert.match(gone.textContent, /This note was deleted/);
  assert.match(standing.textContent, /Standing: brought to every reply/);
  assert.equal(standing.querySelector('.source-row-action'), null, 'it is there every time, so "not relevant here" would mean nothing');
  window.happyDOM.abort();
});

test('"Not relevant here" is asked of the page once and then says it is marked', async () => {
  const { window, panel, calls } = setup();
  panel.querySelector('[data-tab="memory"]').click();
  panel.querySelector('.is-memory .source-row-action').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.marked, ['n1']);
  assert.match(panel.querySelector('.is-memory').textContent, /Marked/);
  assert.equal(panel.querySelector('.is-memory .source-row-action'), null);
  window.happyDOM.abort();
});

test('a chat shows its name and day and can be opened; one that was deleted keeps its name, says so, and has no button', () => {
  const { window, panel, calls } = setup();
  panel.querySelector('[data-tab="chats"]').click();
  const [there, gone] = [...panel.querySelectorAll('.is-chat')];
  assert.match(there.textContent, /Scooter commute/);
  assert.match(there.textContent, /October 21, 2026/);
  there.querySelector('.source-row-action').click();
  assert.deepEqual(calls.opened, ['c1']);
  assert.match(gone.textContent, /Old chat/);
  assert.match(gone.textContent, /The chat was deleted/);
  assert.equal(gone.querySelector('.source-row-action'), null);
  window.happyDOM.abort();
});
