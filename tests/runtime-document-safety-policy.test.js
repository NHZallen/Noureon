import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizeDocumentDerivedAction } from '../src/app/runtime/documents/document-safety-policy.js';

test('document text cannot automatically trigger tools, URLs, memory, or destructive actions', () => {
  for (const action of ['tool-call', 'open-url', 'network-request', 'memory-write', 'file-delete', 'secret-access', 'settings-change']) {
    assert.equal(authorizeDocumentDerivedAction({ action, source: 'document' }).allowed, false);
  }
});

test('high-risk document-derived actions still require confirmation after an explicit user request', () => {
  assert.equal(authorizeDocumentDerivedAction({
    action: 'file-delete', source: 'document', explicitlyRequestedByUser: true
  }).allowed, false);
  assert.equal(authorizeDocumentDerivedAction({
    action: 'file-delete', source: 'document', explicitlyRequestedByUser: true, userConfirmed: true
  }).allowed, true);
});
