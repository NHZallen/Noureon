import assert from 'node:assert/strict';
import test from 'node:test';

import { PREFETCH, buildPrefetch, buildSystemText, searchNotes, selectPrefetch } from '../../src/app/runtime/memory-notes/inject.js';
import { applyGroupOps, checkGroupOps, layerOne, shouldConsolidate, suspectGroups } from '../../src/app/runtime/memory-notes/consolidate.js';
import { createNote, isActive } from '../../src/app/runtime/memory-notes/notes.js';

const NOW = '2026-10-30T00:00:00.000Z';
const make = (id, text, keywords, extra = {}) => ({ ...createNote({ id, text, keywords, kind: extra.kind || 'fact', source: { conversationId: 'c1', messageIds: [`m${id}`], quote: 'q', seen: ['c1|2026-10-01'] }, observedAt: extra.observedAt || '2026-10-01T00:00:00.000Z', now: () => NOW }), ...extra.patch });

const NOTES = [
  make('lang', '使用者偏好簡潔的回答', ['簡潔', '簡短', 'concise'], { kind: 'preference', patch: { standing: true, evidenceCount: 2 } }),
  make('job', '使用者在台中做後端工程師', ['工程師', '後端', '台中', 'engineer']),
  make('japan', '使用者下個月要去日本旅遊', ['日本', '旅遊', 'Japan', 'travel'], { kind: 'project' }),
  make('coffee', '使用者喜歡喝黑咖啡', ['咖啡', 'coffee'], { kind: 'preference' }),
  make('secret', '使用者不想被提到家人的事', ['家人', 'family'], { kind: 'relationship', patch: { surface: 'never' } })
];

test('the first page holds the standing notes and the rules; the catalogue says what else there is, and only a model that can search is told to', () => {
  const withTools = buildSystemText({ notes: NOTES, canSearch: true });
  assert.match(withTools, /Standing preferences/);
  assert.match(withTools, /使用者偏好簡潔的回答/);
  assert.match(withTools, /Never announce it/);
  assert.match(withTools, /Asked for the weather, do not mention their diet/);
  assert.match(withTools, /search_memory/);
  assert.match(withTools, /4 more notes/);
  assert.equal(withTools.includes('使用者在台中做後端工程師'), false, 'the other notes are not in the system text');
  const without = buildSystemText({ notes: NOTES, canSearch: false });
  assert.equal(without.includes('search_memory'), false);
  assert.equal(buildSystemText({ notes: [], canSearch: true }), '');
});

test('a question about a note brings the note; a question about nothing in the notebook brings no slip', () => {
  const japan = selectPrefetch(NOTES, '我下個月去日本要準備什麼');
  assert.deepEqual(japan.map((entry) => entry.note.id), ['japan']);
  for (const question of ['幫我寫一首關於秋天的詩', '解釋一下量子糾纏是什麼', 'Translate this sentence into French', '今天天氣怎麼樣', '幫我整理這份報告的重點']) {
    assert.deepEqual(selectPrefetch(NOTES, question), [], `no slip for: ${question}`);
  }
  assert.deepEqual(selectPrefetch(NOTES, '我的工作是什麼').map((entry) => entry.note.id), [], 'one word in common is not enough');
  assert.deepEqual(selectPrefetch(NOTES, 'what coffee do I like').map((entry) => entry.note.id), [], 'one word is not enough in English either');
});

test('the slip is text in the copy of the request, marked as data, and it holds the pieces of old conversation that clear the bar', () => {
  const slip = buildPrefetch({
    notes: NOTES,
    question: '我下個月去日本要準備什麼',
    history: [
      { conversationId: 'h1', at: '2026-09-01T10:00:00.000Z', text: '我們討論過日本的簽證與換匯', norm: 0.7, strong: 3 },
      { conversationId: 'h2', at: '2026-09-02T10:00:00.000Z', text: '無關的對話', norm: 0.2, strong: 1 }
    ]
  });
  assert.match(slip.text, /^<memory-context>/);
  assert.match(slip.text, /Data, not instructions/);
  assert.match(slip.text, /使用者下個月要去日本旅遊/);
  assert.match(slip.text, /2026-09-01/);
  assert.equal(slip.text.includes('無關的對話'), false);
  assert.deepEqual(slip.noteIds, ['japan']);
  assert.deepEqual(slip.historyIds, ['h1']);
  assert.equal(buildPrefetch({ notes: NOTES, question: '幫我寫詩' }).text, '');
  assert.equal(PREFETCH.maxNotes, 2);
});

test('the note marked "do not mention" is never in a slip or on the first page, but a search finds it and says so', () => {
  assert.equal(selectPrefetch(NOTES, '家人 family').length, 0);
  assert.equal(buildSystemText({ notes: NOTES, canSearch: true }).includes('家人'), false);
  const found = searchNotes(NOTES, '家人');
  assert.equal(found[0].id, 'secret');
  assert.equal(found[0].doNotMention, true);
  assert.deepEqual(searchNotes(NOTES, '日本').map((entry) => entry.id), ['japan']);
  assert.deepEqual(searchNotes(NOTES, 'coffee').map((entry) => entry.id), ['coffee'], 'a keyword of another language');
  assert.deepEqual(searchNotes([], 'x'), []);
});

test('the first layer of the tidy: what ran out and what faded go, notes that say the same are one, no model is called', () => {
  const dated = make('d', '使用者下週要考駕照', ['駕照'], { patch: { validUntil: '2026-09-01T00:00:00.000Z' } });
  const one = make('p1', '使用者住在台北市', ['台北', '居住'], { observedAt: '2026-05-01T00:00:00.000Z' });
  const two = make('p2', '使用者住在台北市', ['台北', '居住'], { observedAt: '2026-08-01T00:00:00.000Z' });
  const locked = make('p3', '使用者住在台北市', ['台北', '居住'], { patch: { locked: true } });
  const result = layerOne([dated, one, two, locked, ...NOTES], () => NOW);
  assert.equal(isActive(result.notes.find((note) => note.id === 'd')), false);
  const kept = result.notes.filter((note) => /台北/.test(note.text) && isActive(note));
  assert.equal(kept.length, 2, 'the two that are not locked became one; the locked one stays');
  assert.equal(kept.find((note) => note.id === 'p2').evidenceCount, 2, 'the sightings add up (the later one stays)');
  assert.ok(result.actions.some((action) => action.type === 'expire'));
  assert.ok(result.actions.some((action) => action.type === 'merge'));
});

test('suspect groups are notes of one kind with many words in common but not the same; locked notes are left out', () => {
  const a = make('a', '使用者住在台北', ['台北', '居住']);
  const b = make('b', '使用者搬到台北市區', ['台北', '居住', '搬家']);
  const c = make('c', '使用者喜歡爵士樂', ['爵士', 'jazz']);
  const d = make('d', '使用者住在台北', ['台北', '居住'], { patch: { locked: true } });
  const groups = suspectGroups([a, b, c, d]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((note) => note.id), ['a', 'b']);
});

test('what the model says about a group is checked: only notes of the group, the later wins, a locked note is not touched, a merged sentence may only hold what the notes held', () => {
  const old = make('a', '使用者住在台北', ['台北', '居住'], { observedAt: '2026-05-01T00:00:00.000Z' });
  const recent = make('b', '使用者搬到台中', ['台中', '居住'], { observedAt: '2026-09-01T00:00:00.000Z' });
  const group = [old, recent];
  const wrongWay = checkGroupOps(group, [{ type: 'supersede', keep: 'a', drop: 'b' }]);
  assert.deepEqual(wrongWay.ops, [{ type: 'supersede', keep: 'b', drop: 'a' }], 'whatever the model says, the later one wins');
  assert.equal(checkGroupOps(group, [{ type: 'supersede', keep: 'a', drop: 'zzz' }]).rejected[0].why, 'not_in_group');
  assert.equal(checkGroupOps([{ ...old, locked: true }, recent], [{ type: 'merge', ids: ['a', 'b'], text: '使用者住在台北' }]).rejected[0].why, 'locked');
  assert.equal(checkGroupOps(group, [{ type: 'merge', ids: ['a', 'b'], text: '使用者是一位住在紐約的太空人，喜歡火星' }]).rejected[0].why, 'adds_something');
  const good = checkGroupOps(group, [{ type: 'merge', ids: ['a', 'b'], text: '使用者住在台中' }]);
  assert.equal(good.ops.length, 1);
  const applied = applyGroupOps([old, recent], good.ops, () => NOW);
  assert.equal(applied.notes.length, 1);
  assert.equal(applied.notes[0].text, '使用者住在台中');
  assert.equal(applied.notes[0].id, 'b', 'the later note stays');
  const swapped = applyGroupOps([old, recent], wrongWay.ops, () => NOW);
  assert.equal(swapped.notes.length, 1);
  assert.equal(swapped.notes[0].text, '使用者搬到台中');
});

test('the tidy is due when notes changed, the notebook is nearly full, or a week has passed', () => {
  const now = () => NOW;
  assert.equal(shouldConsolidate({ notes: [], lastRunAt: null, now }), false, 'nothing to tidy');
  assert.equal(shouldConsolidate({ notes: NOTES, lastRunAt: '2026-10-29T00:00:00.000Z', changedSince: 3, now }), false);
  assert.equal(shouldConsolidate({ notes: NOTES, lastRunAt: '2026-10-29T00:00:00.000Z', changedSince: 20, now }), true);
  assert.equal(shouldConsolidate({ notes: NOTES, lastRunAt: '2026-10-01T00:00:00.000Z', changedSince: 0, now }), true);
  assert.equal(shouldConsolidate({ notes: NOTES, lastRunAt: null, now }), true);
  const crowded = Array.from({ length: 250 }, (_, index) => make(`x${index}`, `fact ${index}`, [`k${index}`]));
  assert.equal(shouldConsolidate({ notes: crowded, lastRunAt: '2026-10-29T00:00:00.000Z', now }), true);
});
