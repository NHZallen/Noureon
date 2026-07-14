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

test('report-only CSP covers current provider, auth, verification, and P2P transports', () => {
  const policy = getGlobalHeaders()['Content-Security-Policy-Report-Only'];

  for (const source of [
    'https://generativelanguage.googleapis.com',
    'https://openrouter.ai',
    'https://api.stepfun.com',
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
