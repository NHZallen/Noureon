import assert from 'node:assert/strict';
import test from 'node:test';

import { readUiSource } from '../helpers/source-guards.js';

test('conversation search keeps mobile controls above the keyboard and aligns desktop actions', () => {
  const css = readUiSource('src/styles/conversation-search.css');
  const html = readUiSource('index.html');

  assert.match(html, /viewport-fit=cover,\s*interactive-widget=resizes-content/);
  assert.match(css, /\.conversation-search-header\s*\{[^}]*top:\s*1\.275rem;[^}]*right:\s*1rem;[^}]*padding:\s*0;/s);
  assert.match(css, /grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto;[\s\S]*grid-template-areas:\s*"input input voice"\s*"modes hint hint"/s);
  assert.match(css, /#search-modal > div\s*\{[^}]*top:\s*var\(--search-viewport-offset-top,\s*0px\);[^}]*grid-template-areas:\s*"results results"\s*"toolbar close";[^}]*height:\s*var\(--search-visible-height,\s*100dvh\)\s*!important;[^}]*transform:\s*none;/s);
  assert.match(css, /#close-search-modal-btn\s*\{[^}]*position:\s*static;[^}]*grid-area:\s*close;[^}]*align-self:\s*end;[^}]*background:\s*#ffffff;/s);
  assert.match(css, /\.conversation-search-toolbar\s*\{[^}]*position:\s*static;[^}]*grid-area:\s*toolbar;[^}]*align-self:\s*end;[^}]*transform:\s*none;/s);
  assert.match(css, /grid-template-areas:\s*"hint"\s*"modes"\s*"input"/s);
  assert.match(css, /\.conversation-search-enter-hint\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/s);
  assert.match(css, /\.conversation-search-enter-hint\.is-visible\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/s);
  assert.match(css, /\.conversation-search-mode-control button:focus,[\s\S]*outline:\s*none;/s);
  assert.doesNotMatch(css, /\.conversation-search-mode-control button:focus[^{]*\{[^}]*yellow/s);
  assert.match(css, /#modal-search-input::\-webkit-search-cancel-button\s*\{[^}]*\-webkit-appearance:\s*none;[^}]*#6b7280/s);
  assert.doesNotMatch(css, /#modal-search-input::\-webkit-search-cancel-button\s*\{[^}]*var\(--button-primary-bg/s);
  assert.match(css, /#modal-search-input\s*\{[^}]*height:\s*2\.9rem;[^}]*padding:\s*0 0\.9rem 0 2\.75rem;[^}]*line-height:\s*2\.9rem;/s);
  assert.match(css, /#modal-search-input\s*\{[^}]*height:\s*3rem;[^}]*padding:\s*0 0\.85rem 0 2\.7rem;[^}]*line-height:\s*3rem;/s);
  assert.match(css, /#search-results-container\s*\{[^}]*grid-area:\s*results;[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.doesNotMatch(css, /height:\s*max\(10rem,\s*calc\(var\(--search-visible-height/);
  assert.match(css, /\.conversation-search-mobile-empty\s*\{[^}]*height:\s*100%;[^}]*transform:\s*translateY\(-1rem\);/s);
  assert.match(css, /\.conversation-search-mobile-empty svg\s*\{[^}]*width:\s*2\.1rem;[^}]*height:\s*2\.1rem;/s);
  assert.match(css, /\.conversation-search-mobile-empty p\s*\{[^}]*font-size:\s*1rem;/s);
});
