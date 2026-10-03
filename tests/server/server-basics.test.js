import assert from 'node:assert/strict';
import test from 'node:test';

import { bearerToken, createTokenVerifier } from '../../server/auth.js';
import { loadConfig } from '../../server/config.js';
import { createLogger, redact } from '../../server/log.js';
import { LIMITS } from '../../server/protocol.js';
import { createRateLimiter } from '../../server/rate-limit.js';

const goodEnv = { SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon-key-value' };

test('the settings come from the environment and a bad deployment fails at once, saying what is wrong', () => {
  const config = loadConfig({ ...goodEnv, PORT: '9000', ALLOWED_ORIGINS: 'https://a.example, https://b.example', SOURCE_COMMIT: 'abcdef1234567890' });
  assert.equal(config.port, 9000);
  assert.deepEqual([...config.allowedOrigins], ['https://a.example', 'https://b.example']);
  assert.equal(config.build, 'abcdef123456');
  assert.deepEqual([...loadConfig(goodEnv).allowedOrigins], ['https://noureon.com', 'https://www.noureon.com'], 'the site itself by default');
  assert.equal(loadConfig({ ...goodEnv, SUPABASE_URL: 'https://project.supabase.example/' }).supabaseUrl, 'https://project.supabase.example');
  assert.throws(() => loadConfig({}), /SUPABASE_URL.*SUPABASE_PUBLISHABLE_KEY/);
  assert.equal(loadConfig({ SUPABASE_URL: goodEnv.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: 'pk' }).supabaseAnonKey, 'pk', 'the name the site uses works too');
  assert.throws(() => loadConfig({ ...goodEnv, SUPABASE_URL: 'http://insecure.example' }), /SUPABASE_URL/);
  assert.throws(() => loadConfig({ ...goodEnv, PORT: 'abc' }), /PORT/);
});

test('the log hides anything that looks like a secret, whatever the call', () => {
  assert.deepEqual(redact({ route: '/x', apiKey: 'sk-live', Authorization: 'Bearer abc', secrets: { a: 1 }, key_envelope: 'zz', status: 200 }), {
    route: '/x', apiKey: '[hidden]', Authorization: '[hidden]', secrets: '[hidden]', key_envelope: '[hidden]', status: 200
  });
  const lines = [];
  const log = createLogger((line) => lines.push(line), () => new Date('2026-10-03T00:00:00Z'));
  log('request', { route: 'GET /healthz', token: 'secret-token' });
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0], /secret-token/);
  assert.equal(JSON.parse(lines[0]).at, '2026-10-03T00:00:00.000Z');
});

test('a bearer token is read only when it looks like one', () => {
  assert.equal(bearerToken('Bearer abcdefghijklmnopqrstuvwxyz.0123456789'), 'abcdefghijklmnopqrstuvwxyz.0123456789');
  assert.equal(bearerToken('Basic abcdefghijklmnopqrstuvwxyz'), '');
  assert.equal(bearerToken('Bearer short'), '');
  assert.equal(bearerToken(undefined), '');
});

test('a sign-in token is checked with the sign-in service, kept for a minute, and nobody is let in on a guess', async () => {
  let calls = 0;
  let clock = 1_000;
  const answers = [];
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://project.supabase.example/auth/v1/user');
    assert.equal(options.headers.apikey, 'anon-key-value');
    return answers.shift();
  };
  const verify = createTokenVerifier({ supabaseUrl: 'https://project.supabase.example', anonKey: 'anon-key-value', fetchImpl, now: () => clock });
  const id = '123e4567-e89b-12d3-a456-426614174000';
  answers.push(new Response(JSON.stringify({ id }), { status: 200 }));
  assert.deepEqual(await verify('token-one-token-one-token'), { id });
  assert.deepEqual(await verify('token-one-token-one-token'), { id });
  assert.equal(calls, 1, 'asked once within the minute');
  clock += 61_000;
  answers.push(new Response('{}', { status: 401 }));
  assert.equal(await verify('token-one-token-one-token'), null, 'asked again after a minute; refused');
  assert.equal(await verify(''), null);
  answers.push(new Response(JSON.stringify({ id: 'not-an-id' }), { status: 200 }));
  assert.equal(await verify('token-two-token-two-token'), null, 'an answer without a real id is no one');
  answers.push(new Response('boom', { status: 502 }));
  await assert.rejects(() => verify('token-three-token-three'), /auth service answered 502/);
  const unreachable = createTokenVerifier({ supabaseUrl: 'https://p.example', anonKey: 'k', fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(() => unreachable('token-four-token-four-token'), /unreachable/);
});

test('a person can start only so many things a minute', () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => clock });
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.take('b'), true, 'another person has their own count');
  clock += 1001;
  assert.equal(limiter.take('a'), true, 'the window moved on');
});

test('the limits are the ones the user chose', () => {
  assert.equal(LIMITS.maxRunMs, 2 * 60 * 60 * 1000, 'two hours');
  assert.equal(LIMITS.keyTtlMs, LIMITS.maxRunMs + 15 * 60 * 1000, 'a key lives a quarter of an hour longer than a run may');
  assert.equal(LIMITS.maxRunsPerUser, 5);
});
