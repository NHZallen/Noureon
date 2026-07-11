import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addCustomSuppressionRule,
  removeSuppressionRule,
  updateSuppressionRule
} from '../src/app/runtime/memory/memory-suppression-management.js';
import { buildMemoryContext } from '../src/app/runtime/memory/memory-context-builder.js';

test('custom suppression rules can be added, edited, used, and removed', () => {
  const added = addCustomSuppressionRule({}, {
    id: 'private-topic',
    instruction: 'Do not bring up private health information unless the user asks.',
    now: '2026-07-11T13:00:00.000Z'
  });
  const updated = updateSuppressionRule(added, {
    ruleId: 'private-topic',
    instruction: 'Do not proactively bring up private health information.',
    now: '2026-07-11T14:00:00.000Z'
  });
  const context = buildMemoryContext({ suppressionRules: updated.suppressionRules });

  assert.deepEqual(context.instructions, ['Do not proactively bring up private health information.']);
  assert.deepEqual(removeSuppressionRule(updated, { ruleId: 'private-topic' }).suppressionRules, []);
});
