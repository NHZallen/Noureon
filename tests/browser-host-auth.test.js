// The request check of browser-host (browser-host/auth.mjs): who gets in, and who does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifier, signRequest, canonicalString, normalizeAddress, HEADER_TIME, HEADER_NONCE, HEADER_SIGNATURE } from '../browser-host/auth.mjs';

const SECRET = 'a'.repeat(32) + 'one';
const OTHER = 'b'.repeat(40);
const NOW = 1_800_000_000_000;
const make = (extra = {}) => createVerifier({ secrets: [SECRET], allowedIps: ['203.0.113.7'], now: () => NOW, ...extra });
const request = (overrides = {}) => {
  const base = { method: 'POST', pathWithQuery: '/v1/sessions', body: JSON.stringify({ sessionId: 'x' }), remoteAddress: '203.0.113.7' };
  const merged = { ...base, ...overrides };
  const headers = overrides.headers ?? signRequest({ secret: SECRET, method: merged.method, pathWithQuery: merged.pathWithQuery, body: merged.body, time: NOW });
  return { ...merged, headers };
};

test('a correctly signed request from an allowed address is accepted', () => {
  assert.deepEqual(make().verify(request()), { ok: true });
});

test('a request without a body (GET) is signed over the hash of nothing', () => {
  const v = make();
  const headers = signRequest({ secret: SECRET, method: 'GET', pathWithQuery: '/v1/health', time: NOW });
  assert.deepEqual(v.verify({ method: 'GET', pathWithQuery: '/v1/health', headers, remoteAddress: '203.0.113.7' }), { ok: true });
});

test('the address comes first: an allowed signature from the wrong address is 403, also in IPv4-mapped form and for nobody-listed', () => {
  assert.equal(make().verify(request({ remoteAddress: '198.51.100.9' })).status, 403);
  assert.equal(make().verify(request({ remoteAddress: '::1' })).status, 403);
  assert.equal(make().verify(request({ remoteAddress: undefined })).status, 403);
  assert.deepEqual(make().verify(request({ remoteAddress: '::ffff:203.0.113.7' })), { ok: true });
  assert.equal(createVerifier({ secrets: [SECRET], now: () => NOW }).verify(request()).status, 403, 'an empty list lets nobody in');
});

test('a range of addresses can be allowed, and allowAnyIp is an explicit switch', () => {
  const ranged = make({ allowedIps: ['10.0.1.0/24'] });
  assert.deepEqual(ranged.verify(request({ remoteAddress: '10.0.1.9' })), { ok: true });
  assert.equal(make({ allowedIps: ['10.0.1.0/24'] }).verify(request({ remoteAddress: '10.0.2.9' })).status, 403);
  assert.deepEqual(createVerifier({ secrets: [SECRET], allowAnyIp: true, now: () => NOW }).verify(request({ remoteAddress: '8.8.8.8' })), { ok: true });
});

test('missing or malformed headers are 401', () => {
  const v = make();
  assert.equal(v.verify(request({ headers: {} })).status, 401);
  const good = signRequest({ secret: SECRET, method: 'POST', pathWithQuery: '/v1/sessions', body: JSON.stringify({ sessionId: 'x' }), time: NOW });
  assert.equal(v.verify(request({ headers: { ...good, [HEADER_NONCE]: 'short' } })).status, 401);
  assert.equal(v.verify(request({ headers: { ...good, [HEADER_SIGNATURE]: 'zz'.repeat(32) } })).status, 401);
  assert.equal(v.verify(request({ headers: { ...good, [HEADER_TIME]: 'yesterday' } })).status, 401);
});

test('a wrong secret, a changed body, a changed path or a changed method are all 401', () => {
  const v = () => make();
  const body = JSON.stringify({ sessionId: 'x' });
  // The signature is made over the ORIGINAL request; what arrives is a changed one (so the helper must not sign it again).
  const original = signRequest({ secret: SECRET, method: 'POST', pathWithQuery: '/v1/sessions', body, time: NOW });
  assert.deepEqual(v().verify(request({ headers: original })), { ok: true }, 'control: the untouched request passes');
  const wrongSecret = signRequest({ secret: OTHER, method: 'POST', pathWithQuery: '/v1/sessions', body, time: NOW });
  assert.equal(v().verify(request({ headers: wrongSecret })).reason, 'bad signature');
  assert.equal(v().verify(request({ headers: original, body: JSON.stringify({ sessionId: 'y' }) })).reason, 'bad signature');
  assert.equal(v().verify(request({ headers: original, pathWithQuery: '/v1/sessions/other' })).reason, 'bad signature');
  assert.equal(v().verify(request({ headers: original, method: 'DELETE' })).reason, 'bad signature');
  assert.equal(v().verify(request({ headers: original, pathWithQuery: '/v1/sessions?save=1' })).reason, 'bad signature');
  assert.equal(v().verify(request({ headers: original, body: undefined })).reason, 'bad signature', 'dropping the body is a change too');
});

test('the time window: 60 seconds either way, not more', () => {
  const v = make();
  const at = (offset) => { const time = NOW + offset; return signRequest({ secret: SECRET, method: 'POST', pathWithQuery: '/v1/sessions', body: JSON.stringify({ sessionId: 'x' }), time }); };
  assert.equal(v.verify(request({ headers: at(-59_000) })).ok, true);
  assert.equal(v.verify(request({ headers: at(59_000) })).ok, true);
  assert.equal(v.verify(request({ headers: at(-61_000) })).status, 401);
  assert.equal(v.verify(request({ headers: at(61_000) })).status, 401);
});

test('the same request cannot be used twice, but a new nonce is fine, and the memory forgets after the time-to-live', () => {
  let clock = NOW;
  const v = createVerifier({ secrets: [SECRET], allowedIps: ['203.0.113.7'], now: () => clock, nonceTtlMs: 300_000 });
  const first = request({ headers: signRequest({ secret: SECRET, method: 'POST', pathWithQuery: '/v1/sessions', body: '{}', time: clock, nonce: 'c'.repeat(32) }), body: '{}' });
  assert.equal(v.verify(first).ok, true);
  assert.equal(v.verify(first).reason, 'request was already used');
  const second = request({ headers: signRequest({ secret: SECRET, method: 'POST', pathWithQuery: '/v1/sessions', body: '{}', time: clock, nonce: 'd'.repeat(32) }), body: '{}' });
  assert.equal(v.verify(second).ok, true);
  clock += 301_000;
  assert.equal(v.remembered, 2);
  const later = request({ headers: signRequest({ secret: SECRET, method: 'POST', pathWithQuery: '/v1/sessions', body: '{}', time: clock }), body: '{}' });
  assert.equal(v.verify(later).ok, true);
  assert.equal(v.remembered, 1, 'the old nonces were forgotten');
});

test('a failed request does not use up its nonce, and strangers cannot fill the memory', () => {
  const v = createVerifier({ secrets: [SECRET], allowedIps: ['203.0.113.7'], now: () => NOW, maxNonces: 3 });
  for (let i = 0; i < 50; i += 1) {
    const nonce = i.toString(16).padStart(32, '0');
    const forged = signRequest({ secret: OTHER, method: 'GET', pathWithQuery: '/v1/health', time: NOW, nonce });
    assert.equal(v.verify({ method: 'GET', pathWithQuery: '/v1/health', headers: forged, remoteAddress: '203.0.113.7' }).status, 401);
  }
  assert.equal(v.remembered, 0);
});

test('when the memory is full, valid requests get 429 instead of growing it', () => {
  const v = createVerifier({ secrets: [SECRET], allowedIps: ['203.0.113.7'], now: () => NOW, maxNonces: 2 });
  const send = (i) => v.verify({ method: 'GET', pathWithQuery: '/v1/health', headers: signRequest({ secret: SECRET, method: 'GET', pathWithQuery: '/v1/health', time: NOW, nonce: i.toString(16).padStart(32, '0') }), remoteAddress: '203.0.113.7' });
  assert.equal(send(1).ok, true);
  assert.equal(send(2).ok, true);
  assert.equal(send(3).status, 429);
  assert.equal(v.remembered, 2);
});

test('rotation: both the old and the new secret work while both are listed', () => {
  const both = createVerifier({ secrets: [SECRET, OTHER], allowedIps: ['203.0.113.7'], now: () => NOW });
  const withOld = signRequest({ secret: SECRET, method: 'GET', pathWithQuery: '/v1/health', time: NOW });
  const withNew = signRequest({ secret: OTHER, method: 'GET', pathWithQuery: '/v1/health', time: NOW });
  assert.equal(both.verify({ method: 'GET', pathWithQuery: '/v1/health', headers: withOld, remoteAddress: '203.0.113.7' }).ok, true);
  assert.equal(both.verify({ method: 'GET', pathWithQuery: '/v1/health', headers: withNew, remoteAddress: '203.0.113.7' }).ok, true);
  const newOnly = createVerifier({ secrets: [OTHER], allowedIps: ['203.0.113.7'], now: () => NOW });
  assert.equal(newOnly.verify({ method: 'GET', pathWithQuery: '/v1/health', headers: signRequest({ secret: SECRET, method: 'GET', pathWithQuery: '/v1/health', time: NOW, nonce: 'e'.repeat(32) }), remoteAddress: '203.0.113.7' }).status, 401, 'once the old one is removed it stops working');
});

test('weak or missing secrets are refused when the verifier is made, and when a request is signed', () => {
  assert.throws(() => createVerifier({ secrets: [] }), /at least one secret/);
  assert.throws(() => createVerifier({ secrets: ['short'] }), /32 characters/);
  assert.throws(() => signRequest({ secret: 'short', method: 'GET', pathWithQuery: '/' }), /32 characters/);
});

test('helpers: canonical text and address normalising', () => {
  assert.equal(canonicalString({ method: 'post', pathWithQuery: '/a?b=1', time: 5, nonce: 'n', body: '' }), 'POST\n/a?b=1\n5\nn\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(normalizeAddress('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normalizeAddress('2001:db8::1'), null);
  assert.equal(normalizeAddress('not an ip'), null);
});
