import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacySettingsAuthProviderLifecycle } from '../src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js';
import { createDependencies } from './helpers/settings-lifecycle-harness.js';
import { createDom } from './behaviours/helpers/create-dom.js';

test('factory exports createLegacySettingsAuthProviderLifecycle', () => {
  assert.equal(typeof createLegacySettingsAuthProviderLifecycle, 'function');
});

test('factory validates required dependencies', () => {
  assert.throws(
    () => createLegacySettingsAuthProviderLifecycle(),
    /missing dependencies:/
  );
});

test('factory exposes settings auth provider lifecycle API', () => {
  const { dependencies } = createDependencies();
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  for (const name of [
    'streamApiCall',
    'runModelCouncil',
    'callApiWithSchema',
    'generateTitleAndSummary',
    'updateSubmitButtonState',
    'updateInputState',
    'setupSettingsModal',
    'saveSettings',
    'handleLogin',
    'handleLogout',
    'handleDeleteAllData',
    'setTheme',
    'updateThemeButtons',
    'createHistoryMenu'
  ]) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
  // How a model is asked is loaded on demand (model-request-engine.js): the lifecycle hands on async functions only.
  for (const name of ['streamApiCall', 'runMemoryModel', 'buildSingleModelTranslatedRequestParts', 'fetchTavilySearchPacket',
    'streamCouncilApiCallWithRetry', 'runModelCouncil', 'callApiWithSchema', 'generateTitleAndSummary', 'prepareModelRequests']) {
    assert.equal(typeof lifecycle[name], 'function', `${name} should be exposed`);
  }
  assert.equal(lifecycle.providerRequestSupport, undefined);
  assert.equal(lifecycle.councilResponseLifecycle, undefined);
});

test('callApiWithSchema sends Gemini key through header instead of URL query', async () => {
  const requests = [];
  const { dependencies } = createDependencies({
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '{"ok":true}' }] } }
          ]
        })
      };
  }
});

  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  const result = await lifecycle.callApiWithSchema('Return JSON', {
    type: 'OBJECT',
    properties: { ok: { type: 'BOOLEAN' } }
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/cheap:generateContent$/);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].url.includes('gemini-secret-key'), false);
  assert.deepEqual(requests[0].options.headers, {
    'Content-Type': 'application/json',
    'x-goog-api-key': 'gemini-secret-key'
  });
});

test('settings config proxy reads and mutates the latest state config pointer', async () => {
  const { dependencies, calls, state } = createDependencies({
    document: {
      body: { classList: { contains: () => false } },
      documentElement: {
        classList: { toggle() {} },
        style: { setProperty() {} }
      },
      createElement: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      getElementById: () => ({ value: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } } }),
      querySelector: () => null,
      querySelectorAll: () => []
    }
  });
  dependencies.elements.settingsModal.classList.contains = (name) => name === 'hidden';
  const staleConfig = state.config;
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);
  const replacement = {
    ...staleConfig,
    tavilySearchDepth: 'advanced',
    theme: 'dark'
  };

  state.config = replacement;

  assert.equal(lifecycle.getTavilySearchDepth(), 'advanced');
  await lifecycle.setTheme('light');
  assert.equal('theme' in replacement, false);
  assert.equal(staleConfig.theme, 'dark');
  assert.equal(calls.includes('saveConfig'), true);
});

test('settings lifecycle leaves auto-search classification out of the Gemini helper boundary', () => {
  const { dependencies } = createDependencies();
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  assert.equal('shouldPerformWebSearch' in lifecycle, false);
});

test('generateTitleAndSummary keeps conversation side effects in lifecycle', async () => {
  const requests = [];
  const conversation = {
    id: 'conv-1',
    title: 'Old title',
    isNaming: true,
    messages: [
      { role: 'user', parts: [{ text: 'What is the capital of France?' }] },
      { role: 'model', parts: [{ text: 'Paris.' }] }
    ]
  };
  const { dependencies, calls } = createDependencies({
    getApiKeyForProvider: (provider) => provider === 'gemini' ? 'gemini-secret-key' : '',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '{"title":"France"}' }] } }
          ]
        })
      };
    },
    conversationStateAccess: { getCurrentConversationId: () => 'conv-1' }
  });
  dependencies.elements.headerTitle.textContent = '';
  const lifecycle = createLegacySettingsAuthProviderLifecycle(dependencies);

  await lifecycle.generateTitleAndSummary(conversation);

  assert.equal(conversation.title, 'France');
  assert.equal('summary' in conversation, false);
  assert.equal(conversation.isNaming, false);
  assert.equal(dependencies.elements.headerTitle.textContent, 'France');
  assert.deepEqual(calls.filter((call) => call === 'saveAppData' || call === 'renderHistorySidebar'), [
    'saveAppData',
    'renderHistorySidebar'
  ]);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'gemini-secret-key');
});

// The settings dialog in a real page: the helpers the lifecycle puts together (desktop sections, the phone list, sign-out, saving)
// are reached only through what the lifecycle hands out.
const settingsMarkup = `
  <div id="settings-modal" class="modal hidden">
    <div class="flex flex-1 overflow-hidden">
      <ul id="settings-nav">
        <li class="settings-nav-item" data-section="personalization">Personalization</li>
        <li class="settings-nav-item" data-section="model-management">Models</li>
      </ul>
      <div id="personalization-section" class="settings-section"></div>
      <div id="model-management-section" class="settings-section"></div>
    </div>
    <select id="tavily-search-depth-select"><option value="basic">Basic</option><option value="advanced">Advanced</option></select>
  </div>
  <button type="button" id="history-menu-btn">...</button>
`;

const createSettingsPage = ({ phone = false, config = {}, overrides = {} } = {}) => {
  const dom = createDom(settingsMarkup);
  const { dependencies, calls, state } = createDependencies({ document: dom.document, ...overrides });
  dependencies.window.matchMedia = () => ({ matches: phone });
  dependencies.window.innerHeight = 800;
  Object.assign(state.config, config);
  Object.assign(dependencies.i18n.en, { settingsSaved: 'Saved', pin: 'Pin', unpin: 'Unpin' });
  for (const [name, id] of [['settingsModal', 'settings-modal'], ['settingsNav', 'settings-nav'], ['tavilySearchDepthSelect', 'tavily-search-depth-select']]) {
    dependencies.elements[name] = dom.document.getElementById(id);
  }
  return { ...dom, dependencies, calls, state, lifecycle: createLegacySettingsAuthProviderLifecycle(dependencies) };
};

const activeSectionIds = (document) => [...document.querySelectorAll('.settings-section.active')].map((section) => section.id);

test('opening the settings on a wide screen adds the user page, shows it first and fills the saved search depth', async () => {
  const page = createSettingsPage({ config: { tavilySearchDepth: 'advanced' } });
  try {
    await page.lifecycle.setupSettingsModal();

    const navItems = [...page.document.querySelectorAll('#settings-nav .settings-nav-item')];
    assert.deepEqual(navItems.map((item) => item.dataset.section), ['user', 'personalization', 'model-management']);
    assert.equal(navItems[0].classList.contains('active'), true);
    assert.deepEqual(activeSectionIds(page.document), ['user-section']);
    assert.equal(page.document.getElementById('tavily-search-depth-select').value, 'advanced');
  } finally {
    page.cleanup();
  }
});

test('a search depth the settings do not know is shown as basic', async () => {
  const page = createSettingsPage({ config: { tavilySearchDepth: 'deep' } });
  try {
    await page.lifecycle.setupSettingsModal();

    assert.equal(page.lifecycle.getTavilySearchDepth(), 'basic');
    assert.equal(page.document.getElementById('tavily-search-depth-select').value, 'basic');
  } finally {
    page.cleanup();
  }
});

test('clicking a section in the settings menu shows that section only', async () => {
  const page = createSettingsPage();
  try {
    await page.lifecycle.setupSettingsModal();
    page.document.querySelector('#settings-nav [data-section="model-management"]').click();

    assert.deepEqual(activeSectionIds(page.document), ['model-management-section']);
    assert.equal(page.document.querySelector('#settings-nav .active').dataset.section, 'model-management');
  } finally {
    page.cleanup();
  }
});

test('on a phone the settings open on the list of sections, and a row opens its section', async () => {
  const page = createSettingsPage({ phone: true });
  try {
    await page.lifecycle.setupSettingsModal();

    assert.deepEqual(activeSectionIds(page.document), []);
    const row = page.document.querySelector('#settings-mobile-list [data-section="model-management"]');
    assert.ok(row, 'the list has a row for the models section');
    row.click();

    assert.deepEqual(activeSectionIds(page.document), ['model-management-section']);
    assert.equal(page.document.getElementById('settings-modal').classList.contains('settings-mobile-detail-open'), true);
    assert.equal(page.document.getElementById('settings-mobile-title').textContent, row.dataset.mobileTitle);
  } finally {
    page.cleanup();
  }
});

test('the log-out row of the phone settings list asks first, then signs out and reloads', async () => {
  let asked = 0;
  const page = createSettingsPage({ phone: true, overrides: { showCustomConfirm: async () => { asked += 1; return true; } } });
  try {
    await page.lifecycle.setupSettingsModal();
    page.document.getElementById('settings-mobile-logout-btn').click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(asked, 1);
    assert.deepEqual(page.calls.filter((call) => call === 'reload' || call[0] === 'removeItem'), [
      ['removeItem', 'chat_lastUser'],
      'reload'
    ]);
  } finally {
    page.cleanup();
  }
});

test('saving the settings writes the form into the current settings, saves them and closes the dialog', async () => {
  const page = createSettingsPage();
  try {
    const { elements } = page.dependencies;
    elements.tavilySearchDepthSelect.value = 'advanced';
    elements.autoNamingToggleSwitch.checked = true;
    elements.uiLanguageSelect.value = 'en';
    elements.aiLanguageSelect.value = 'fr';
    elements.uiColorOptions.dataset = { mode: 'custom', color: '#123456' };
    // The settings were replaced (a sync, a sign-in) after the lifecycle was made: the save goes to the new ones.
    const current = { ...page.state.config, uiTheme: {} };
    page.state.config = current;

    await page.lifecycle.saveSettings();

    assert.equal(current.tavilySearchDepth, 'advanced');
    assert.equal(current.autoNaming, true);
    assert.equal(current.aiDefaultLanguage, 'fr');
    assert.deepEqual(current.uiTheme, { mode: 'custom', customColor: '#123456' });
    assert.deepEqual(current.apiKeys, {});
    const names = page.calls.map((call) => (Array.isArray(call) ? call[0] : call));
    assert.ok(names.indexOf('applyUiTheme') < names.indexOf('saveConfig'));
    assert.ok(page.calls.some((call) => call[0] === 'toggleModal' && call[1] === elements.settingsModal && call[2] === false));
    assert.ok(page.calls.some((call) => call[0] === 'notification' && call[1] === 'Saved'));
  } finally {
    page.cleanup();
  }
});

test('the menu of a conversation loads on first use and acts on the conversation of the workspace', async () => {
  const moves = [];
  const page = createSettingsPage({ overrides: { moveConversationToFolder: (...args) => moves.push(args) } });
  try {
    page.state.conversations = [{ id: 'conv-1', pinned: true }];
    page.state.folders = [{ id: 'folder-1', name: 'Work', icon: 'default', color: 'blue' }];

    await page.lifecycle.createHistoryMenu('conv-1', page.document.getElementById('history-menu-btn'));

    const popover = page.document.getElementById('history-popover');
    assert.ok(popover, 'the menu is shown');
    assert.equal(popover.querySelector('.pin-btn').textContent, 'Unpin');
    popover.querySelector('.move-to-folder-btn[data-folder-id="folder-1"]').click();
    assert.deepEqual(moves, [['conv-1', 'folder-1']]);
    assert.equal(page.document.getElementById('history-popover'), null);
  } finally {
    page.cleanup();
  }
});
