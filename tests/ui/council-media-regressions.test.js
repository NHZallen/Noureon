import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from '../helpers/source-guards.js';

test('media preview download and share icons stay white over dark media', () => {
  const css = readUiSource('src/styles/main.css');

  assert.match(css, /\.media-lightbox-action,\s*\.media-lightbox-action\s+svg,\s*\.media-lightbox-action\s+svg\s+\*[^{]*\{[^}]*color:\s*#ffffff\s!important;[^}]*stroke:\s*#ffffff\s!important;/s);
  assert.match(css, /\.media-lightbox-action\s+svg\s*\{[^}]*fill:\s*none\s!important;/s);
  assert.match(css, /\.media-lightbox-action\s+svg\s+\[fill\]:not\(\[fill="none"\]\)[^{]*\{[^}]*fill:\s*#ffffff\s!important;/s);
  assert.match(css, /\.media-lightbox-close\s*\{[\s\S]*top:\s*1\.15rem;[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/s);
  assert.match(css, /\.media-lightbox-toolbar\s*\{[\s\S]*top:\s*1\.15rem;/s);
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
  assert.match(css, /\.model-council-popover[^{]*\{[^}]*overflow:\s*hidden\s!important;/s);
  assert.match(css, /\.council-config-row[^{]*\{[^}]*justify-content:\s*flex-start\s!important;/s);
  assert.match(css, /\.council-action-cluster[^{]*\{[^}]*flex:\s*1\s+1\s+auto\s!important;[^}]*margin-left:\s*0\s!important;/s);
  assert.match(css, /\.council-model-search-field[^{]*\{[^}]*flex:\s*1\s+1\s+auto\s!important;[^}]*width:\s*auto\s!important;/s);
  assert.match(css, /\.council-popover-scroll-area[^{]*\{[^}]*overflow-y:\s*auto\s!important;[^}]*-webkit-overflow-scrolling:\s*touch\s!important;[^}]*scrollbar-color:\s*var\(--gpt-scrollbar\)\s+transparent\s!important;/s);
  assert.match(css, /\.council-popover-scroll-area::-webkit-scrollbar-thumb[^{]*\{[^}]*background:\s*var\(--gpt-scrollbar\)\s!important;/s);
  assert.match(css, /\.model-council-popover[^{]*\{[^}]*opacity:\s*0\s!important;[^}]*transition:\s*opacity\s+0\.22s\s+ease[^}]*transform\s+0\.22s/s);
  assert.match(css, /\.model-council-popover\.visible[^{]*\{[^}]*opacity:\s*1\s!important;[^}]*visibility:\s*visible\s!important;/s);
  assert.match(css, /\.council-enable-pill\.is-active[^{]*\{[^}]*background:\s*#ffffff\s!important;[^}]*color:\s*var\(--button-primary-bg\)\s!important;/s);
  assert.match(css, /\.council-search-toggle\.is-active[^{]*\{[^}]*background:\s*#ffffff\s!important;[^}]*color:\s*var\(--button-primary-bg\)\s!important;/s);
  assert.match(css, /\.model-council-popover\s+\.council-mode-tabs button:not\(\.active\)[^{]*\{[^}]*border-color:\s*transparent\s!important;[^}]*background:\s*transparent\s!important;/s);
  assert.match(css, /\.council-mode-tabs[^{]*\{[^}]*height:\s*2\.15rem;[^}]*border:\s*0;[^}]*background:\s*#ffffff;[^}]*box-shadow:\s*none;/s);
  assert.match(css, /\.council-mode-tabs button\.active[^{]*\{[^}]*border-color:\s*transparent\s!important;[^}]*background:\s*transparent\s!important;[^}]*color:\s*var\(--button-primary-bg\)\s!important;[^}]*box-shadow:\s*none;/s);
  assert.match(css, /\.council-section-title[^{]*\{[^}]*position:\s*sticky\s!important;[^}]*top:\s*0\s!important;[^}]*text-transform:\s*none\s!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[^{]*\{[\s\S]*\.council-config-row[^{]*\{[^}]*flex-direction:\s*column\s!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[^{]*\{[\s\S]*\.council-action-cluster[^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s!important;/s);
});
