import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GROUP_LIMIT,
  GROUP_NAME_LIMIT,
  RECENT_STORED,
  councilMatchesGroup,
  newGroupId,
  nextGroupNumber,
  noteModelsUsed,
  normalizeCouncilGroups,
  normalizeRecentModelIds,
  pickRecentModels
} from '../src/app/ui/model-picker/model-groups.js';

const known = new Set(['a', 'b', 'c', 'd', 'e', 'f']);
const options = { isKnownModel: (id) => known.has(id), maxMembers: 3 };

test('groups read back from what was saved: known models only, no repeats, members within the limit, names trimmed', () => {
  const groups = normalizeCouncilGroups([
    { id: 'g1', name: '  Research  ', participantModelIds: ['a', 'x', 'a', 'b', 'c', 'd'], synthesizerModelId: 'e' },
    { id: 'g2', name: 'x'.repeat(50), participantModelIds: [], synthesizerModelId: 'nope' },
    null,
    'text'
  ], options);
  assert.deepEqual(groups[0], { id: 'g1', name: 'Research', participantModelIds: ['a', 'b', 'c'], synthesizerModelId: 'e' });
  assert.equal(groups[1].name.length, GROUP_NAME_LIMIT);
  assert.equal(groups[1].synthesizerModelId, null);
  assert.equal(groups.length, 2);
  assert.deepEqual(normalizeCouncilGroups('not a list', options), []);
});

test('there are at most five groups, and each has an id of its own', () => {
  const many = Array.from({ length: 9 }, (_, index) => ({ id: 'same', name: `G${index}`, participantModelIds: ['a'] }));
  const groups = normalizeCouncilGroups(many, options);
  assert.equal(GROUP_LIMIT, 5);
  assert.equal(groups.length, 5);
  assert.equal(new Set(groups.map((group) => group.id)).size, 5);
  assert.equal(newGroupId([{ id: 'group-1' }, { id: 'group-2' }]), 'group-3');
  assert.equal(newGroupId([{ id: 'group-2' }]), 'group-3', 'never one that is taken');
});

test('a new group takes the lowest number no group name uses', () => {
  const name = (n) => `Group ${n}`;
  assert.equal(nextGroupNumber([], name), 1);
  assert.equal(nextGroupNumber([{ name: 'Group 1' }, { name: 'Group 3' }], name), 2);
  assert.equal(nextGroupNumber([{ name: 'Research' }], name), 1);
});

test('the council is a group when it has the same members, in any order, and the same combiner', () => {
  const group = { participantModelIds: ['a', 'b'], synthesizerModelId: 'c' };
  assert.equal(councilMatchesGroup(group, { participantModelIds: ['b', 'a'], synthesizerModelId: 'c' }), true);
  assert.equal(councilMatchesGroup(group, { participantModelIds: ['a'], synthesizerModelId: 'c' }), false);
  assert.equal(councilMatchesGroup(group, { participantModelIds: ['a', 'b'], synthesizerModelId: 'd' }), false);
  assert.equal(councilMatchesGroup({ participantModelIds: [], synthesizerModelId: null }, { participantModelIds: [], synthesizerModelId: null }), false, 'an empty group is never the one in use');
});

test('models just used go to the front once each, and only a few are kept', () => {
  assert.deepEqual(noteModelsUsed(['a', 'b', 'c'], ['c']), ['c', 'a', 'b']);
  assert.deepEqual(noteModelsUsed(['a'], ['b', 'c', 'b']), ['b', 'c', 'a']);
  assert.deepEqual(noteModelsUsed(undefined, ['a']), ['a']);
  assert.equal(noteModelsUsed(['a', 'b', 'c', 'd', 'e', 'f'], ['x', 'y', 'z']).length, RECENT_STORED);
});

test('saved recent models keep known ones once each', () => {
  assert.deepEqual(normalizeRecentModelIds(['a', 'zz', 'b', 'a', 42], { isKnownModel: (id) => known.has(id) }), ['a', 'b']);
  assert.deepEqual(normalizeRecentModelIds(null), []);
});

test('the three used most lately among those on offer are shown, with the one in use among them', () => {
  const recent = ['e', 'x', 'd', 'c', 'b'];
  assert.deepEqual(pickRecentModels(recent, ['a', 'b', 'c', 'd', 'e']), ['e', 'd', 'c'], 'unavailable ones are skipped');
  assert.deepEqual(pickRecentModels(recent, ['a', 'b', 'c', 'd', 'e'], { current: 'a' }), ['a', 'e', 'd'], 'the one in use comes first');
  assert.deepEqual(pickRecentModels(recent, ['a', 'b', 'c', 'd', 'e'], { current: 'e' }), ['e', 'd', 'c']);
  assert.deepEqual(pickRecentModels([], ['a'], { current: 'a' }), ['a']);
  assert.deepEqual(pickRecentModels([], ['a']), []);
});
