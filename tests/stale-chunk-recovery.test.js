import assert from 'node:assert/strict';
import test from 'node:test';

import { persistAssistantResponseError } from '../src/app/legacy-runtime/features/assistant-response-finalization.js';
import { installStaleChunkRecovery, isStaleChunkError, offerReloadForNewVersion, staleChunkMessage } from '../src/pwa/stale-chunk-recovery.js';

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

const withDialog = async (answer, run) => {
  const previous = globalThis.__astraShowUpdateDialog;
  const shown = [];
  globalThis.__astraShowUpdateDialog = async (options) => {
    shown.push(options);
    return answer ? options.buttons.at(-1).value() : options.buttons[0].value();
  };
  try {
    return await run(shown);
  } finally {
    globalThis.__astraShowUpdateDialog = previous;
  }
};

test('the failure of a page from before a deployment to load a new piece is recognised', () => {
  assert.equal(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://noureon.com/assets/sandbox-reply-C_cmoMqw.js')), true);
  assert.equal(isStaleChunkError(new Error('error loading dynamically imported module')), true);
  assert.equal(isStaleChunkError(new Error('Importing a module script failed.')), true);
  assert.equal(isStaleChunkError(new Error('HTTP 500')), false);
  assert.equal(isStaleChunkError(null), false);
});

test('the message is plain and comes in the five languages', () => {
  const document = (lang) => ({ documentElement: { lang } });
  assert.match(staleChunkMessage(document('zh-TW')), /重新載入/);
  assert.match(staleChunkMessage(document('en')), /Reload the page/);
  assert.match(staleChunkMessage(document('fr')), /Rechargez/);
  assert.match(staleChunkMessage(document('ru')), /Перезагрузите/);
  assert.match(staleChunkMessage(document('es')), /Recarga/);
  assert.match(staleChunkMessage(document('de')), /重新載入/, 'other languages fall back');
});

test('a reload is offered once, done when accepted, and refused again within a minute', async () => {
  await withDialog(true, async (shown) => {
    let reloads = 0;
    let clock = 1_000_000;
    const windowTarget = { sessionStorage: storage(), location: { reload: () => { reloads += 1; } } };
    const documentTarget = { documentElement: { lang: 'en' } };
    assert.equal(await offerReloadForNewVersion({ windowTarget, documentTarget, now: () => clock }), true);
    assert.equal(reloads, 1);
    assert.equal(shown[0].title, 'New version available');
    clock += 5_000;
    assert.equal(await offerReloadForNewVersion({ windowTarget, documentTarget, now: () => clock }), false, 'a file that is really missing cannot loop the page');
    assert.equal(reloads, 1);
    clock += 120_000;
    assert.equal(await offerReloadForNewVersion({ windowTarget, documentTarget, now: () => clock }), true);
  });
  await withDialog(false, async () => {
    let reloads = 0;
    const windowTarget = { sessionStorage: storage(), location: { reload: () => { reloads += 1; } } };
    assert.equal(await offerReloadForNewVersion({ windowTarget, documentTarget: { documentElement: { lang: 'en' } } }), false);
    assert.equal(reloads, 0, '"Later" leaves the page alone');
  });
});

test('a piece of the app that fails to load anywhere leads to the offer', async () => {
  await withDialog(false, async (shown) => {
    const listeners = new Map();
    const windowTarget = {
      sessionStorage: storage(),
      location: { reload() {} },
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name)
    };
    const stop = installStaleChunkRecovery({ windowTarget, documentTarget: { documentElement: { lang: 'zh-TW' } } });
    let prevented = 0;
    listeners.get('vite:preloadError')({ preventDefault: () => { prevented += 1; } });
    listeners.get('unhandledrejection')({ reason: new TypeError('Failed to fetch dynamically imported module: x'), preventDefault: () => { prevented += 1; } });
    listeners.get('unhandledrejection')({ reason: new Error('something else'), preventDefault: () => { prevented += 1; } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(prevented, 2, 'only the stale-file failures are handled');
    assert.equal(shown.length, 2);
    stop();
    assert.equal(listeners.size, 0);
  });
});

test('a reply that failed for that reason says so instead of showing the browser error', async () => {
  await withDialog(false, async (shown) => {
    const conversation = { messages: [] };
    const target = { innerHTML: '' };
    let rendered = '';
    const result = await persistAssistantResponseError({
      error: new TypeError('Failed to fetch dynamically imported module: https://noureon.com/assets/sandbox-reply-C_cmoMqw.js'),
      signal: new AbortController().signal,
      conversation,
      targetElement: target,
      errorPrefix: '抱歉，發生錯誤：',
      fallbackModelName: 'M',
      getLatestProgress: () => null,
      stopSingleModelLifecycle: () => {},
      renderError: (progress, message) => { rendered = message; return message; },
      persistAppData: async () => {}
    });
    assert.doesNotMatch(result.errorMessage, /dynamically imported/);
    assert.match(result.errorMessage, /重新載入|Reload|Recharg|Перезагр|Recarga/);
    assert.equal(rendered, result.errorMessage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(shown.length <= 1);
  });
  const other = await persistAssistantResponseError({
    error: new Error('HTTP 500'),
    signal: new AbortController().signal,
    conversation: { messages: [] },
    targetElement: { innerHTML: '' },
    errorPrefix: '抱歉，發生錯誤：',
    fallbackModelName: 'M',
    getLatestProgress: () => null,
    stopSingleModelLifecycle: () => {},
    renderError: (progress, message) => message,
    persistAppData: async () => {}
  });
  assert.equal(other.errorMessage, '抱歉，發生錯誤：HTTP 500', 'other errors are unchanged');
});
