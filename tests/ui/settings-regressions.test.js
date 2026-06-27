import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from '../helpers/source-guards.js';

test('settings API key controls use masked intent helpers and scoped clear button styles', () => {
  const settingsAuthProviderLifecycle = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const settingsApiKeyControls = readUiSource('src/app/runtime/legacy-core/settings-api-key-controls.js');
  const css = readUiSource('src/styles/main.css');

  assert.match(settingsAuthProviderLifecycle, /createSettingsApiKeyControls/);
  assert.match(settingsApiKeyControls, /prepareApiKeyInput\(input,\s*\{/);
  assert.match(settingsApiKeyControls, /readApiKeyInputIntent\(input\)/);
  assert.match(settingsApiKeyControls, /markApiKeyInputCleared\(input\)/);
  assert.match(settingsApiKeyControls, /id\s*=\s*'clear-all-api-keys-btn'/);
  assert.doesNotMatch(settingsAuthProviderLifecycle, /ALL_ELEMENTS\.geminiApiKeyInput\.value\s*=\s*getApiKeyForProvider/);
  assert.doesNotMatch(settingsApiKeyControls, /dataset\.[A-Za-z0-9_$]*\s*=\s*rawValue/);

  assert.match(css, /\.api-key-input-group\s*\{/);
  assert.match(css, /\.api-key-clear-btn,\s*\.api-key-clear-all-btn\s*\{/);
  assert.match(css, /\.api-key-clear-all-btn\s*\{[^}]*width:\s*100%;/s);
});

test('settings navigation starts below the modal header divider on desktop', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*margin-top:\s*4\.5rem(?:\s*!important)?;/s);
  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*height:\s*calc\(100%\s*-\s*4\.5rem\)(?:\s*!important)?;/s);
});

test('mobile settings open to a GPT-style category list before drilling into details', () => {
  const settingsAuthProviderLifecycle = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const settingsMobileShellHelper = readUiSource('src/app/runtime/legacy-core/settings-mobile-shell-helper.js');
  const settingsDesktopSectionHelper = readUiSource('src/app/runtime/legacy-core/settings-desktop-section-helper.js');
  const css = readUiSource('src/styles/main.css');

  assert.match(settingsAuthProviderLifecycle, /createSettingsMobileShellHelper/);
  assert.match(settingsMobileShellHelper, /const\s+isMobileSettingsViewport\s*=\s*\(\)\s*=>\s*window\.matchMedia\('\(max-width:\s*768px\)'\)\.matches/);
  assert.match(settingsMobileShellHelper, /mobileHeader\.id\s*=\s*'settings-mobile-header'/);
  assert.match(settingsMobileShellHelper, /mobileList\.id\s*=\s*'settings-mobile-list'/);
  assert.match(settingsMobileShellHelper, /class="settings-mobile-list-item settings-nav-item"/);
  assert.match(settingsMobileShellHelper, /id="settings-mobile-back-btn"/);
  assert.match(settingsMobileShellHelper, /const\s+SETTINGS_MOBILE_VIEW_TRANSITION_MS\s*=\s*280/);
  assert.match(settingsMobileShellHelper, /const\s+showSettingsMobileList\s*=\s*\(\{\s*animate\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>/);
  assert.match(settingsMobileShellHelper, /const\s+openSettingsMobileSection\s*=\s*\(sectionName\)\s*=>/);
  assert.match(settingsMobileShellHelper, /ALL_ELEMENTS\.settingsModal\.classList\.add\('settings-mobile-detail-open'\)/);
  assert.match(settingsMobileShellHelper, /settingsModal\.classList\.add\('settings-mobile-returning'\)/);
  assert.match(settingsMobileShellHelper, /setTimeout\(finishReturn,\s*SETTINGS_MOBILE_VIEW_TRANSITION_MS\)/);
  assert.match(settingsAuthProviderLifecycle, /createSettingsDesktopSectionHelper/);
  assert.match(settingsDesktopSectionHelper, /showSettingsMobileList\(\{\s*animate:\s*false\s*\}\)/);
  assert.match(settingsMobileShellHelper, /settings-mobile-list-item/);
  assert.match(settingsMobileShellHelper, /settingsMobileBackBtn\.addEventListener\('click',\s*\(\)\s*=>\s*showSettingsMobileList\(\)\)/);
  assert.doesNotMatch(settingsAuthProviderLifecycle, /const\s+setSettingsSection\s*=/);
  assert.doesNotMatch(settingsAuthProviderLifecycle, /accessibility:\s*'<svg[^']*m8 21 4-9 4 9/);

  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#settings-modal\s+#settings-mobile-header[^{]*\{[^}]*display:\s*flex\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#settings-modal\.visible[^{]*\{[^}]*align-items:\s*flex-end\s*!important;[^}]*padding:\s*0\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#settings-modal\s*>\s*div[^{]*\{[^}]*width:\s*100vw\s*!important;[^}]*margin:\s*0\s*!important;[^}]*border-radius:\s*2rem\s+2rem\s+0\s+0\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#settings-modal\s+#settings-mobile-list[^{]*\{[^}]*display:\s*block\s*!important;/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s+#settings-mobile-list[^{]*\{[^}]*transform:\s*translateX\(-100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*transform:\s*translateX\(100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*transform:\s*translateX\(0\)\s*!important;/s);
  assert.match(css, /#settings-modal\.settings-mobile-returning\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*transform:\s*translateX\(100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\s*>\s*div\s*>\s*\.p-4\.bg-\\\[var\\\(--sidebar-bg\\\)\\\]\.border-t[^{]*\{[^}]*transition:[^}]*opacity\s+0\.34s\s+ease-in-out[^}]*transform\s+0\.34s\s+ease-in-out/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s*>\s*div\s*>\s*\.p-4\.bg-\\\[var\\\(--sidebar-bg\\\)\\\]\.border-t[^{]*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(-0\.35rem\)\s+scale\(0\.96\);/s);
  assert.match(css, /#settings-modal\.settings-mobile-returning\s*>\s*div\s*>\s*\.p-4\.bg-\\\[var\\\(--sidebar-bg\\\)\\\]\.border-t[^{]*\{(?:(?!opacity:|transform:)[^}])*animation:\s*settingsCloseReturnIn\s+0\.34s\s+ease-in-out/s);
  assert.match(css, /#settings-mobile-back-btn[^{]*\{[^}]*transform:\s*translateX\(-0\.35rem\)\s+scale\(0\.96\);[^}]*transition:[^}]*opacity\s+0\.34s\s+ease-in-out[^}]*transform\s+0\.34s\s+ease-in-out/s);
  assert.match(css, /#settings-modal\.settings-mobile-returning\s+#settings-mobile-back-btn[^{]*\{(?:(?!opacity:|transform:)[^}])*animation:\s*settingsBackReturnOut\s+0\.34s\s+ease-in-out/s);
  assert.match(css, /@keyframes\s+settingsCloseReturnIn\s*\{[\s\S]*from\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(-0\.35rem\)\s+scale\(0\.96\);[^}]*\}[\s\S]*to\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateY\(0\)\s+scale\(1\);/s);
  assert.match(css, /@keyframes\s+settingsBackReturnOut\s*\{[\s\S]*from\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateX\(0\)\s+scale\(1\);[^}]*\}[\s\S]*to\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateX\(-0\.35rem\)\s+scale\(0\.96\);/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s+\.settings-section\.active[^{]*\{[^}]*display:\s*block\s*!important;/s);
  assert.match(css, /#settings-modal\.settings-mobile-detail-open\s+\.settings-section\.active\s*>\s*h3[^{]*\{[^}]*margin-left:\s*0\s*!important;[^}]*width:\s*100%\s*!important;[^}]*text-align:\s*left\s*!important;/s);
});

test('mobile settings use readable dark surfaces in dark mode', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /\.dark\s+#settings-modal\s*>\s*div,[\s\S]*\.dark\s+#settings-modal\s+#settings-mobile-list,[\s\S]*\.dark\s+#settings-modal\s+\.flex-1\.p-6\.overflow-y-auto[^{]*\{[^}]*background:\s*var\(--modal-bg\)\s*!important;/s);
  assert.match(css, /\.dark\s+#settings-modal\s+\.settings-mobile-card,[\s\S]*\.dark\s+#settings-modal\s+\.settings-mobile-list-item\.settings-nav-item[^{]*\{[^}]*background:\s*var\(--input-field-bg\)\s*!important;[^}]*color:\s*var\(--text-primary\)\s*!important;/s);
  assert.match(css, /\.dark\s+#settings-modal\s+\.settings-mobile-row-label[^{]*\{[^}]*color:\s*var\(--text-primary\)\s*!important;/s);
  assert.match(css, /\.dark\s+#settings-modal\s+\.settings-mobile-group-title[^{]*\{[^}]*color:\s*var\(--text-secondary\)\s*!important;/s);
  assert.match(css, /\.dark\s+#settings-modal\s+#close-settings-btn[^{]*\{[^}]*background:\s*var\(--input-field-bg\)\s*!important;/s);
});

test('app typography uses restrained GPT-like system weights and mobile settings sheet motion', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /--astra-ui-font:\s*ui-sans-serif,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*system-ui,\s*sans-serif;/);
  assert.match(css, /html,\s*body,\s*button,\s*input,\s*textarea,\s*select[^{]*\{[^}]*font-family:\s*var\(--astra-ui-font\)\s*!important;/s);
  assert.match(css, /\.font-bold,\s*\.font-semibold,\s*strong,\s*b[^{]*\{[^}]*font-weight:\s*var\(--astra-font-semibold\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+\.settings-mobile-group-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-medium\)\s*!important;/s);
  assert.match(css, /#settings-mobile-list\s+\.settings-mobile-group:first-child\s+\.settings-mobile-group-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-regular\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+\.settings-mobile-list-item,\s*#settings-modal\s+\.settings-mobile-list-item\.settings-nav-item[^{]*\{[^}]*font-weight:\s*var\(--astra-font-regular\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-group-title[^{]*\{[^}]*font-size:\s*0\.95rem\s!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-list-item,\s*#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-list-item\.settings-nav-item[^{]*\{[^}]*font-size:\s*1\.06rem\s*!important;[^}]*min-height:\s*3\.85rem\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon[^{]*\{[^}]*width:\s*2\.05rem\s*!important;[^}]*height:\s*2\.05rem\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon\s+svg,\s*#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon\s+svg\s+\*[^{]*\{[^}]*width:\s*1\.42rem\s!important;[^}]*height:\s*1\.42rem\s!important;/s);
  assert.match(css, /#settings-mobile-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-semibold\)\s*!important;/s);
  assert.match(css, /\.settings-mobile-row-icon\s+svg,\s*\.settings-mobile-row-icon\s+svg\s+\*[^{]*\{[^}]*stroke-width:\s*1\.65\s*!important;/s);
  assert.match(css, /#settings-mobile-back-btn\s+svg,\s*#settings-mobile-back-btn\s+svg\s+\*[^{]*\{[^}]*stroke-width:\s*2\s!important;/s);
  assert.match(css, /#settings-modal\s*>\s*div[^{]*\{[^}]*transition:\s*transform\s+0\.32s\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/s);
  assert.match(css, /#settings-modal:not\(\.visible\)\s*>\s*div[^{]*\{[^}]*transform:\s*translateY\(100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\.visible\s*>\s*div[^{]*\{[^}]*transform:\s*translateY\(0\)\s*!important;/s);
});
