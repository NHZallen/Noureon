import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectFile = path => new URL(`../${path}`, import.meta.url);

test('Vercel config enforces low-risk headers and stages the full CSP in Report-Only', () => {
  const config = JSON.parse(readFileSync(projectFile('vercel.json'), 'utf8'));
  const headers = new Map(config.headers[0].headers.map(({ key, value }) => [key, value]));

  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(headers.get('X-Frame-Options'), 'DENY');
  assert.match(headers.get('Permissions-Policy'), /camera=\(self\)/);
  assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.match(headers.get('Content-Security-Policy'), /object-src 'none'/);
  assert.match(headers.get('Content-Security-Policy-Report-Only'), /default-src 'self'/);
  assert.match(headers.get('Content-Security-Policy-Report-Only'), /report-uri \/api\/csp-report/);
  assert.doesNotMatch(headers.get('Content-Security-Policy'), /default-src/);
});

test('security boundary checker covers RLS, anon grants, headers, and recovery decryption regressions', () => {
  const source = readFileSync(projectFile('scripts/check-security-boundaries.mjs'), 'utf8');

  assert.equal(source.includes("enable\\\\s+row"), true);
  assert.match(source, /does not revoke anon privileges/);
  assert.match(source, /content-security-policy-report-only/);
  assert.match(source, /SYNC_VAULT_RECOVERY_KEY/);
});
