import assert from 'node:assert/strict';
import test from 'node:test';

import { createNote, isActive } from '../../src/app/runtime/memory-notes/notes.js';
import { expire, fade, makeRoom, reinforce, sweep, touchUsed, weakest } from '../../src/app/runtime/memory-notes/lifecycle.js';
import { canSupersede, supersede } from '../../src/app/runtime/memory-notes/supersede.js';
import { canBeStanding, isExplicitPreference, markNotRelevant, reconcileStanding, standingNotes } from '../../src/app/runtime/memory-notes/standing.js';
import { findTombstone, makeTombstone, relatedTombstones } from '../../src/app/runtime/memory-notes/tombstone.js';

const at = (iso) => () => iso;
const make = (id, extra = {}) => createNote({ id, text: extra.text || `note ${id} about subject${id}`, keywords: extra.keywords || [`subject${id}`], kind: extra.kind || 'fact', source: { conversationId: 'c1', messageIds: [`m${id}`], quote: 'q', seen: ['c1|2026-01-01'] }, observedAt: extra.observedAt || '2026-01-01T00:00:00.000Z', now: at('2026-01-01T00:00:00.000Z'), ...(extra.standing ? { standing: true } : {}) });
const merge = (note, extra) => ({ ...note, ...extra });

test('a note seen again counts once for each conversation and day, and what was seen later is when it was last seen', () => {
  const note = make('a');
  const sameDay = reinforce(note, { conversationId: 'c1', observedAt: '2026-01-01T09:00:00.000Z', messageId: 'm9', now: at('2026-01-02T00:00:00.000Z') });
  assert.equal(sameDay.evidenceCount, 1);
  const otherDay = reinforce(sameDay, { conversationId: 'c1', observedAt: '2026-01-05T09:00:00.000Z', now: at('2026-01-06T00:00:00.000Z') });
  assert.equal(otherDay.evidenceCount, 2);
  assert.equal(otherDay.observedAt, '2026-01-05T09:00:00.000Z');
  const again = reinforce(otherDay, { conversationId: 'c1', observedAt: '2026-01-05T20:00:00.000Z', now: at('2026-01-06T00:00:00.000Z') });
  assert.equal(again.evidenceCount, 2, 'twice on one day in one conversation is once');
  const earlier = reinforce(again, { conversationId: 'c2', observedAt: '2025-12-01T00:00:00.000Z', now: at('2026-01-06T00:00:00.000Z') });
  assert.equal(earlier.evidenceCount, 3);
  assert.equal(earlier.observedAt, '2026-01-05T20:00:00.000Z', 'an earlier sighting does not make it older');
});

test('only what was seen later takes the place of a note; a locked note is never taken', () => {
  const note = make('a', { observedAt: '2026-05-01T00:00:00.000Z' });
  assert.equal(canSupersede(note, '2026-06-01T00:00:00.000Z'), true);
  assert.equal(canSupersede(note, '2026-03-01T00:00:00.000Z'), false);
  assert.equal(canSupersede(note, '2026-05-01T00:00:00.000Z'), false, 'the same moment is the same sighting');
  assert.equal(canSupersede({ ...note, locked: true }, '2026-06-01T00:00:00.000Z'), false);
  const taken = supersede({ ...note, evidenceCount: 4 }, { text: 'new', keywords: ['k'], observedAt: '2026-06-01T00:00:00.000Z', now: at('2026-06-02T00:00:00.000Z') });
  assert.equal(taken.id, 'a');
  assert.equal(taken.text, 'new');
  assert.equal(taken.evidenceCount, 1, 'a different fact starts again');
});

test('a note with a date that has passed is archived, a note seen once and unused for ninety days fades, the first page and the locked stay', () => {
  const dated = merge(make('d'), { validUntil: '2026-02-01T00:00:00.000Z' });
  const lockedDated = merge(make('l'), { validUntil: '2026-02-01T00:00:00.000Z', locked: true });
  const expired = expire([dated, lockedDated], at('2026-03-01T00:00:00.000Z'));
  assert.deepEqual(expired.changed, ['d']);
  assert.equal(expired.notes[0].status, 'archived');
  assert.equal(expired.notes[0].archivedReason, 'expired');
  assert.equal(isActive(expired.notes[1]), true);

  const old = make('o');
  const seenTwice = merge(make('t'), { evidenceCount: 2 });
  const onPage = merge(make('s'), { standing: true });
  const used = merge(make('u'), { lastUsedAt: '2026-03-20T00:00:00.000Z' });
  const faded = fade([old, seenTwice, onPage, used], at('2026-04-10T00:00:00.000Z'));
  assert.deepEqual(faded.changed, ['o']);
  assert.equal(sweep([dated, old], at('2026-06-01T00:00:00.000Z')).notes.every((note) => !isActive(note)), true);
});

test('when the notebook is full the weakest make room, never the first page or the locked', () => {
  const notes = [merge(make('a'), { evidenceCount: 3 }), make('b'), merge(make('c'), { standing: true }), merge(make('d'), { locked: true }), merge(make('e'), { lastUsedAt: '2026-02-01T00:00:00.000Z' })];
  assert.deepEqual(weakest(notes, 2).map((note) => note.id), ['b', 'e']);
  const room = makeRoom(notes, 1, { max: 5, now: at('2026-03-01T00:00:00.000Z') });
  assert.deepEqual(room.evicted.map((note) => note.id), ['b']);
  assert.equal(room.notes.find((note) => note.id === 'b').archivedReason, 'evicted');
  assert.equal(makeRoom(notes, 1, { max: 6 }).evicted.length, 0);
  const used = touchUsed(notes, ['a'], at('2026-03-02T00:00:00.000Z'));
  assert.equal(used[0].recallCount, 1);
  assert.equal(used[0].lastUsedAt, '2026-03-02T00:00:00.000Z');
});

test('the first page: a note earns it by being seen again or by what the person said, only a preference or a fact, at most fifteen, and the person can take it away', () => {
  assert.equal(isExplicitPreference('我平常喜歡簡潔的答案'), true);
  assert.equal(isExplicitPreference('I always want short answers'), true);
  assert.equal(isExplicitPreference('Je préfère les réponses courtes'), true);
  assert.equal(isExplicitPreference('Siempre quiero respuestas cortas'), true);
  assert.equal(isExplicitPreference('Я всегда хочу короткие ответы'), true);
  assert.equal(isExplicitPreference('下個月我要去日本'), false);
  const project = merge(make('p', { kind: 'project' }), { evidenceCount: 5 });
  assert.equal(canBeStanding(project), false, 'a project is not for every answer');
  const seenTwice = merge(make('a', { kind: 'preference' }), { evidenceCount: 2 });
  const once = make('b', { kind: 'preference' });
  const result = reconcileStanding([seenTwice, once, project]);
  assert.deepEqual(result.promoted, ['a']);
  assert.equal(result.notes.find((note) => note.id === 'b').standing, false);
  const marked = markNotRelevant(markNotRelevant(markNotRelevant(merge(seenTwice, { standing: true }))));
  assert.equal(marked.standing, false, 'three times "not relevant"');
  assert.equal(reconcileStanding([marked]).promoted.length, 0, 'it does not come back');

  const many = Array.from({ length: 20 }, (_, index) => merge(make(`n${index}`, { kind: 'preference' }), { evidenceCount: 2, standing: index < 17, lastUsedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }));
  const capped = reconcileStanding(many);
  assert.equal(capped.notes.filter((note) => note.standing).length, 15);
  assert.ok(capped.demoted.includes('n0'), 'the one used longest ago leaves');
  assert.ok(standingNotes(capped.notes).length <= 15);
  assert.equal(standingNotes([merge(make('x', { text: 'x'.repeat(100) }), { standing: true })], { budget: 50 }).length, 0, 'the budget of characters holds');
  assert.equal(standingNotes([merge(make('y'), { standing: true, surface: 'never' })]).length, 0, '"do not mention" is not on the first page');
});

test('a tombstone keeps the words and the source but not the text, and stops a note that says the same, not one that only names the same place', () => {
  const note = merge(make('t', { text: '使用者住在台中', keywords: ['台中', '居住', 'Taichung'] }), { source: { conversationId: 'c1', messageIds: ['m1'], quote: '我住在台中', seen: [] } });
  const tomb = makeTombstone(note, at('2026-02-01T00:00:00.000Z'));
  assert.equal(tomb.text, '');
  assert.equal(tomb.status, 'deleted');
  assert.deepEqual(tomb.keywords, ['台中', '居住', 'Taichung']);
  assert.ok(tomb.hint.includes('台中'));
  assert.ok(findTombstone({ text: '使用者住在台中市', keywords: ['台中', '居住'], messageIds: [] }, [tomb]), 'the same words');
  assert.equal(findTombstone({ text: '使用者喜歡台中的咖啡店，常常去那裡寫程式，週末也會去逛夜市', keywords: ['咖啡', '夜市'], messageIds: [] }, [tomb]), null, 'another fact that names the place');
  assert.ok(findTombstone({ text: '使用者住在台中', keywords: ['台中'], messageIds: ['m1'] }, [tomb]), 'from the same message');
  assert.equal(relatedTombstones('使用者住在台中', [tomb, note]).length, 1);
});
