import assert from 'node:assert/strict';
import test from 'node:test';
import appShell from '../../src/templates/app-shell.js';
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

test('desktop chat input keeps active modes inside the rich editor at any caret position', () => {
  const css = readUiSource('src/styles/main.css');
  const startupLifecycle = readUiSource('src/app/runtime/features/startup-lifecycle.js');
  const richEditor = readUiSource('src/app/runtime/features/composer-rich-editor.js');

  assert.match(appShell, /id="message-input"[^>]*role="textbox"[^>]*contenteditable="false"[^>]*data-composer-editor/);
  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*display:\s*grid\s*!important;[^}]*grid-template-areas:\s*"file input input reasoning voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper,\s*#input-bar-container\s+\.input-wrapper:focus-within[^{]*\{[^}]*border:\s*1px solid transparent\s*!important;[^}]*border-radius:\s*9999px\s*!important;[^}]*box-shadow:[^}]*!important;/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-indicators:not\(\.has-multiline-input\)[^{]*\{[^}]*grid-template-areas:\s*"file input input reasoning voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-multiline-input[^{]*\{[^}]*grid-template-areas:\s*"input input input input input input"\s*"file \. \. reasoning voice submit"/s);
  assert.match(css, /@media\s*\(min-width:\s*769px\)[^{]*\{[\s\S]*#input-indicator-container[^{]*\{[^}]*display:\s*none\s!important;/s);
  assert.match(css, /#message-input\s+\.composer-inline-mode-token[^{]*\{[^}]*display:\s*inline-flex;[^}]*user-select:\s*text;/s);
  assert.match(css, /#message-input\s+\.composer-inline-mode-token:hover[^{]*\{[^}]*background:\s*transparent;/s);
  assert.match(richEditor, /function\s+getInsertionRange[\s\S]*editor\.__composerSavedRange[\s\S]*range\.selectNodeContents\(editor\)/s);
  assert.match(richEditor, /range\.insertNode\(separator\);\s*range\.insertNode\(token\)/s);
  assert.match(css, /#reasoning-depth-control[^{]*\{[^}]*grid-area:\s*reasoning;/s);
  assert.match(css, /\.reasoning-depth-popover[^{]*\{/);
  assert.match(css, /\.reasoning-depth-btn[^{]*\{[^}]*border-radius:\s*0\.35rem;[^}]*background:\s*transparent;/s);
  assert.match(css, /\.reasoning-depth-btn\.is-adjustable:hover,\s*\.reasoning-depth-btn\[aria-expanded="true"\][^{]*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--text-secondary\);/s);
  assert.doesNotMatch(css, /\.reasoning-depth-btn\.is-adjustable:hover,\s*\.reasoning-depth-btn\[aria-expanded="true"\][^{]*\{[^}]*button-primary-bg/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*transition:[^}]*min-height\s+0\.24s[^}]*padding\s+0\.24s/s);
  assert.doesNotMatch(css, /#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*transition:[^}]*border-radius/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.flex\.items-end[^{]*\{[^}]*transition:[^}]*transform\s+0\.24s/s);
  assert.match(startupLifecycle, /const\s+wasMultilineLayout\s*=\s*wrapper\?\.classList\.contains\('has-multiline-input'\)\s*\|\|\s*false/);
  assert.match(startupLifecycle, /const\s+firstLineWouldWrap\s*=\s*hasInputText\s*&&\s*isDesktopInput\s*&&\s*!wasMultilineLayout/);
  assert.match(startupLifecycle, /measurementContext\.measureText\(line\)\.width/);
  assert.match(startupLifecycle, /const\s+useMultilineLayout\s*=\s*isDesktopInput\s*&&\s*hasInputText\s*&&\s*\(\s*wasMultilineLayout/s);
  assert.match(startupLifecycle, /if\s*\(wrapper\s*&&\s*isDesktopInput\)\s*\{[\s\S]*wrapper\.classList\.toggle\('has-multiline-input',\s*useMultilineLayout\)/);
});

test('multiline composer grows to ten lines and exposes a bounded expand control', () => {
  const css = readUiSource('src/styles/main.css');
  const startupLifecycle = readUiSource('src/app/runtime/features/startup-lifecycle.js');
  const appBootstrapLifecycle = readUiSource('src/app/runtime/features/app-bootstrap-lifecycle.js');

  assert.match(appShell, /id="expand-input-btn"[^>]*class="composer-expand-btn hidden"[^>]*aria-expanded="false"/);
  assert.match(css, /#message-input[^{]*\{[^}]*max-height:\s*calc\(1\.5rem \* 10 \+ 1rem\)/s);
  assert.match(css, /#expand-input-btn\.composer-expand-btn[^{]*\{[^}]*position:\s*absolute;[^}]*top:\s*0\.35rem;[^}]*right:\s*0\.15rem;/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-multiline-input,[\s\S]*#input-bar-container\s+\.input-wrapper\.has-file-previews:focus-within,[\s\S]*#input-bar-container\s+\.input-wrapper\.has-quote-inquiry:focus-within[^{]*\{[^}]*border-radius:\s*1\.75rem\s*!important;/s);
  assert.match(startupLifecycle, /const\s+collapsedMaxHeight\s*=\s*\(lineHeight \* 10\)[\s\S]*classList\.toggle\('has-overflowing-input',\s*canExpand\)[\s\S]*Math\.floor\(viewportHeight \* 0\.56\)/s);
  assert.match(appBootstrapLifecycle, /ALL_ELEMENTS\.expandInputButton\?\.addEventListener\('click',[\s\S]*classList\.toggle\('is-composer-expanded'\)[\s\S]*adjustTextareaHeight\(\)/s);
});

test('composer upload previews occupy a full-width row above desktop input controls', () => {
  const css = readUiSource('src/styles/main.css');
  const inputMediaPlacement = readUiSource('src/app/runtime/features/input-media-placement.js');
  const previewLifecycle = readUiSource('src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js');

  assert.match(inputMediaPlacement, /inputMediaPreview\.className\s*=\s*'input-media-preview empty:hidden';[\s\S]*wrapper\.insertBefore\(inputMediaPreview,\s*wrapper\.firstChild\)/);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-file-previews[^{]*\{[^}]*grid-template-areas:\s*"preview preview preview preview preview preview"\s*"file input input reasoning voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-file-previews\.has-indicators:not\(\.has-multiline-input\)[^{]*\{[^}]*grid-template-areas:\s*"preview preview preview preview preview preview"\s*"file input input reasoning voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\.has-file-previews\.has-multiline-input[^{]*\{[^}]*grid-template-areas:\s*"preview preview preview preview preview preview"\s*"input input input input input input"\s*"file \. \. reasoning voice submit"/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.input-media-preview[^{]*\{[^}]*grid-area:\s*preview;[^}]*align-self:\s*stretch;[^}]*width:\s*100%;/s);
  assert.doesNotMatch(css, /#input-bar-container\s+\.input-wrapper\s*>\s*\.input-media-preview[^{]*\{[^}]*position:\s*absolute/s);
  assert.match(previewLifecycle, /removeButton\.className\s*=\s*'file-preview-remove';[\s\S]*removeButton\.innerHTML\s*=\s*'<svg[^']*aria-hidden="true"[^']*<\/svg>';[\s\S]*event\.stopPropagation\(\);[\s\S]*removeFile\(file\.id\)/);
  assert.doesNotMatch(previewLifecycle, /removeButton\.innerHTML\s*=\s*'&times;'/);
  assert.match(css, /\.file-preview-remove\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*padding:\s*0;[^}]*line-height:\s*0;/s);
  assert.match(css, /\.file-preview-remove\s+svg\s*\{[^}]*display:\s*block;[^}]*width:\s*0\.8rem;[^}]*height:\s*0\.8rem;/s);
  assert.match(css, /\.file-preview-remove\s*\{[^}]*color:\s*#ffffff;/s);
  assert.match(css, /\.file-preview-remove\s+svg\s*\{[^}]*stroke:\s*#ffffff;/s);
  assert.match(previewLifecycle, /removeButton\.innerHTML\s*=\s*'<svg[^']*stroke="#ffffff"/);
  assert.match(css, /video\[data-video-thumbnail\][^{]*\{[^}]*background:\s*#111827;/s);
  assert.doesNotMatch(css, /video\[data-video-thumbnail\][^{]*\{[^}]*opacity:\s*0;/s);
  assert.match(css, /\.input-media-preview\s+\.file-preview-item\.file-preview-video\s*\{[^}]*background:\s*#111827;/s);
});

test('desktop active modes have no hover close control and remain selectable text', () => {
  const css = readUiSource('src/styles/main.css');
  const runtime01 = readUiSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');

  assert.match(runtime01, /id: 'astras-input-indicator'[\s\S]*input-indicator-leading[\s\S]*input-indicator-mode-icon[\s\S]*close-astras-btn-input/);
  assert.match(css, /#astras-input-indicator[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)(?:\s!important)?;/s);
  assert.match(css, /#input-indicator-container\s+\.input-indicator-item\s+svg,\s*#input-indicator-container\s+\.input-indicator-item\s+svg\s+\*[^{]*\{[^}]*color:\s*inherit(?:\s!important)?;[^}]*stroke:\s*currentColor(?:\s!important)?;/s);
  assert.match(css, /#astras-input-indicator\s+svg[\s\S]*#astras-input-indicator\s+svg\s+\*[^{]*\{[^}]*color:\s*inherit(?:\s!important)?;[^}]*stroke:\s*currentColor(?:\s!important)?;/s);
  assert.match(css, /#input-indicator-container\s+#search-indicator\s+\.input-indicator-mode-icon,\s*#input-indicator-container\s+#learning-mode-indicator\s+\.input-indicator-mode-icon,\s*#input-indicator-container\s+#model-council-indicator\s+\.input-indicator-mode-icon[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)\s*!important;[^}]*stroke:\s*currentColor\s*!important;/s);
  assert.match(css, /#input-indicator-container\s+#close-search-btn-input,\s*#input-indicator-container\s+#close-learning-mode-btn-input,\s*#input-indicator-container\s+#close-model-council-btn-input,\s*#input-indicator-container\s+#close-astras-btn-input[^{]*\{[^}]*color:\s*var\(--button-primary-bg\)\s*!important;/s);
  assert.doesNotMatch(css, /body\s+svg[^{]*\{[^}]*color:\s*#000000\s*!important;/s);
  assert.match(css, /#message-input\s+\.composer-inline-mode-token[^{]*\{[^}]*background:\s*transparent;[^}]*user-select:\s*text;/s);
  assert.match(css, /#message-input\s+\.composer-inline-mode-token:hover[^{]*\{[^}]*background:\s*transparent;/s);
  assert.match(css, /#input-indicator-container[^{]*\{[^}]*display:\s*none\s!important;/s);
});

test('mobile keeps the existing stacked indicator layout and hides message mic', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /@media\s*\(max-width:\s*768px\)[^{]*\{[\s\S]*#voice-input-btn-message[^{]*\{[^}]*display:\s*none\s!important;/s);
});

test('desktop tools menu follows the centered or docked composer without changing mobile rules', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /#chat-workspace\[data-composer-layout="empty"\]\s+#input-bar-container[^{]*\{[^}]*transform:\s*translateY\(var\(--desktop-composer-empty-offset\)\)/s);
  assert.match(css, /--desktop-composer-docked-offset:\s*-1rem/);
  assert.match(css, /#chat-workspace\[data-composer-layout="empty"\]\s+\.chat-greeting-message[^{]*\{[^}]*top:\s*54%;[^}]*translateY\(calc\(-100%\s*-\s*4\.5rem\)\)/s);
  assert.match(css, /#input-bar-container\s*>\s*\.max-w-4xl[^{]*\{[^}]*max-width:\s*48rem/s);
  assert.match(css, /#input-bar-container\s+\.input-wrapper[^{]*\{[^}]*border:\s*1px\s+solid\s+transparent\s*!important;[^}]*border-radius:\s*9999px\s*!important;[^}]*box-shadow:/s);
  assert.match(css, /#file-options-popover:not\(\.message-edit-shared-popover\)[^{]*\{[^}]*width:\s*var\(--desktop-composer-menu-width\)\s*!important;[^}]*bottom:\s*calc\(100%\s*\+\s*1\.75rem\)/s);
  assert.match(css, /#chat-workspace\[data-composer-layout="empty"\]\s+#file-options-popover:not\(\.message-edit-shared-popover\)[^{]*\{[^}]*top:\s*calc\(100%\s*\+\s*1\.75rem\)\s*!important;[^}]*bottom:\s*auto\s*!important/s);
  assert.match(css, /#file-options-popover\s+\.composer-menu-label[^{]*\{[^}]*font-size:\s*0\.84rem/s);
  assert.match(css, /#file-options-popover\s+\.composer-menu-description[^{]*\{[^}]*font-size:\s*0\.76rem/s);
  assert.match(css, /#file-options-popover:not\(\.message-edit-shared-popover\)\s*>\s*button:hover[\s\S]*background:\s*rgba\(107,\s*114,\s*128,\s*0\.12\)\s*!important/s);
  assert.match(css, /#file-options-popover:not\(\.message-edit-shared-popover\)[^{]*\{[^}]*transform:\s*none\s*!important;[^}]*transition:\s*opacity\s+0\.16s\s+ease-out,\s*visibility\s+0\.16s\s*!important/s);
  assert.match(css, /#add-file-btn\s+svg[^{]*\{[^}]*stroke-width:\s*1\.5/s);
  assert.match(css, /#voice-input-btn-message\s+svg[^{]*\{[^}]*stroke-width:\s*1\.6/s);
  assert.match(css, /@media\s*\(min-width:\s*769px\)\s*and\s*\(prefers-reduced-motion:\s*reduce\)/s);
});

test('mobile web search typing does not disable the message input when Tavily is missing', () => {
  const updateInputStateHelper = readUiSource('src/app/runtime/legacy-core/settings-update-input-state-helper.js');
  const startupLifecycle = readUiSource('src/app/runtime/features/startup-lifecycle.js');

  assert.match(updateInputStateHelper, /const\s+hasModelApiKey\s*=\s*isCouncilEnabled\(conv\)[\s\S]*!!getApiKeyForProvider\(provider\)/);
  assert.match(updateInputStateHelper, /const\s+hasApiKey\s*=\s*hasModelApiKey\s*&&\s*canSubmitWithSearch/);
  assert.match(updateInputStateHelper, /elements\.messageInput\.disabled\s*=\s*!hasModelApiKey/);
  assert.match(startupLifecycle, /else\s+if\s*\(wrapper\)\s*\{[\s\S]*wrapper\.classList\.remove\('has-multiline-input'\)/);
});
