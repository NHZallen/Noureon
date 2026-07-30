import assert from 'node:assert/strict';
import test from 'node:test';

import { readUiSource } from '../helpers/source-guards.js';

test('conversation search keeps mobile controls above the keyboard and aligns desktop actions', () => {
  const css = readUiSource('src/styles/conversation-search.css');

  assert.match(css, /\.conversation-search-header\s*\{[^}]*top:\s*1\.275rem;[^}]*right:\s*1rem;[^}]*padding:\s*0;/s);
  assert.match(css, /#close-search-modal-btn\s*\{[^}]*bottom:\s*calc\(var\(--search-keyboard-inset,\s*0px\)\s*\+\s*max\(1\.25rem,\s*env\(safe-area-inset-bottom\)\)\);[\s\S]*background:\s*#ffffff;/s);
  assert.match(css, /\.conversation-search-toolbar\s*\{[^}]*bottom:\s*calc\(var\(--search-keyboard-inset,\s*0px\)\s*\+\s*max\(1\.25rem,\s*env\(safe-area-inset-bottom\)\)\);/s);
  assert.match(css, /grid-template-areas:\s*"hint"\s*"modes"\s*"input"/s);
  assert.match(css, /\.conversation-search-enter-hint\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/s);
  assert.match(css, /\.conversation-search-enter-hint\.is-visible\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/s);
  assert.match(css, /\.conversation-search-mode-control button:focus,[\s\S]*outline:\s*none;/s);
  assert.doesNotMatch(css, /\.conversation-search-mode-control button:focus[^{]*\{[^}]*yellow/s);
  assert.match(css, /#modal-search-input::\-webkit-search-cancel-button\s*\{[^}]*\-webkit-appearance:\s*none;[^}]*#6b7280/s);
  assert.doesNotMatch(css, /#modal-search-input::\-webkit-search-cancel-button\s*\{[^}]*var\(--button-primary-bg/s);
  assert.match(css, /#modal-search-input\s*\{[^}]*height:\s*2\.9rem;[^}]*padding:\s*0 0\.9rem 0 2\.75rem;[^}]*line-height:\s*2\.9rem;/s);
  assert.match(css, /#modal-search-input\s*\{[^}]*height:\s*3rem;[^}]*padding:\s*0 0\.85rem 0 2\.7rem;[^}]*line-height:\s*3rem;/s);
});
