import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('an edit stops the visual check and the reply being written, then cuts the conversation, then sends; a plain send is still locked by a check', () => {
  const submit = source('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const start = submit.indexOf('const handleFormSubmit = async');
  const body = submit.slice(start, submit.indexOf('const preparedSubmit = Object.keys', start));
  const order = ['vc.cancel(activeId)', 'await stopReplyAndWait(', 'await effectiveSubmitOptions.prepare?.()'].map((part) => body.indexOf(part));
  assert.ok(order.every((at) => at >= 0), 'all three steps are there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in that order');
  assert.match(body, /else if \(vc\.isRunning\(activeId\)\) \{[\s\S]*sendLockedNotice[\s\S]*return;/);
  assert.match(body, /else \{\s*onRegularSubmit\(\);/);
});
