import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addConfirmedProfileEntry,
  approveProfileCandidate,
  removeProfileEntry
} from '../src/app/runtime/memory/memory-profile-management.js';
import {
  addCustomSuppressionRule,
  removeSuppressionRule,
  updateSuppressionRule
} from '../src/app/runtime/memory/memory-suppression-management.js';

// The rules these two modules keep (found by mutation testing, `npm run test:mutation`: changes to the code that the earlier tests did not notice).

const NOW = '2026-10-01T00:00:00.000Z';
const entry = (id, extra = {}) => ({ id, kind: 'preference', content: `content ${id}`, status: 'active', confirmedByUser: true, supersedes: [], sourceRefs: [], ...extra });
const stateOf = (profileEntries = [], extra = {}) => ({ profileEntries, ...extra });

// --- profile entries -------------------------------------------------------------------------------------------------------------------

test('an entry needs an id and some text; the text is trimmed', () => {
  assert.throws(() => addConfirmedProfileEntry(stateOf(), { content: 'x', now: NOW }), /require an id/);
  for (const content of [undefined, '', '   ']) {
    assert.throws(() => addConfirmedProfileEntry(stateOf(), { id: 'n', content, now: NOW }), /non-empty content/);
  }
  const added = addConfirmedProfileEntry(stateOf(), { id: 'n', content: '  likes tea  ', now: NOW });
  assert.equal(added.profileEntries[0].content, 'likes tea');
  assert.deepEqual(added.profileEntries[0].supersedes, []);
});

test('an entry is added to a state that has none yet, and to one that has others', () => {
  assert.deepEqual(addConfirmedProfileEntry({}, { id: 'n', content: 'x', now: NOW }).profileEntries.map((item) => item.id), ['n']);
  assert.deepEqual(addConfirmedProfileEntry(stateOf([entry('a')]), { id: 'n', content: 'x', now: NOW }).profileEntries.map((item) => item.id), ['a', 'n']);
});

test('what an entry supersedes is listed once each, without empty ids, and those entries are replaced by it', () => {
  const state = stateOf([entry('a'), entry('b'), entry('c')]);
  const added = addConfirmedProfileEntry(state, { id: 'n', content: 'x', supersededEntryIds: ['a', 'a', '', null, 'b'], now: NOW });
  assert.deepEqual(added.profileEntries[added.profileEntries.length - 1].supersedes, ['a', 'b']);
  assert.deepEqual(added.profileEntries.map((item) => item.id), ['c', 'n'], 'the entries it replaces are no longer listed');
  const numbered = addConfirmedProfileEntry(stateOf([entry('1')]), { id: 'n', content: 'x', supersededEntryIds: [1], now: NOW });
  assert.deepEqual(numbered.profileEntries.map((item) => item.id), ['n'], 'ids are compared as text');
});

test('an entry cannot replace itself, an entry that is not there, or one that is not active and confirmed', () => {
  assert.throws(() => addConfirmedProfileEntry(stateOf([entry('a')]), { id: 'a', content: 'x', supersededEntryIds: ['a'], now: NOW }), /cannot supersede itself/);
  assert.throws(() => addConfirmedProfileEntry(stateOf([entry('a')]), { id: 'a', content: 'x', now: NOW }), /unique/);
  assert.throws(() => addConfirmedProfileEntry(stateOf([entry('a')]), { id: 'n', content: 'x', supersededEntryIds: ['missing'], now: NOW }), /was not found/);
  assert.throws(() => addConfirmedProfileEntry(stateOf([entry('a', { status: 'inactive' })]), { id: 'n', content: 'x', supersededEntryIds: ['a'], now: NOW }), /active confirmed/);
  assert.throws(() => addConfirmedProfileEntry(stateOf([entry('a', { confirmedByUser: false })]), { id: 'n', content: 'x', supersededEntryIds: ['a'], now: NOW }), /active confirmed/);
  assert.throws(() => addConfirmedProfileEntry(stateOf([entry('a', { confirmedByUser: 'yes' })]), { id: 'n', content: 'x', supersededEntryIds: ['a'], now: NOW }), /active confirmed/, 'confirmed means exactly true');
});

test('replacements may not make a loop, however far back the loop goes; a loop that is already there does not hang the check', () => {
  assert.throws(
    () => addConfirmedProfileEntry(stateOf([entry('a', { supersedes: ['n'] })]), { id: 'n', content: 'x', supersededEntryIds: ['a'], now: NOW }),
    /acyclic/
  );
  assert.throws(
    () => addConfirmedProfileEntry(stateOf([entry('a', { supersedes: ['b'] }), entry('b', { supersedes: ['n'] })]), { id: 'n', content: 'x', supersededEntryIds: ['a'], now: NOW }),
    /acyclic/,
    'through an entry in between'
  );
  const loopedAlready = stateOf([entry('a', { supersedes: ['b'] }), entry('b', { supersedes: ['a'] })]);
  const added = addConfirmedProfileEntry(loopedAlready, { id: 'n', content: 'x', supersededEntryIds: ['a'], now: NOW });
  assert.ok(added.profileEntries.some((item) => item.id === 'n'));
});

test('approving a candidate makes an entry from it, takes it off the list and remembers it was decided', () => {
  const state = stateOf([entry('a')], {
    profileCandidates: [
      { id: 'c1', content: 'first', kind: 'identity', extractionConfidence: 0.8, sourceRefs: [{ id: 's' }] },
      { id: 'c2', content: 'second' }
    ],
    resolvedProfileCandidateIds: ['old', 'c2']
  });
  const approved = approveProfileCandidate(state, { candidateId: 'c2', profileEntryId: 'n', now: NOW });
  const made = approved.profileEntries.find((item) => item.id === 'n');
  assert.equal(made.content, 'second', 'the candidate asked for, not the first one');
  assert.equal(made.kind, 'preference', 'a candidate without a kind is a preference');
  assert.equal(made.confirmedByUser, true);
  assert.deepEqual(approved.profileCandidates.map((item) => item.id), ['c1'], 'only that candidate leaves the list');
  assert.deepEqual(approved.resolvedProfileCandidateIds, ['old', 'c2'], 'listed once');

  const identity = approveProfileCandidate(state, { candidateId: 'c1', profileEntryId: 'm', now: NOW });
  const made1 = identity.profileEntries.find((item) => item.id === 'm');
  assert.equal(made1.kind, 'identity');
  assert.equal(made1.usePolicy, 'task-only');
  assert.equal(made1.extractionConfidence, 0.8);
  assert.deepEqual(made1.sourceRefs, [{ id: 's' }]);
  assert.deepEqual(identity.resolvedProfileCandidateIds, ['old', 'c2', 'c1']);
  assert.deepEqual(identity.profileCandidates.map((item) => item.id), ['c2']);
});

test('approving can replace entries, needs a candidate that exists and an id for the entry', () => {
  const state = stateOf([entry('a'), entry('b')], { profileCandidates: [{ id: 'c1', content: 'new' }] });
  const approved = approveProfileCandidate(state, { candidateId: 'c1', profileEntryId: 'n', supersededEntryIds: ['a'], now: NOW });
  assert.deepEqual(approved.profileEntries.map((item) => item.id), ['b', 'n']);
  assert.deepEqual(approved.profileEntries.find((item) => item.id === 'n').supersedes, ['a']);
  assert.throws(() => approveProfileCandidate(state, { candidateId: 'nope', profileEntryId: 'n' }), /candidate was not found/);
  assert.throws(() => approveProfileCandidate({}, { candidateId: 'c1', profileEntryId: 'n' }), /candidate was not found/);
  assert.throws(() => approveProfileCandidate(state, { candidateId: 'c1' }), /require a profile entry id/);
  assert.throws(() => approveProfileCandidate(state, { candidateId: 'c1', profileEntryId: 'n', supersededEntryIds: ['a', 'missing'] }), /was not found/);
});

test('removing an entry takes out that one only; one that is not there changes nothing; an id is needed', () => {
  const state = stateOf([entry('a'), entry('b'), entry('c')]);
  assert.deepEqual(removeProfileEntry(state, { entryId: 'b' }).profileEntries.map((item) => item.id), ['a', 'c']);
  assert.deepEqual(removeProfileEntry(state, { entryId: 'c' }).profileEntries.map((item) => item.id), ['a', 'b']);
  assert.equal(removeProfileEntry(state, { entryId: 'zzz' }), state, 'the same state comes back');
  assert.throws(() => removeProfileEntry(state, {}), /requires an id/);
  assert.throws(() => removeProfileEntry(state), /requires an id/);
});

// --- rules not to bring things up --------------------------------------------------------------------------------------------------

test('a rule needs an id and an instruction; the instruction is trimmed', () => {
  assert.throws(() => addCustomSuppressionRule({}, { instruction: 'x' }), /require an id/);
  for (const instruction of [undefined, '', '   \n']) {
    assert.throws(() => addCustomSuppressionRule({}, { id: 'r', instruction }), /non-empty instruction/);
  }
  const added = addCustomSuppressionRule({}, { id: 'r', instruction: '  do not mention my job  ', now: NOW });
  assert.deepEqual(added.suppressionRules, [{ id: 'r', type: 'custom-instruction', target: 'memory-context', instruction: 'do not mention my job', scope: 'all-chat', createdAt: NOW, updatedAt: NOW }]);
});

test('a rule is added after the ones there are, and the state it came from is not changed', () => {
  const state = { other: 1, suppressionRules: [{ id: 'old', instruction: 'a' }] };
  const added = addCustomSuppressionRule(state, { id: 'r', instruction: 'b', now: NOW });
  assert.deepEqual(added.suppressionRules.map((rule) => rule.id), ['old', 'r']);
  assert.equal(added.other, 1);
  assert.equal(state.suppressionRules.length, 1);
  assert.deepEqual(addCustomSuppressionRule({ suppressionRules: 'not a list' }, { id: 'r', instruction: 'b', now: NOW }).suppressionRules.map((rule) => rule.id), ['r']);
});

test('a rule is changed by its id: only the instruction and the time change; the others stay as they are', () => {
  const keep = { id: 'k', instruction: 'keep', createdAt: 'then', updatedAt: 'then' };
  const state = { suppressionRules: [null, keep, { id: 'r', instruction: 'old', createdAt: 'then', updatedAt: 'then' }] };
  const updated = updateSuppressionRule(state, { ruleId: 'r', instruction: '  new text ', now: NOW });
  assert.equal(updated.suppressionRules[1], keep, 'another rule is the very same object');
  assert.equal(updated.suppressionRules[0], null, 'an empty place in the list does not break the change');
  assert.deepEqual(updated.suppressionRules[2], { id: 'r', instruction: 'new text', createdAt: 'then', updatedAt: NOW });
  assert.equal(state.suppressionRules[2].instruction, 'old');
});

test('changing a rule needs an id that exists and an instruction', () => {
  const state = { suppressionRules: [{ id: 'r', instruction: 'old' }] };
  assert.throws(() => updateSuppressionRule(state, { instruction: 'x' }), /requires an id/);
  assert.throws(() => updateSuppressionRule(state, { ruleId: 'r', instruction: ' ' }), /non-empty instruction/);
  assert.throws(() => updateSuppressionRule(state, { ruleId: 'r' }), /non-empty instruction/);
  assert.throws(() => updateSuppressionRule(state, { ruleId: 'zzz', instruction: 'x' }), /was not found/);
  assert.throws(() => updateSuppressionRule({}, { ruleId: 'r', instruction: 'x' }), /was not found/);
});

test('a rule is removed by its id, only that one; an id is needed', () => {
  const state = { keep: true, suppressionRules: [null, { id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const removed = removeSuppressionRule(state, { ruleId: 'b' });
  assert.deepEqual(removed.suppressionRules, [null, { id: 'a' }, { id: 'c' }]);
  assert.equal(removed.keep, true);
  assert.deepEqual(removeSuppressionRule(state, { ruleId: 'zzz' }).suppressionRules.length, 4);
  assert.deepEqual(removeSuppressionRule({}, { ruleId: 'a' }).suppressionRules, []);
  assert.throws(() => removeSuppressionRule(state, {}), /requires an id/);
  assert.throws(() => removeSuppressionRule(state), /requires an id/);
});
