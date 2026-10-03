import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { ensurePrivacySettingsSection } from '../src/app/runtime/legacy-core/settings-privacy-section.js';
import { SERVER_REPLY_TEXTS } from '../src/app/runtime/server-reply/server-reply-texts.js';
import { getSettingsMobileGroups, SETTINGS_MOBILE_ICON_MAP } from '../src/app/legacy-runtime/features/settings-mobile-metadata.js';

const createSettings = () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `
    <ul id="settings-nav"><li class="settings-nav-item" data-section="data-management">Data</li><li class="settings-nav-item" data-section="trash">Trash</li></ul>
    <div id="data-management-section" class="settings-section"></div><div id="trash-section" class="settings-section"></div>
    <select id="ui-language-select"><option value="en">en</option><option value="fr">fr</option></select>`;
  const elements = { settingsNav: document.getElementById('settings-nav'), uiLanguageSelect: document.getElementById('ui-language-select') };
  return { window, document, elements };
};

test('the Privacy tab is added after Data management, once, and says where replies run', () => {
  const { document, elements } = createSettings();
  const config = { uiLanguage: 'en' };
  const saved = [];
  const options = { document, elements, config, saveConfig: async () => saved.push({ ...config }), getSync: () => ({ getStatus: () => ({ enabled: true }) }) };
  ensurePrivacySettingsSection(options);
  ensurePrivacySettingsSection(options);
  const items = [...document.querySelectorAll('#settings-nav li')].map((item) => item.dataset.section);
  assert.deepEqual(items, ['data-management', 'privacy', 'trash']);
  assert.equal(document.querySelectorAll('#privacy-section').length, 1);
  assert.equal(document.getElementById('data-management-section').nextElementSibling.id, 'privacy-section');
  const section = document.getElementById('privacy-section');
  assert.match(section.textContent, new RegExp(SERVER_REPLY_TEXTS.en.runTitle));
  assert.equal(section.querySelector('#reply-run-location-server').checked, true, 'the server is the default');
  assert.equal(section.querySelector('#reply-run-location-local').checked, false);
  assert.doesNotMatch(section.textContent, new RegExp(SERVER_REPLY_TEXTS.en.needAccount.slice(0, 20)), 'no note about an account when there is one');
});

test('choosing this device is kept in the settings at once, and the choice shows again when the tab is opened', async () => {
  const { document, elements } = createSettings();
  const config = { uiLanguage: 'en' };
  const saved = [];
  const options = { document, elements, config, saveConfig: async () => saved.push(config.replyRunLocation), getSync: () => ({ getStatus: () => ({ enabled: true }) }) };
  ensurePrivacySettingsSection(options);
  const local = document.getElementById('reply-run-location-local');
  local.checked = true;
  local.dispatchEvent(new document.defaultView.Event('change'));
  await Promise.resolve();
  assert.equal(config.replyRunLocation, 'local');
  assert.deepEqual(saved, ['local']);
  ensurePrivacySettingsSection(options);
  assert.equal(document.getElementById('reply-run-location-local').checked, true);
});

test('a person without a cloud account is told the server needs one; the tab follows the language menu', () => {
  const { document, elements } = createSettings();
  const config = { uiLanguage: 'en' };
  ensurePrivacySettingsSection({ document, elements, config, saveConfig: async () => {}, getSync: () => null });
  const section = document.getElementById('privacy-section');
  assert.match(section.textContent, new RegExp(SERVER_REPLY_TEXTS.en.needAccount.slice(0, 25)));
  const select = document.getElementById('ui-language-select');
  select.value = 'fr';
  select.dispatchEvent(new document.defaultView.Event('change'));
  assert.match(section.textContent, new RegExp(SERVER_REPLY_TEXTS.fr.runTitle));
  assert.equal(document.getElementById('privacy-section-nav').textContent, SERVER_REPLY_TEXTS.fr.navPrivacy);
});

test('on a phone the tab is in the list too, with its own icon', () => {
  const sections = getSettingsMobileGroups((key, fallback) => fallback).flatMap((group) => group.items.map((item) => item.section));
  assert.ok(sections.includes('privacy'));
  assert.ok(SETTINGS_MOBILE_ICON_MAP.privacy.startsWith('<svg'));
});
