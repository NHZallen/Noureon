import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { Window } from 'happy-dom';
import { onSettingsSectionBack, tryHandleSettingsBack } from '../src/app/runtime/legacy-core/settings-section-back.js';
import { createSettingsMobileShellHelper } from '../src/app/runtime/legacy-core/settings-mobile-shell-helper.js';

test('a section that has pages of its own takes the back arrow first; one that has not, or is on its first page, lets it leave', () => {
  assert.equal(tryHandleSettingsBack('nothing-section'), false);
  let pages = 2;
  onSettingsSectionBack('pages-section', () => { if (pages > 0) { pages -= 1; return true; } return false; });
  assert.deepEqual([tryHandleSettingsBack('pages-section'), tryHandleSettingsBack('pages-section'), tryHandleSettingsBack('pages-section')], [true, true, false]);
  onSettingsSectionBack('broken-section', () => { throw new Error('boom'); });
  assert.equal(tryHandleSettingsBack('broken-section'), false, 'a fault leaves the page rather than trapping the person');
  onSettingsSectionBack('pages-section', null);
  assert.equal(tryHandleSettingsBack('pages-section'), false);
});

test('on a phone the arrow at the top of the page goes back through the pages of the open section before it leaves the section', () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `<div id="settings-modal"><div class="flex flex-1 overflow-hidden"></div></div>
    <div id="permissions-section" class="settings-section active"></div><div id="privacy-section" class="settings-section"></div>`;
  const elements = { settingsModal: document.getElementById('settings-modal') };
  window.matchMedia = () => ({ matches: true });
  const helper = createSettingsMobileShellHelper({ window, document, elements, escapeHTML: (v) => String(v), getSettingsText: (key, fallback) => fallback, handleLogout: () => {}, setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {} });
  helper.ensureSettingsMobileShell();
  elements.settingsModal.classList.add('settings-mobile-detail-open');
  let page = 1;
  onSettingsSectionBack('permissions-section', () => { if (page > 0) { page -= 1; return true; } return false; });
  const back = document.getElementById('settings-mobile-back-btn');
  back.click();
  assert.ok(elements.settingsModal.classList.contains('settings-mobile-detail-open'), 'went back a page, still in the section');
  assert.ok(document.getElementById('permissions-section').classList.contains('active'));
  back.click();
  assert.ok(!document.getElementById('permissions-section').classList.contains('active'), 'on its first page: the arrow leaves the section');
  onSettingsSectionBack('permissions-section', null);
});

test('the Permissions tab registers its pages with the arrow, the in-page back button is only for wide screens, and no line is drawn under a settings page on a phone', async () => {
  const section = await readFile(new URL('../src/app/runtime/legacy-core/settings-permissions-section.js', import.meta.url), 'utf8');
  assert.match(section, /onSettingsSectionBack\(SECTION_ID, \(\) => goBackInPermissionsView\(section\)\)/);
  const css = await readFile(new URL('../src/styles/permissions.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 768px\) \{\s*\.pm \.pm-back \{ display: none; \}/);
  const personalization = await readFile(new URL('../src/styles/personalization.css', import.meta.url), 'utf8');
  const rule = personalization.slice(personalization.indexOf('#settings-modal .settings-section {\n        display: block !important;'));
  assert.match(rule.slice(0, 200), /border-bottom: none;/);
});
