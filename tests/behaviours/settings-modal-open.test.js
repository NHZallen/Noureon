import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { createDom } from './helpers/create-dom.js';
import { createAppBootstrapLifecycle } from '../../src/app/runtime/features/app-bootstrap-lifecycle.js';

// Whatever the start of the app touches that these tests do not look at: every property is another stand-in, and calling one returns
// one (never a promise, so nothing waits on it).
const standIn = () => {
  const values = {};
  return new Proxy(function () {}, {
    get(_target, property) {
      if (property === 'then' || typeof property === 'symbol') return property === Symbol.toPrimitive ? () => '' : undefined;
      if (!(property in values)) values[property] = standIn();
      return values[property];
    },
    set(_target, property, value) {
      values[property] = value;
      return true;
    },
    apply: () => standIn(),
    construct: () => standIn()
  });
};

const fixture = `
  <button type="button" id="settings-btn">Settings</button>
  <button type="button" id="api-key-warning-badge">!</button>
  <div id="settings-modal" class="modal hidden"></div>
`;

// The real start of the app (initChatApp), with the settings dialog's own functions given as fakes that record what happens.
const startApp = async (document, { phone = false } = {}) => {
  const calls = [];
  const real = {
    settingsBtn: document.getElementById('settings-btn'),
    apiKeyWarningBadge: document.getElementById('api-key-warning-badge'),
    settingsModal: document.getElementById('settings-modal')
  };
  const elements = new Proxy(real, { get: (target, name) => (target[name] ??= standIn()) });
  const given = {
    window: standIn(),
    document: standIn(),
    elements,
    i18n: { en: {} },
    getConfig: () => ({ uiLanguage: 'en' }),
    getCurrentUser: () => ({ username: 'alice' }),
    startNewChat: async () => {},
    requestMemorySummaryBootstrap: async () => ({ skipped: true }),
    setupSettingsModal: () => calls.push('setup'),
    toggleModal: (element, show) => calls.push(`${show ? 'show' : 'hide'}:${element.id}`),
    isMobileSettingsViewport: () => phone,
    openSettingsMobileSection: (section) => calls.push(`open section:${section}`)
  };
  const dependencies = new Proxy(given, { get: (target, name) => (name in target ? target[name] : standIn()) });
  const { initChatApp } = createAppBootstrapLifecycle(dependencies);
  await initChatApp();
  return { calls, ...real };
};

test('the settings button builds the settings page before it is shown', async (t) => {
  // The page is also built ahead a few seconds after the start; that timer is not run here.
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const { window, document, cleanup } = createDom(fixture);
  try {
    const { calls, settingsBtn } = await startApp(document);
    assert.deepEqual(calls, []);

    settingsBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    assert.deepEqual(calls, ['setup', 'show:settings-modal']);
  } finally {
    cleanup();
  }
});

test('on a phone the API key warning opens the settings on the models section', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const { window, document, cleanup } = createDom(fixture);
  try {
    const { calls, apiKeyWarningBadge } = await startApp(document, { phone: true });

    apiKeyWarningBadge.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    assert.deepEqual(calls, ['setup', 'show:settings-modal', 'open section:model-management']);
  } finally {
    cleanup();
  }
});
