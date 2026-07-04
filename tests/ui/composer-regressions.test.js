import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from '../helpers/source-guards.js';

test('active input modes use the theme color without black outline chrome', () => {
  const css = readUiSource('src/styles/main.css');
  const runtime01 = readUiSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');

  assert.match(css, /#attachment-menu\s+\.menu-item\.is-active/);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item[^{]*\{[^}]*border:\s*0(?:\s*!important)?;[^}]*color:\s*var\(--button-primary-bg\)(?:\s*!important)?;/s);
  assert.doesNotMatch(css, /#input-indicator-container\s+\.input-indicator-item[^{]*\{[^}]*border:\s*1px\s+solid\s+#000000\s!important;/s);
  assert.doesNotMatch(css, /#attachment-menu\s+\.menu-item\.is-active[^{]*\{[^}]*color:\s*#111827\s!important;/s);
  assert.match(css, /#attachment-menu\s+\.menu-item\.is-active,\s*#file-options-popover\s+#web-search-popover-btn\.is-active,\s*#file-options-popover\s+#learning-mode-btn\.is-active,\s*#file-options-popover\s+#model-council-menu-btn\.is-active[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)(?:\s!important)?;/s);
  assert.match(runtime01, /councilMenuButton\.classList\.toggle\('is-active',\s*councilActive\)/);
});

test('desktop chat input reserves the lower row only for active modes or multiline text', () => {
  const css = readUiSource('src/styles/main.css');
  const startupLifecycle = readUiSource('src/app/runtime/features/startup-lifecycle.js');

  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*display:\s*grid\s*!important;[^}]*grid-template-areas:\s*"file input input reasoning voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-indicators,\s*#input-bar-container\s+\.input-wrapper\.has-multiline-input[^{]*\{[^}]*grid-template-areas:\s*"input input input input input input"\s*"file indicators spacer reasoning voice submit"/s);
  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-indicator-container[^{]*\{[^}]*grid-area:\s*indicators;[^}]*position:\s*static\s!important;/s);
  assert.match(css, /#reasoning-depth-control[^{]*\{[^}]*grid-area:\s*reasoning;/s);
  assert.match(css, /\.reasoning-depth-popover[^{]*\{/);
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
  const inputMediaPlacement = readUiSource('src/app/runtime/features/input-media-placement.js');
  const previewLifecycle = readUiSource('src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js');

  assert.match(inputMediaPlacement, /inputMediaPreview\.className\s*=\s*'input-media-preview empty:hidden';[\s\S]*wrapper\.insertBefore\(inputMediaPreview,\s*wrapper\.firstChild\)/);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-file-previews[^{]*\{[^}]*grid-template-areas:\s*"preview preview preview preview preview preview"\s*"file input input reasoning voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-file-previews\.has-indicators,\s*#input-bar-container\s+\.input-wrapper\.has-file-previews\.has-multiline-input[^{]*\{[^}]*grid-template-areas:\s*"preview preview preview preview preview preview"\s*"input input input input input input"\s*"file indicators spacer reasoning voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.input-media-preview[^{]*\{[^}]*grid-area:\s*preview;[^}]*align-self:\s*stretch;[^}]*width:\s*100%;/s);
  assert.doesNotMatch(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.input-media-preview[^{]*\{[^}]*position:\s*absolute/s);
  assert.match(previewLifecycle, /removeButton\.innerHTML\s*=\s*'&times;';[\s\S]*event\.stopPropagation\(\);[\s\S]*removeFile\(file\.id\)/);
});

test('desktop active mode and Astras pills swap their leading icon to the themed close icon on hover', () => {
  const css = readUiSource('src/styles/main.css');
  const runtime01 = readUiSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');

  assert.match(runtime01, /id: 'astras-input-indicator'[\s\S]*input-indicator-leading[\s\S]*input-indicator-mode-icon[\s\S]*close-astras-btn-input/);
  assert.match(css, /#astras-input-indicator[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)(?:\s!important)?;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item\s+svg,\s*#input-indicator-container\s+\.input-indicator-item\s+svg\s+\*[^{]*\{[^}]*color:\s*inherit(?:\s!important)?;[^}]*stroke:\s*currentColor(?:\s!important)?;/s);
  assert.match(css, /#astras-input-indicator\s+svg[\s\S]*#astras-input-indicator\s+svg\s+\*[^{]*\{[^}]*color:\s*inherit(?:\s!important)?;[^}]*stroke:\s*currentColor(?:\s!important)?;/s);
  assert.match(css, /#input-indicator-container\s+#search-indicator\s+\.input-indicator-mode-icon,\s*#input-indicator-container\s+#learning-mode-indicator\s+\.input-indicator-mode-icon,\s*#input-indicator-container\s+#model-council-indicator\s+\.input-indicator-mode-icon[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)\s*!important;[^}]*stroke:\s*currentColor\s*!important;/s);
  assert.match(css, /#input-indicator-container\s+#close-search-btn-input,\s*#input-indicator-container\s+#close-learning-mode-btn-input,\s*#input-indicator-container\s+#close-model-council-btn-input,\s*#input-indicator-container\s+#close-astras-btn-input[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.doesNotMatch(css, /body\s+svg[^{]*\{[^}]*color:\s*#000000\s*!important;/s);
  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-indicator-container\s+#close-search-btn-input,\s*#input-indicator-container\s+#close-learning-mode-btn-input,\s*#input-indicator-container\s+#close-model-council-btn-input,\s*#input-indicator-container\s+#close-astras-btn-input[^{]*\{[^}]*position:\s*absolute\s!important;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item:hover\s+\.input-indicator-mode-icon[^{]*\{[^}]*opacity:\s*0\s!important;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item:hover\s+#close-search-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-learning-mode-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-model-council-btn-input,\s*#input-indicator-container\s+\.input-indicator-item:hover\s+#close-astras-btn-input[^{]*\{[^}]*opacity:\s*1\s!important;/s);
});

test('mobile keeps the existing stacked indicator layout and hides message mic', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#voice-input-btn-message[^{]*\{[^}]*display:\s*none\s!important;/s);
});

test('mobile web search typing does not disable the message input when Tavily is missing', () => {
  const updateInputStateHelper = readUiSource('src/app/runtime/legacy-core/settings-update-input-state-helper.js');
  const startupLifecycle = readUiSource('src/app/runtime/features/startup-lifecycle.js');

  assert.match(updateInputStateHelper, /const\s+hasModelApiKey\s*=\s*isCouncilEnabled\(conv\)[\s\S]*!!getApiKeyForProvider\(provider\)/);
  assert.match(updateInputStateHelper, /const\s+hasApiKey\s*=\s*hasModelApiKey\s*&&\s*canSubmitWithSearch/);
  assert.match(updateInputStateHelper, /elements\.messageInput\.disabled\s*=\s*!hasModelApiKey/);
  assert.match(startupLifecycle, /else\s+if\s*\(wrapper\)\s*\{[\s\S]*wrapper\.classList\.remove\('has-multiline-input'\)/);
});
