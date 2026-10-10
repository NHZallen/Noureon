import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from '../helpers/source-guards.js';

test('media preview download and share icons stay white over dark media', () => {
  const css = readUiSource('src/styles/main.css');
  const mediaPreviewLifecycle = readUiSource('src/app/legacy-runtime/features/media-preview-lifecycle.js');

  assert.match(css, /\.media-lightbox-action,\s*\.media-lightbox-action\s+svg,\s*\.media-lightbox-action\s+svg\s+\*[^{]*\{[^}]*color:\s*var\(--on-color\)\s!important;[^}]*stroke:\s*var\(--on-color\)\s!important;/s);
  assert.match(css, /\.media-lightbox-action\s+svg\s*\{[^}]*fill:\s*none\s!important;/s);
  assert.match(css, /\.media-lightbox-action\s+svg\s+\[fill\]:not\(\[fill="none"\]\)[^{]*\{[^}]*fill:\s*var\(--on-color\)\s!important;/s);
  assert.match(css, /\.media-lightbox-close\s*\{[^}]*top:\s*1\.15rem;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*background:\s*var\(--media-control-bg\);/s);
  assert.match(css, /\.media-lightbox-close\s+svg\s*\{[^}]*display:\s*block;[^}]*width:\s*1\.5rem;[^}]*height:\s*1\.5rem;/s);
  assert.match(css, /\.media-lightbox-close\s*\{[^}]*color:\s*var\(--on-color\);/s);
  assert.match(css, /\.media-lightbox-close\s+svg\s*\{[^}]*stroke:\s*var\(--on-color\);/s);
  assert.match(mediaPreviewLifecycle, /class="media-lightbox-close"[^>]*><svg[^>]*stroke="currentColor"/);
  assert.match(css, /\.message-media-play\s+svg\s+path\s*\{[^}]*fill:\s*var\(--on-color\);/s);
  assert.match(css, /\.message-media-thumb\.message-media-video\s*\{[^}]*background:\s*var\(--media-bg\);/s);
  assert.match(mediaPreviewLifecycle, /class="media-lightbox-close"[^>]*><svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(mediaPreviewLifecycle, /media-lightbox-close[^\n]*&times;/);
  assert.match(css, /\.media-lightbox-toolbar\s*\{[\s\S]*top:\s*1\.15rem;/s);
});

test('the model picker is one panel with a bounded, quietly scrolling list and a stepped thinking slider', () => {
  const css = readUiSource('src/styles/model-picker.css');
  const lifecycle = readUiSource('src/app/legacy-runtime/features/council-controls-lifecycle.js');
  const markup = readUiSource('src/app/ui/model-picker/model-picker-markup.js');

  // One panel: the way to answer, the model list or the council, and the thinking slider.
  assert.match(markup, /data-mp-tab="single"[\s\S]*data-mp-tab="council"/);
  assert.match(markup, /class="mp-scroll" data-mp-scroll/);
  assert.match(markup, /type="range" class="mp-slider" data-mp-depth-input/);
  assert.match(markup, /data-mp-remove=[\s\S]*data-mp-open="members"/);
  assert.match(markup, /data-mp-open="combiner"/);
  assert.match(markup, /data-mp-mode=/);
  assert.match(lifecycle, /const\s+applySearch\s*=\s*\(container\)\s*=>[\s\S]*group\.hidden\s*=\s*!any/);
  assert.doesNotMatch(lifecycle, /council-filter-panel|data-council-filter|applyCouncilSearchFilter/);

  // Bounded: the list scrolls inside the panel, and the panel never outgrows the screen.
  assert.match(css, /\.mp-panel\s*\{[^}]*max-height:\s*min\(40rem,\s*calc\(100vh - 8rem\)\);[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.mp-scroll\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s);
  // Quiet: a thin thumb that only shows while the pointer is over the list.
  assert.match(css, /\.mp-scroll\s*\{\s*scrollbar-color:\s*transparent transparent;/);
  assert.match(css, /\.mp-scroll:hover\s*\{\s*scrollbar-color:\s*color-mix/);
  // Flat and black and white: the tints follow the text colour.
  assert.doesNotMatch(css, /!important/);
  assert.match(css, /\.mp-mode\.is-active\s*\{[^}]*border-color:\s*var\(--text-primary\)/s);
  assert.match(css, /\.mp-slider::-webkit-slider-thumb/);
  assert.match(css, /\.mp-slider::-moz-range-thumb/);
  // The thumb fills the track's height inside a frame, ringed with the accent, and the fill is hidden at the first dot.
  assert.match(css, /--mp-thumb:\s*2\.15rem;/);
  assert.match(css, /\.mp-slider-track\s*\{[^}]*inset:\s*var\(--mp-inset\);/s);
  assert.match(css, /\.mp-slider-fill\s*\{[^}]*opacity:\s*clamp\(0,/s);
  // A phone gets the panel where the design picker opens: the same width and bottom edge, just above the composer box (the '+' menu too).
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*\.mp-panel:not\(\.mp-depth-panel\)\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*calc\(100% \+ 0\.75rem\);[^}]*width:\s*var\(--mp-phone-width\);[^}]*height:\s*var\(--mp-phone-height,\s*min\(70vh,\s*34rem\)\);[^}]*max-height:\s*var\(--mp-phone-height,\s*min\(70vh,\s*34rem\)\);/);
  // The thinking control is small: its own button and a narrow panel, not part of the model list.
  assert.match(css, /\.mp-panel\.mp-depth-panel\s*\{[^}]*width:\s*min\(14\.5rem,/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('closing popovers from outside also collapses the model and thinking buttons', () => {
  const source = readUiSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');

  assert.match(source, /function closeAllPopovers\(\)\s*\{[\s\S]*#model-council-control \.mp-trigger\[aria-expanded="true"\][\s\S]*setAttribute\('aria-expanded',\s*'false'\)/);
});

test('on a phone the "+" menu, the design panel and the model panel all end just above the composer box', async () => {
  const { readFileSync } = await import('node:fs');
  const layout = readFileSync(new URL('../../src/styles/mobile-composer-layout.css', import.meta.url), 'utf8');
  // The two controls that hold the first two have no position of their own, so the box (.input-wrapper, positioned) is what they hang from.
  assert.match(layout, /@media \(max-width: 768px\) \{[\s\S]*#file-input-container,\s*#deck-design-control \{\s*position: static;\s*\}/);
  assert.match(layout, /#file-options-popover:not\(\.message-edit-shared-popover\) \{[^}]*left: 0\.2rem;[^}]*margin-bottom: 0\.75rem;/);
  // The model panel hangs from the same edge with the same distance.
  const picker = readFileSync(new URL('../../src/styles/model-picker.css', import.meta.url), 'utf8');
  assert.match(picker, /\.mp-panel:not\(\.mp-depth-panel\) \{[^}]*bottom: calc\(100% \+ 0\.75rem\)/);
});
