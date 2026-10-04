import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { ensurePermissionsSettingsSection } from '../src/app/runtime/legacy-core/settings-permissions-section.js';
import { ensurePrivacySettingsSection } from '../src/app/runtime/legacy-core/settings-privacy-section.js';
import { PERMISSION_TEXTS } from '../src/app/runtime/cli/permission-texts.js';
import { getSettingsMobileGroups, SETTINGS_MOBILE_ICON_MAP } from '../src/app/legacy-runtime/features/settings-mobile-metadata.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 30));
const createSettings = () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `
    <ul id="settings-nav"><li class="settings-nav-item" data-section="data-management">Data</li><li class="settings-nav-item" data-section="trash">Trash</li></ul>
    <div id="data-management-section" class="settings-section"></div><div id="trash-section" class="settings-section"></div>
    <select id="ui-language-select"><option value="en">en</option><option value="fr">fr</option></select>`;
  const elements = { settingsNav: document.getElementById('settings-nav'), uiLanguageSelect: document.getElementById('ui-language-select') };
  return { window, document, elements };
};

test('the Permissions tab is added after Privacy, once, and opens at its first page', async () => {
  const { document, elements } = createSettings();
  const config = { uiLanguage: 'en', cliEnabledIds: [], cliModelUseIds: [], cliVersions: {}, netMode: 'new', netRules: {} };
  ensurePrivacySettingsSection({ document, elements, config, saveConfig: async () => {} });
  const options = { document, elements, config, saveConfig: async () => {}, getSync: () => ({ getStatus: () => ({ enabled: true }) }) };
  ensurePermissionsSettingsSection(options);
  ensurePermissionsSettingsSection(options);
  assert.deepEqual([...document.querySelectorAll('#settings-nav li')].map((item) => item.dataset.section), ['data-management', 'privacy', 'permissions', 'trash']);
  assert.equal(document.querySelectorAll('#permissions-section').length, 1);
  assert.equal(document.getElementById('privacy-section').nextElementSibling.id, 'permissions-section');
  assert.equal(document.getElementById('permissions-section-nav').textContent, PERMISSION_TEXTS.en.nav);
  assert.equal(document.getElementById('permissions-section-nav').dataset.langKey, 'permissions');
  await flush();
  const section = document.getElementById('permissions-section');
  assert.equal(section.querySelector('.pm-sub').textContent, 'Network access defaults');
  assert.ok(section.querySelector('input[name="cli-net-mode"]'));
});

test('the Permissions tab follows the language menu and works without a Privacy tab to follow', async () => {
  const { document, elements } = createSettings();
  const config = { uiLanguage: 'en', cliEnabledIds: [], cliModelUseIds: [], cliVersions: {}, netMode: 'new', netRules: {} };
  ensurePermissionsSettingsSection({ document, elements, config, saveConfig: async () => {}, getSync: () => null });
  assert.deepEqual([...document.querySelectorAll('#settings-nav li')].map((item) => item.dataset.section), ['data-management', 'permissions', 'trash']);
  await flush();
  const select = document.getElementById('ui-language-select');
  select.value = 'fr';
  select.dispatchEvent(new document.defaultView.Event('change'));
  await flush();
  assert.equal(document.querySelector('#permissions-section .pm-sub').textContent, PERMISSION_TEXTS.fr.netTitle);
  assert.equal(document.getElementById('permissions-section-nav').textContent, PERMISSION_TEXTS.fr.nav);
});

test('on a phone the tab is in the list too, after Privacy, with its own icon', () => {
  const sections = getSettingsMobileGroups((key, fallback) => fallback).flatMap((group) => group.items.map((item) => item.section));
  assert.equal(sections.indexOf('permissions'), sections.indexOf('privacy') + 1);
  assert.ok(SETTINGS_MOBILE_ICON_MAP.permissions.startsWith('<svg'));
});
