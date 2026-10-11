import assert from 'node:assert/strict';
import test from 'node:test';

import { createTurnstileClient } from '../src/app/runtime/security/turnstile-client.js';

test('Turnstile script loading has a bounded timeout and removes the pending widget', async () => {
  const window = {};
  const listeners = new Map();
  let widgetRemoved = false;
  let insertedWidget;
  const script = {
    dataset: {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
  const document = {
    getElementById: () => null,
    createElement(tagName) {
      if (tagName === 'script') return script;
      return {
        dataset: {},
        remove() { widgetRemoved = true; }
      };
    },
    head: { appendChild() {} }
  };
  const anchor = { before(widget) { insertedWidget = widget; } };
  let timeoutCallback;
  const client = createTurnstileClient({
    window,
    document,
    siteKey: 'site-key',
    scriptTimeoutMs: 25,
    scheduleTimeout(callback) {
      timeoutCallback = callback;
      return 1;
    },
    clearScheduledTimeout() {}
  });

  const mounting = client.mount('auth', anchor);
  assert.equal(typeof timeoutCallback, 'function');
  timeoutCallback();

  await assert.rejects(() => mounting, /timed out/i);
  assert.ok(insertedWidget);
  assert.equal(widgetRemoved, true);
  assert.equal(listeners.size, 0);
});

test('after a reset the next token is waited for, because a token is good for one request only', async () => {
  let render;
  const resets = [];
  const window = { turnstile: { render: (container, options) => { render = options; return 'w1'; }, reset: (id) => resets.push(id) } };
  const document = { createElement: () => ({ dataset: {}, remove() {} }), getElementById: () => null, head: { appendChild() {} } };
  const timers = [];
  const client = createTurnstileClient({ window, document, siteKey: 'site-key', scheduleTimeout: (callback) => { timers.push(callback); return timers.length; }, clearScheduledTimeout() {} });
  await client.mount('supabase-auth', { before() {} });
  assert.equal(client.getToken('supabase-auth'), '');
  assert.equal(await client.waitForToken('nothing-mounted'), '');

  render.callback('first');
  assert.equal(await client.waitForToken('supabase-auth'), 'first', 'a token that is there is given at once');

  client.reset('supabase-auth');
  assert.deepEqual(resets, ['w1']);
  assert.equal(client.getToken('supabase-auth'), '');
  const waiting = client.waitForToken('supabase-auth');
  render.callback('second');
  assert.equal(await waiting, 'second', 'the new token ends the wait');

  client.reset('supabase-auth');
  const late = client.waitForToken('supabase-auth', 50);
  timers.at(-1)();
  assert.equal(await late, '', 'no new token in time: the person is asked to do the check again');
});
