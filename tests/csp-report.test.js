import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCspReport } from '../api/csp-report.js';

test('CSP reports retain directives and origins without paths or query strings', () => {
  const report = normalizeCspReport({
    'csp-report': {
      'effective-directive': 'script-src-elem',
      'violated-directive': "script-src 'self'",
      disposition: 'report',
      'document-uri': 'https://noureon.com/chat?vault_recovery=secret-state',
      'blocked-uri': 'https://unexpected.example/private/script.js?token=secret'
    }
  });

  assert.deepEqual(report, {
    event: 'csp_violation',
    effectiveDirective: 'script-src-elem',
    violatedDirective: 'script-srcself',
    disposition: 'report',
    documentOrigin: 'https://noureon.com',
    blockedOrigin: 'https://unexpected.example'
  });
  assert.equal(JSON.stringify(report).includes('secret'), false);
});

test('CSP report normalization bounds attacker-controlled fields', () => {
  const report = normalizeCspReport({ body: {
    effectiveDirective: '<script>'.repeat(100),
    documentURL: 'data:text/html,secret',
    blockedURL: 'not a URL'
  } });

  assert.ok(report.effectiveDirective.length <= 120);
  assert.equal(report.documentOrigin, 'data:');
  assert.equal(report.blockedOrigin, 'invalid');
});
