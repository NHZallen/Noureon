import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './helpers/create-dom.js';

const projectFile = (path) => new URL(`../../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const fixture = `
  <button type="button" id="settings-btn">Settings</button>
  <div id="settings-modal" class="modal hidden">
    <nav id="settings-nav">
      <button type="button" class="settings-nav-item active" data-section="personalization">Personalization</button>
    </nav>
    <section id="personalization-section" class="settings-section active"></section>
    <select id="tavily-search-depth-select">
      <option value="basic">Basic</option>
      <option value="advanced">Advanced</option>
    </select>
  </div>
`;

const setupSettingsOpenFixture = (document, { tavilySearchDepth = 'advanced' } = {}) => {
  const calls = [];
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const tavilySearchDepthSelect = document.getElementById('tavily-search-depth-select');

  const getTavilySearchDepth = () => tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
  const setupSettingsModal = () => {
    calls.push('setup');
    tavilySearchDepthSelect.value = getTavilySearchDepth();
  };
  const toggleModal = (modalElement, show) => {
    calls.push(show ? 'open' : 'close');
    modalElement.classList.toggle('hidden', !show);
    modalElement.classList.toggle('visible', show);
  };

  settingsBtn.addEventListener('click', () => {
    setupSettingsModal();
    toggleModal(settingsModal, true);
  });

  return { calls, settingsBtn, settingsModal, tavilySearchDepthSelect };
};

test('settings button initializes settings state before opening the modal', () => {
  const { window, document, cleanup } = createDom(fixture);

  try {
    const { calls, settingsBtn, settingsModal, tavilySearchDepthSelect } = setupSettingsOpenFixture(document);

    assert.equal(settingsModal.classList.contains('hidden'), true);

    settingsBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(calls, ['setup', 'open']);
    assert.equal(tavilySearchDepthSelect.value, 'advanced');
    assert.equal(settingsModal.classList.contains('hidden'), false);
    assert.equal(settingsModal.classList.contains('visible'), true);
  } finally {
    cleanup();
  }
});

test('settings modal source keeps Tavily depth fallback local to setupSettingsModal', () => {
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');

  assert.match(
    fragment02Source,
    /const\s+getTavilySearchDepth\s*=\s*\(\)\s*=>\s*config\.tavilySearchDepth\s*===\s*'advanced'\s*\?\s*'advanced'\s*:\s*'basic';/
  );
  assert.match(
    fragment02Source,
    /if\s*\(ALL_ELEMENTS\.tavilySearchDepthSelect\)\s*ALL_ELEMENTS\.tavilySearchDepthSelect\.value\s*=\s*getTavilySearchDepth\(\);/
  );
  assert.match(
    appBootstrapLifecycleSource,
    /ALL_ELEMENTS\.settingsBtn\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*resolveEventsSetupSettingsModal\(\);\s*toggleModal\(ALL_ELEMENTS\.settingsModal,\s*true\);\s*\}\);/
  );
});

test('settings modal opener uses lazy context resolution instead of direct cross-fragment setup access', () => {
  const fragment02Source = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');
  const appBootstrapLifecycleSource = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');

  assert.match(
    fragment02Source,
    /legacyRuntimeContext\.registerLazyBinding\('settings\.setupSettingsModal',\s*\(\)\s*=>\s*setupSettingsModal\);/
  );
  assert.match(
    coreTailSource,
    /setupSettingsModal:\s*\(\.\.\.args\)\s*=>\s*legacyRuntimeContext\.resolveBinding\('settings\.setupSettingsModal'\)\(\.\.\.args\)/
  );
  assert.match(
    appBootstrapLifecycleSource,
    /const\s+resolveEventsSetupSettingsModal\s*=\s*setupSettingsModal;/
  );
  assert.doesNotMatch(appBootstrapLifecycleSource, /legacyRuntimeContext/);
});
