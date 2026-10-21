import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { syncInputIndicatorItems } from '../src/app/runtime/shell/input-indicator-sync.js';
import { createGeneratedImageRuntimeLoader } from '../src/app/runtime/shell/generated-image-runtime.js';

// Two pieces moved out of legacy-core.js and submit-input-council-lifecycle.js (both at the limit of their size): they must do what they did there.

function box() {
  const { document } = new Window();
  document.body.innerHTML = '<div class="input-wrapper"><div id="container"></div></div>';
  return { document, container: document.getElementById('container'), wrapper: document.querySelector('.input-wrapper') };
}
const chip = (id, html, clicks) => [id, { id, html, eventListener: (el) => clicks.push([id, el.innerHTML]) }];

test('the chips of the message box come in, are rewritten only when their markup changed, and go out; the box says whether it has any', () => {
  const { document, container, wrapper } = box();
  const clicks = [];
  syncInputIndicatorItems({ document, container, wrapper, activeIndicators: new Map([chip('a', '<b>A</b>', clicks), chip('b', '<b>B</b>', clicks)]) });
  assert.deepEqual([...container.children].map((node) => node.id), ['a', 'b']);
  assert.equal(wrapper.classList.contains('has-indicators'), true);
  assert.ok(container.children[0].classList.contains('enter'));
  assert.equal(clicks.length, 2, 'a handler for each new chip');

  syncInputIndicatorItems({ document, container, wrapper, activeIndicators: new Map([chip('a', '<b>A</b>', clicks), chip('b', '<b>B2</b>', clicks)]) });
  assert.equal(clicks.length, 3, 'only the chip whose markup changed is rewritten');
  assert.equal(document.getElementById('b').innerHTML, '<b>B2</b>');

  syncInputIndicatorItems({ document, container, wrapper, activeIndicators: new Map([chip('a', '<b>A</b>', clicks)]) });
  assert.ok(document.getElementById('b').classList.contains('exit'), 'a chip no longer wanted slides out');

  syncInputIndicatorItems({ document, container, wrapper, activeIndicators: new Map() });
  assert.equal(wrapper.classList.contains('has-indicators'), true, 'a chip is still sliding out');
  container.replaceChildren();
  syncInputIndicatorItems({ document, container, wrapper, activeIndicators: new Map() });
  assert.equal(wrapper.classList.contains('has-indicators'), false, 'nothing left');
});

test('the picture-making parts are loaded once, on the first call, and use what the shell gives them', async () => {
  const store = new Map();
  let files = null;
  const notices = [];
  const load = createGeneratedImageRuntimeLoader({
    document: new Window().document,
    fetch: async () => ({ blob: async () => ({ size: 3 }) }),
    navigator: {},
    File: class {},
    getItem: async (key) => store.get(key),
    setItem: async (key, value) => { store.set(key, value); },
    getUserName: () => 'ada',
    getActiveConversation: () => ({ retentionMode: 'ephemeral' }),
    buildSingleModelTranslatedRequestParts: async (parts) => parts,
    getApiKeyForProvider: () => 'key',
    getModelReasoningConfig: () => null,
    normalizeReasoningEffort: () => null,
    getText: (_key, fallback) => fallback,
    showNotification: (text, kind) => notices.push([text, kind]),
    getUiLanguage: () => 'en',
    getImageReadyText: () => 'ready',
    escapeHTML: (text) => text,
    setUploadedFiles: (next) => { files = next; },
    renderFilePreviews: () => {},
    focusMessageInput: () => {}
  });
  const first = load();
  assert.equal(load(), first, 'one promise');
  const runtime = await first;
  assert.deepEqual(Object.keys(runtime).sort(), ['assetStore', 'interactions', 'responseLifecycle']);
  assert.equal(typeof runtime.responseLifecycle.run, 'function');
  assert.equal(typeof runtime.assetStore.bind, 'function');
  assert.equal(typeof runtime.interactions.bind, 'function');
  assert.equal(files, null);
  assert.deepEqual(notices, []);
});
