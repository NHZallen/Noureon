import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vercelConfig = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

const getGlobalHeaders = () => {
  const globalRule = vercelConfig.headers?.find((rule) => rule.source === '/(.*)');
  return Object.fromEntries((globalRule?.headers || []).map(({ key, value }) => [key, value]));
};

test('deployment enables CSP in report-only mode before enforcement', () => {
  const headers = getGlobalHeaders();
  const policy = headers['Content-Security-Policy-Report-Only'];

  assert.equal(typeof policy, 'string');
  assert.equal('Content-Security-Policy' in headers, false);
  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "worker-src 'self' blob:"
  ]) {
    assert.match(policy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('report-only CSP covers current provider, auth, verification, P2P and server transports', () => {
  const policy = getGlobalHeaders()['Content-Security-Policy-Report-Only'];

  for (const source of [
    'https://api.noureon.com',
    'https://generativelanguage.googleapis.com',
    'https://openrouter.ai',
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://challenges.cloudflare.com',
    'https://0.peerjs.com',
    'wss://0.peerjs.com'
  ]) {
    assert.equal(policy.includes(source), true, `CSP should include ${source}`);
  }
});

test('deployment sends basic browser security headers without disabling local camera and microphone features', () => {
  const headers = getGlobalHeaders();

  assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Permissions-Policy'], 'camera=(self), microphone=(self), geolocation=()');
});

test('the report-only CSP says where to report, and the reports keep only the kind of each one (audit 2026-10-18, L-3)', async () => {
  const headers = getGlobalHeaders();
  assert.match(headers['Content-Security-Policy-Report-Only'], /report-uri \/api\/csp-report; report-to csp$/);
  assert.equal(headers['Reporting-Endpoints'], 'csp="/api/csp-report"');
  const { readReports } = await import('../../api/csp-report.js');
  const old = readReports(JSON.stringify({ 'csp-report': { 'document-uri': 'https://noureon.com/chat/abc?q=secret', 'violated-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js?token=1' } }));
  assert.deepEqual(old, [{ directive: 'script-src-elem', blocked: 'https://evil.example', page: '/chat/abc', disposition: '' }]);
  const fresh = readReports(JSON.stringify([{ type: 'csp-violation', body: { documentURL: 'https://noureon.com/', effectiveDirective: 'script-src', blockedURL: 'wasm-eval', disposition: 'report' } }]));
  assert.deepEqual(fresh, [{ directive: 'script-src', blocked: 'wasm-eval', page: '/', disposition: 'report' }]);
  assert.deepEqual(readReports('not json'), []);
});
