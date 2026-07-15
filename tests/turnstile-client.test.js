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
