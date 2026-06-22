import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('outlined settings and trash actions use the shared white outline button style', () => {
  const shell03 = readSource('src/templates/fragments/03-shell.fragment.js');
  const shell04 = readSource('src/templates/fragments/04-shell.fragment.js');
  const runtime04 = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');

  for (const id of ['upload-wallpaper-btn', 'restore-wallpaper-btn', 'export-data-btn', 'import-data-btn', 'open-archived-modal-btn']) {
    assert.match(shell03, new RegExp(`id=\\\\"${id}\\\\"[^"]*class=\\\\"[^"]*btn-outline-white`));
  }

  for (const id of ['trash-batch-select-btn', 'empty-trash-btn']) {
    assert.match(shell04, new RegExp(`id=\\\\"${id}\\\\"[^"]*class=\\\\"[^"]*btn-outline-white`));
  }

  for (const className of ['trash-item-view-btn', 'trash-item-restore-btn', 'trash-item-delete-btn']) {
    assert.match(runtime04, new RegExp(`${className}[^\\n]+btn-outline-white`));
  }
});

test('active input modes use the theme color without black outline chrome', () => {
  const css = readSource('src/styles/main.css');
  const runtime01 = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const runtime05 = readSource('src/app/legacy-runtime/fragments/05-runtime.fragment.js');

  assert.match(css, /#attachment-menu\s+\.menu-item\.is-active/);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item[^{]*\{[^}]*border:\s*0\s*!important;[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.doesNotMatch(css, /#input-indicator-container\s+\.input-indicator-item[^{]*\{[^}]*border:\s*1px\s+solid\s+#000000\s*!important;/s);
  assert.doesNotMatch(css, /#attachment-menu\s+\.menu-item\.is-active[^{]*\{[^}]*color:\s*#111827\s*!important;/s);
  assert.match(css, /#attachment-menu\s+\.menu-item\.is-active,\s*#file-options-popover\s+#web-search-popover-btn\.is-active,\s*#file-options-popover\s+#learning-mode-btn\.is-active,\s*#file-options-popover\s+#model-council-menu-btn\.is-active[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.match(runtime01, /councilMenuButton\.classList\.toggle\('is-active',\s*councilActive\)/);
  assert.match(runtime05, /item\.id === 'model-council-menu-btn' && councilActive/);
});

test('desktop chat input reserves the lower row only for active modes or multiline text', () => {
  const css = readSource('src/styles/main.css');
  const runtime06 = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');

  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*display:\s*grid\s*!important;[^}]*grid-template-areas:\s*"file input input voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-indicators,\s*#input-bar-container\s+\.input-wrapper\.has-multiline-input[^{]*\{[^}]*grid-template-areas:\s*"input input input input input"\s*"file indicators spacer voice submit"/s);
  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-indicator-container[^{]*\{[^}]*grid-area:\s*indicators;[^}]*position:\s*static\s*!important;/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*transition:[^}]*min-height\s+0\.24s[^}]*padding\s+0\.24s/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.flex\.items-end[^{]*\{[^}]*transition:[^}]*transform\s+0\.24s/s);
  assert.match(runtime06, /const\s+wasMultilineLayout\s*=\s*wrapper\?\.classList\.contains\('has-multiline-input'\)\s*\|\|\s*false/);
  assert.match(runtime06, /const\s+firstLineWouldWrap\s*=\s*hasInputText\s*&&\s*isDesktopInput\s*&&\s*!wasMultilineLayout/);
  assert.match(runtime06, /measurementContext\.measureText\(line\)\.width/);
  assert.match(runtime06, /const\s+useMultilineLayout\s*=\s*isDesktopInput\s*&&\s*hasInputText\s*&&\s*\(\s*wasMultilineLayout/s);
  assert.match(runtime06, /if\s*\(wrapper\s*&&\s*isDesktopInput\)\s*\{[\s\S]*wrapper\.classList\.toggle\('has-multiline-input',\s*useMultilineLayout\)/);
});

test('desktop active mode and Astras pills swap their leading icon to the themed close icon on hover', () => {
  const css = readSource('src/styles/main.css');
  const runtime01 = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');

  assert.match(runtime01, /id: 'astras-input-indicator'[\s\S]*input-indicator-leading[\s\S]*input-indicator-mode-icon[\s\S]*close-astras-btn-input/);
  assert.match(css, /#astras-input-indicator[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item\s+svg,\s*#input-indicator-container\s+\.input-indicator-item\s+svg\s+\*[^{]*\{[^}]*color:\s*inherit\s*!important;[^}]*stroke:\s*currentColor\s*!important;/s);
  assert.match(css, /#astras-input-indicator\s+svg[\s\S]*#astras-input-indicator\s+svg\s+\*[^{]*\{[^}]*color:\s*inherit\s*!important;[^}]*stroke:\s*currentColor\s*!important;/s);
  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-indicator-container\s+#close-search-btn-input,\s*#input-indicator-container\s+#close-learning-mode-btn-input,\s*#input-indicator-container\s+#close-model-council-btn-input,\s*#input-indicator-container\s+#close-astras-btn-input[^{]*\{[^}]*position:\s*absolute\s*!important;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item:hover\s+\.input-indicator-mode-icon[^{]*\{[^}]*opacity:\s*0\s*!important;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item:hover\s+#close-search-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-learning-mode-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-model-council-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-astras-btn-input[^{]*\{[^}]*opacity:\s*1\s*!important;/s);
});

test('mobile keeps the existing stacked indicator layout and hides message mic', () => {
  const css = readSource('src/styles/main.css');

  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#voice-input-btn-message[^{]*\{[^}]*display:\s*none\s*!important;/s);
});

test('mobile web search typing does not disable the message input when Tavily is missing', () => {
  const runtime02 = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const runtime06 = readSource('src/app/legacy-runtime/fragments/06-runtime.fragment.js');

  assert.match(runtime02, /const\s+hasModelApiKey\s*=\s*isCouncilEnabled\(conv\)[\s\S]*!!getApiKeyForProvider\(provider\)/);
  assert.match(runtime02, /const\s+hasApiKey\s*=\s*hasModelApiKey\s*&&\s*canSubmitWithSearch/);
  assert.match(runtime02, /ALL_ELEMENTS\.messageInput\.disabled\s*=\s*!hasModelApiKey/);
  assert.match(runtime06, /else\s+if\s*\(wrapper\)\s*\{[\s\S]*wrapper\.classList\.remove\('has-multiline-input'\)/);
});

test('model council manager uses compact pills and a bounded scroll area', () => {
  const css = readSource('src/styles/main.css');
  const runtime01 = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');

  assert.match(runtime01, /class="council-mode-cluster"[\s\S]*id="model-council-enabled"[\s\S]*class="council-mode-tabs"/);
  assert.match(runtime01, /id="model-council-search-toggle"[\s\S]*\$\{escapeHTML\(searchLabel\)\}/);
  assert.match(runtime01, /conv\.isWebSearchEnabled\s*=\s*!conv\.isWebSearchEnabled/);
  assert.doesNotMatch(runtime01, /council-filter-panel|data-council-filter|filtersHTML|applyCouncilSearchFilter/);
  assert.doesNotMatch(runtime01, /<p class="council-search-note[^`]*runtimeTexts\.searchManualNotice/);
  assert.match(css, /\.model-council-popover[^{]*\{[^}]*overflow:\s*hidden\s*!important;/s);
  assert.match(css, /\.council-popover-scroll-area[^{]*\{[^}]*overflow-y:\s*auto\s*!important;[^}]*scrollbar-color:\s*var\(--gpt-scrollbar\)\s+transparent\s*!important;/s);
  assert.match(css, /\.council-popover-scroll-area::-webkit-scrollbar-thumb[^{]*\{[^}]*background:\s*var\(--gpt-scrollbar\)\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[^{]*\{[\s\S]*\.council-config-row[^{]*\{[^}]*flex-direction:\s*column\s*!important;/s);
});

test('settings navigation starts below the modal header divider on desktop', () => {
  const css = readSource('src/styles/main.css');

  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*margin-top:\s*4\.5rem(?:\s*!important)?;/s);
  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*height:\s*calc\(100%\s*-\s*4\.5rem\)(?:\s*!important)?;/s);
});

test('folder color rendering supports saved css color values without falling back', () => {
  const runtime01 = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const runtime02 = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const runtime00 = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const css = readSource('src/styles/main.css');

  assert.match(runtime00, /resolveFolderColor/);
  assert.match(runtime01, /resolveFolderColor\(folder\.color,\s*FOLDER_COLORS,\s*FOLDER_COLORS\.gray\)/);
  assert.match(runtime01, /--folder-icon-color:\s*\$\{iconColor\}/);
  assert.match(runtime02, /normalizeFolderColorSelection\(selectedColor,\s*FOLDER_COLORS\)/);
  assert.match(css, /\.folder-icon\s*\{[^}]*color:\s*var\(--folder-icon-color,\s*inherit\)\s*!important;/s);
});
