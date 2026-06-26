import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readCssSource = (path, seen = new Set()) => {
  const fileUrl = new URL(`../${path}`, import.meta.url);
  const fileKey = fileUrl.href;
  if (seen.has(fileKey)) return '';
  seen.add(fileKey);

  const source = readFileSync(fileUrl, 'utf8');
  const baseDir = dirname(path).replaceAll('\\', '/');

  return source.replace(/@import\s+['"](.+?)['"];\s*/g, (_match, importPath) => {
    const nextPath = importPath.startsWith('.')
      ? new URL(importPath, new URL(`../${baseDir}/`, import.meta.url)).pathname
      : importPath;
    const normalizedPath = nextPath.startsWith('/')
      ? nextPath.replace(/^\/[A-Za-z]:\//, '').replace(/^.*?astranos-chatbot-main\//, '')
      : nextPath;
    return readCssSource(normalizedPath, seen);
  });
};
const readUiSource = (path) => (path === 'src/styles/main.css' ? readCssSource(path) : readSource(path));

test('outlined settings and trash actions use the shared white outline button style', () => {
  const shell03 = readUiSource('src/templates/fragments/03-shell.fragment.js');
  const shell04 = readUiSource('src/templates/fragments/04-shell.fragment.js');
  const trashLifecycle = readUiSource('src/app/runtime/features/trash-lifecycle.js');

  for (const id of ['upload-wallpaper-btn', 'restore-wallpaper-btn', 'export-data-btn', 'import-data-btn', 'open-archived-modal-btn']) {
    assert.match(shell03, new RegExp(`id=\\\\"${id}\\\\"[^"]*class=\\\\"[^"]*btn-outline-white`));
  }

  for (const id of ['trash-batch-select-btn', 'empty-trash-btn']) {
    assert.match(shell04, new RegExp(`id=\\\\"${id}\\\\"[^"]*class=\\\\"[^"]*btn-outline-white`));
  }

  for (const className of ['trash-item-view-btn', 'trash-item-restore-btn', 'trash-item-delete-btn']) {
    assert.match(trashLifecycle, new RegExp(`${className}[^\\n]+btn-outline-white`));
  }
});

test('active input modes use the theme color without black outline chrome', () => {
  const css = readUiSource('src/styles/main.css');
  const runtime01 = readUiSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  const appBootstrapLifecycle = readUiSource('src/app/runtime/features/app-bootstrap-lifecycle.js');

  assert.match(css, /#attachment-menu\s+\.menu-item\.is-active/);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item[^{]*\{[^}]*border:\s*0\s*!important;[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.doesNotMatch(css, /#input-indicator-container\s+\.input-indicator-item[^{]*\{[^}]*border:\s*1px\s+solid\s+#000000\s*!important;/s);
  assert.doesNotMatch(css, /#attachment-menu\s+\.menu-item\.is-active[^{]*\{[^}]*color:\s*#111827\s*!important;/s);
  assert.match(css, /#attachment-menu\s+\.menu-item\.is-active,\s*#file-options-popover\s+#web-search-popover-btn\.is-active,\s*#file-options-popover\s+#learning-mode-btn\.is-active,\s*#file-options-popover\s+#model-council-menu-btn\.is-active[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.match(runtime01, /councilMenuButton\.classList\.toggle\('is-active',\s*councilActive\)/);
  assert.match(appBootstrapLifecycle, /item\.id === 'model-council-menu-btn' && councilActive/);
});

test('desktop chat input reserves the lower row only for active modes or multiline text', () => {
  const css = readUiSource('src/styles/main.css');
  const startupLifecycle = readUiSource('src/app/runtime/features/startup-lifecycle.js');

  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*display:\s*grid\s*!important;[^}]*grid-template-areas:\s*"file input input voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-indicators,\s*#input-bar-container\s+\.input-wrapper\.has-multiline-input[^{]*\{[^}]*grid-template-areas:\s*"input input input input input"\s*"file indicators spacer voice submit"/s);
  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-indicator-container[^{]*\{[^}]*grid-area:\s*indicators;[^}]*position:\s*static\s*!important;/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*transition:[^}]*min-height\s+0\.24s[^}]*padding\s+0\.24s/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.flex\.items-end[^{]*\{[^}]*transition:[^}]*transform\s+0\.24s/s);
  assert.match(startupLifecycle, /const\s+wasMultilineLayout\s*=\s*wrapper\?\.classList\.contains\('has-multiline-input'\)\s*\|\|\s*false/);
  assert.match(startupLifecycle, /const\s+firstLineWouldWrap\s*=\s*hasInputText\s*&&\s*isDesktopInput\s*&&\s*!wasMultilineLayout/);
  assert.match(startupLifecycle, /measurementContext\.measureText\(line\)\.width/);
  assert.match(startupLifecycle, /const\s+useMultilineLayout\s*=\s*isDesktopInput\s*&&\s*hasInputText\s*&&\s*\(\s*wasMultilineLayout/s);
  assert.match(startupLifecycle, /if\s*\(wrapper\s*&&\s*isDesktopInput\)\s*\{[\s\S]*wrapper\.classList\.toggle\('has-multiline-input',\s*useMultilineLayout\)/);
});

test('composer upload previews occupy a full-width row above desktop input controls', () => {
  const css = readUiSource('src/styles/main.css');
  const runtime00 = readUiSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const previewLifecycle = readUiSource('src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js');

  assert.match(runtime00, /preview\.className\s*=\s*'input-media-preview empty:hidden';[\s\S]*wrapper\.insertBefore\(preview,\s*wrapper\.firstChild\)/);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-file-previews[^{]*\{[^}]*grid-template-areas:\s*"preview preview preview preview preview"\s*"file input input voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-file-previews\.has-indicators,\s*#input-bar-container\s+\.input-wrapper\.has-file-previews\.has-multiline-input[^{]*\{[^}]*grid-template-areas:\s*"preview preview preview preview preview"\s*"input input input input input"\s*"file indicators spacer voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.input-media-preview[^{]*\{[^}]*grid-area:\s*preview;[^}]*align-self:\s*stretch;[^}]*width:\s*100%;/s);
  assert.doesNotMatch(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.input-media-preview[^{]*\{[^}]*position:\s*absolute/s);
  assert.match(previewLifecycle, /removeButton\.innerHTML\s*=\s*'&times;';[\s\S]*event\.stopPropagation\(\);[\s\S]*removeFile\(file\.id\)/);
});

test('desktop active mode and Astras pills swap their leading icon to the themed close icon on hover', () => {
  const css = readUiSource('src/styles/main.css');
  const runtime01 = readUiSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');

  assert.match(runtime01, /id: 'astras-input-indicator'[\s\S]*input-indicator-leading[\s\S]*input-indicator-mode-icon[\s\S]*close-astras-btn-input/);
  assert.match(css, /#astras-input-indicator[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item\s+svg,\s*#input-indicator-container\s+\.input-indicator-item\s+svg\s+\*[^{]*\{[^}]*color:\s*inherit\s*!important;[^}]*stroke:\s*currentColor\s*!important;/s);
  assert.match(css, /#astras-input-indicator\s+svg[\s\S]*#astras-input-indicator\s+svg\s+\*[^{]*\{[^}]*color:\s*inherit\s*!important;[^}]*stroke:\s*currentColor\s*!important;/s);
  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-indicator-container\s+#close-search-btn-input,\s*#input-indicator-container\s+#close-learning-mode-btn-input,\s*#input-indicator-container\s+#close-model-council-btn-input,\s*#input-indicator-container\s+#close-astras-btn-input[^{]*\{[^}]*position:\s*absolute\s*!important;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item:hover\s+\.input-indicator-mode-icon[^{]*\{[^}]*opacity:\s*0\s*!important;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item:hover\s+#close-search-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-learning-mode-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-model-council-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-astras-btn-input[^{]*\{[^}]*opacity:\s*1\s*!important;/s);
});

test('media preview download and share icons stay white over dark media', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /\.media-lightbox-action,\s*\.media-lightbox-action\s+svg,\s*\.media-lightbox-action\s+svg\s+\*[^{]*\{[^}]*color:\s*#ffffff\s*!important;[^}]*stroke:\s*#ffffff\s*!important;/s);
  assert.match(css, /\.media-lightbox-action\s+svg\s*\{[^}]*fill:\s*none\s*!important;/s);
  assert.match(css, /\.media-lightbox-action\s+svg\s+\[fill\]:not\(\[fill="none"\]\)[^{]*\{[^}]*fill:\s*#ffffff\s*!important;/s);
});

test('mobile keeps the existing stacked indicator layout and hides message mic', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#voice-input-btn-message[^{]*\{[^}]*display:\s*none\s*!important;/s);
});

test('mobile web search typing does not disable the message input when Tavily is missing', () => {
  const settingsAuthProviderLifecycle = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const startupLifecycle = readUiSource('src/app/runtime/features/startup-lifecycle.js');

  assert.match(settingsAuthProviderLifecycle, /const\s+hasModelApiKey\s*=\s*isCouncilEnabled\(conv\)[\s\S]*!!getApiKeyForProvider\(provider\)/);
  assert.match(settingsAuthProviderLifecycle, /const\s+hasApiKey\s*=\s*hasModelApiKey\s*&&\s*canSubmitWithSearch/);
  assert.match(settingsAuthProviderLifecycle, /ALL_ELEMENTS\.messageInput\.disabled\s*=\s*!hasModelApiKey/);
  assert.match(startupLifecycle, /else\s+if\s*\(wrapper\)\s*\{[\s\S]*wrapper\.classList\.remove\('has-multiline-input'\)/);
});

test('model council manager uses compact pills and a bounded scroll area', () => {
  const css = readUiSource('src/styles/main.css');
  const runtime01 = readUiSource('src/app/legacy-runtime/features/council-controls-lifecycle.js');

  assert.match(runtime01, /class="council-mode-cluster"[\s\S]*id="model-council-enabled"[\s\S]*class="council-mode-tabs"/);
  assert.match(runtime01, /class="council-action-cluster"[\s\S]*id="model-council-search-toggle"[\s\S]*data-council-model-search/);
  assert.match(runtime01, /const\s+previousModelSearch\s*=[\s\S]*data-council-model-search/);
  assert.match(runtime01, /const\s+applySearch\s*=\s*\(\)\s*=>[\s\S]*council-model-group[\s\S]*group\.hidden/);
  assert.match(runtime01, /conversation\.council\.mode\s*=\s*button\.dataset\.councilMode;[\s\S]*await\s+persistCouncilConfig\(conversation\);[\s\S]*renderCouncilControls\(\);/);
  assert.match(runtime01, /conversation\.isWebSearchEnabled\s*=\s*!conversation\.isWebSearchEnabled/);
  assert.doesNotMatch(runtime01, /council-filter-panel|data-council-filter|filtersHTML|applyCouncilSearchFilter/);
  assert.doesNotMatch(runtime01, /<p class="council-search-note[^`]*runtimeTexts\.searchManualNotice/);
  assert.match(runtime01, /<div class="council-popover-scroll-area">[\s\S]*<div class="council-popover-bottom">/);
  assert.match(css, /\.model-council-popover[^{]*\{[^}]*overflow:\s*hidden\s*!important;/s);
  assert.match(css, /\.council-config-row[^{]*\{[^}]*justify-content:\s*flex-start\s*!important;/s);
  assert.match(css, /\.council-action-cluster[^{]*\{[^}]*flex:\s*1\s+1\s+auto\s*!important;[^}]*margin-left:\s*0\s*!important;/s);
  assert.match(css, /\.council-model-search-field[^{]*\{[^}]*flex:\s*1\s+1\s+auto\s*!important;[^}]*width:\s*auto\s*!important;/s);
  assert.match(css, /\.council-popover-scroll-area[^{]*\{[^}]*overflow-y:\s*auto\s*!important;[^}]*-webkit-overflow-scrolling:\s*touch\s*!important;[^}]*scrollbar-color:\s*var\(--gpt-scrollbar\)\s+transparent\s*!important;/s);
  assert.match(css, /\.council-popover-scroll-area::-webkit-scrollbar-thumb[^{]*\{[^}]*background:\s*var\(--gpt-scrollbar\)\s*!important;/s);
  assert.match(css, /\.model-council-popover[^{]*\{[^}]*opacity:\s*0\s*!important;[^}]*transition:\s*opacity\s+0\.22s\s+ease[^}]*transform\s+0\.22s/s);
  assert.match(css, /\.model-council-popover\.visible[^{]*\{[^}]*opacity:\s*1\s*!important;[^}]*visibility:\s*visible\s*!important;/s);
  assert.match(css, /\.council-enable-pill\.is-active[^{]*\{[^}]*background:\s*#ffffff\s*!important;[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.match(css, /\.council-search-toggle\.is-active[^{]*\{[^}]*background:\s*#ffffff\s*!important;[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.match(css, /\.model-council-popover\s+\.council-mode-tabs button:not\(\.active\)[^{]*\{[^}]*border-color:\s*transparent\s*!important;[^}]*background:\s*transparent\s*!important;/s);
  assert.match(css, /\.council-mode-tabs button\.active[^{]*\{[^}]*border-color:\s*#000000\s*!important;[^}]*background:\s*#ffffff\s*!important;/s);
  assert.match(css, /\.council-section-title[^{]*\{[^}]*position:\s*sticky\s*!important;[^}]*top:\s*0\s*!important;[^}]*text-transform:\s*none\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[^{]*\{[\s\S]*\.council-config-row[^{]*\{[^}]*flex-direction:\s*column\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[^{]*\{[\s\S]*\.council-action-cluster[^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s*!important;/s);
});

test('sidebar search and history model pills use solid white surfaces', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /#open-search-btn[^{]*\{[^}]*background:\s*#ffffff\s*!important;/s);
  assert.match(css, /\.model-suffix[^{]*\{[^}]*background-color:\s*#ffffff;/s);
  assert.match(css, /\.dark\s+\.model-suffix[^{]*\{[^}]*background-color:\s*var\(--input-field-bg\)(?:\s*!important)?;/s);
});

test('desktop startup keeps sidebar closed while preserving manual and mobile toggle paths', () => {
  const appBootstrapLifecycle = readUiSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const searchUploadSidebarLifecycle = readUiSource('src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js');

  assert.match(
    appBootstrapLifecycle,
    /if\s*\(window\.innerWidth\s*>=\s*1024\)\s*\{[\s\S]*setSidebarOpen\(false\);[\s\S]*ALL_ELEMENTS\.appContainer\.classList\.remove\('sidebar-open'\);[\s\S]*\}/
  );
  assert.doesNotMatch(
    appBootstrapLifecycle,
    /if\s*\(window\.innerWidth\s*>=\s*1024\)\s*\{[\s\S]*setSidebarOpen\(true\);[\s\S]*classList\.add\('sidebar-open'\)/
  );
  assert.match(appBootstrapLifecycle, /ALL_ELEMENTS\.menuToggleBtn\.addEventListener\('click',\s*\(\)\s*=>\s*toggleSidebar\(\)\)/);
  assert.match(appBootstrapLifecycle, /ALL_ELEMENTS\.sidebarOverlay\.addEventListener\('click',\s*\(\)\s*=>\s*toggleSidebar\(false\)\)/);
  assert.match(searchUploadSidebarLifecycle, /appContainer\.classList\.toggle\('sidebar-open',\s*sidebarOpen\)/);
  assert.match(searchUploadSidebarLifecycle, /sidebar\.style\.transform\s*=\s*'translateX\(0\)'/);
  assert.match(searchUploadSidebarLifecycle, /sidebar\.style\.transform\s*=\s*'translateX\(-100%\)'/);
});

test('settings navigation starts below the modal header divider on desktop', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*margin-top:\s*4\.5rem(?:\s*!important)?;/s);
  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*height:\s*calc\(100%\s*-\s*4\.5rem\)(?:\s*!important)?;/s);
});

test('mobile settings open to a GPT-style category list before drilling into details', () => {
  const settingsAuthProviderLifecycle = readUiSource('src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js');
  const css = readUiSource('src/styles/main.css');

  assert.match(settingsAuthProviderLifecycle, /const\s+isMobileSettingsViewport\s*=\s*\(\)\s*=>\s*window\.matchMedia\('\(max-width:\s*768px\)'\)\.matches/);
  assert.match(settingsAuthProviderLifecycle, /mobileHeader\.id\s*=\s*'settings-mobile-header'/);
  assert.match(settingsAuthProviderLifecycle, /mobileList\.id\s*=\s*'settings-mobile-list'/);
  assert.match(settingsAuthProviderLifecycle, /class="settings-mobile-list-item settings-nav-item"/);
  assert.match(settingsAuthProviderLifecycle, /id="settings-mobile-back-btn"/);
  assert.match(settingsAuthProviderLifecycle, /const\s+SETTINGS_MOBILE_VIEW_TRANSITION_MS\s*=\s*280/);
  assert.match(settingsAuthProviderLifecycle, /const\s+showSettingsMobileList\s*=\s*\(\{\s*animate\s*=\s*true\s*\}\s*=\s*\{\}\)\s*=>/);
  assert.match(settingsAuthProviderLifecycle, /const\s+openSettingsMobileSection\s*=\s*\(sectionName\)\s*=>/);
  assert.match(settingsAuthProviderLifecycle, /ALL_ELEMENTS\.settingsModal\.classList\.add\('settings-mobile-detail-open'\)/);
  assert.match(settingsAuthProviderLifecycle, /settingsModal\.classList\.add\('settings-mobile-returning'\)/);
  assert.match(settingsAuthProviderLifecycle, /setTimeout\(finishReturn,\s*SETTINGS_MOBILE_VIEW_TRANSITION_MS\)/);
  assert.match(settingsAuthProviderLifecycle, /showSettingsMobileList\(\{\s*animate:\s*false\s*\}\)/);
  assert.match(settingsAuthProviderLifecycle, /settings-mobile-list-item/);
  assert.match(settingsAuthProviderLifecycle, /settingsMobileBackBtn\.addEventListener\('click',\s*\(\)\s*=>\s*showSettingsMobileList\(\)\)/);
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

test('app typography uses restrained GPT-like system weights and mobile settings sheet motion', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /--astra-ui-font:\s*ui-sans-serif,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*system-ui,\s*sans-serif;/);
  assert.match(css, /html,\s*body,\s*button,\s*input,\s*textarea,\s*select[^{]*\{[^}]*font-family:\s*var\(--astra-ui-font\)\s*!important;/s);
  assert.match(css, /\.font-bold,\s*\.font-semibold,\s*strong,\s*b[^{]*\{[^}]*font-weight:\s*var\(--astra-font-semibold\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+\.settings-mobile-group-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-medium\)\s*!important;/s);
  assert.match(css, /#settings-mobile-list\s+\.settings-mobile-group:first-child\s+\.settings-mobile-group-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-regular\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+\.settings-mobile-list-item,\s*#settings-modal\s+\.settings-mobile-list-item\.settings-nav-item[^{]*\{[^}]*font-weight:\s*var\(--astra-font-regular\)\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-group-title[^{]*\{[^}]*font-size:\s*0\.95rem\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-list-item,\s*#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-list-item\.settings-nav-item[^{]*\{[^}]*font-size:\s*1\.06rem\s*!important;[^}]*min-height:\s*3\.85rem\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon[^{]*\{[^}]*width:\s*2\.05rem\s*!important;[^}]*height:\s*2\.05rem\s*!important;/s);
  assert.match(css, /#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon\s+svg,\s*#settings-modal\s+#settings-mobile-list\s+\.settings-mobile-row-icon\s+svg\s+\*[^{]*\{[^}]*width:\s*1\.42rem\s*!important;[^}]*height:\s*1\.42rem\s*!important;/s);
  assert.match(css, /#settings-mobile-title[^{]*\{[^}]*font-weight:\s*var\(--astra-font-semibold\)\s*!important;/s);
  assert.match(css, /\.settings-mobile-row-icon\s+svg,\s*\.settings-mobile-row-icon\s+svg\s+\*[^{]*\{[^}]*stroke-width:\s*1\.65\s*!important;/s);
  assert.match(css, /#settings-mobile-back-btn\s+svg,\s*#settings-mobile-back-btn\s+svg\s+\*[^{]*\{[^}]*stroke-width:\s*2\s*!important;/s);
  assert.match(css, /#settings-modal\s*>\s*div[^{]*\{[^}]*transition:\s*transform\s+0\.32s\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/s);
  assert.match(css, /#settings-modal:not\(\.visible\)\s*>\s*div[^{]*\{[^}]*transform:\s*translateY\(100%\)\s*!important;/s);
  assert.match(css, /#settings-modal\.visible\s*>\s*div[^{]*\{[^}]*transform:\s*translateY\(0\)\s*!important;/s);
});

test('folder color rendering supports saved css color values without falling back', () => {
  const runtime01 = readUiSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const runtime02 = readUiSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const runtime00 = readUiSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const css = readUiSource('src/styles/main.css');

  assert.match(runtime00, /resolveFolderColor/);
  assert.match(runtime01, /resolveFolderColor\(folder\.color,\s*FOLDER_COLORS,\s*FOLDER_COLORS\.gray\)/);
  assert.match(runtime01, /--folder-icon-color:\s*\$\{iconColor\}/);
  assert.match(runtime02, /normalizeFolderColorSelection\(selectedColor,\s*FOLDER_COLORS\)/);
  assert.match(css, /\.folder-icon\s*\{[^}]*color:\s*var\(--folder-icon-color,\s*inherit\)\s*!important;/s);
});
