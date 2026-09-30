import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from '../helpers/source-guards.js';

test('media preview download and share icons stay white over dark media', () => {
  const css = readUiSource('src/styles/main.css');
  const mediaPreviewLifecycle = readUiSource('src/app/legacy-runtime/features/media-preview-lifecycle.js');

  assert.match(css, /\.media-lightbox-action,\s*\.media-lightbox-action\s+svg,\s*\.media-lightbox-action\s+svg\s+\*[^{]*\{[^}]*color:\s*#ffffff\s!important;[^}]*stroke:\s*#ffffff\s!important;/s);
  assert.match(css, /\.media-lightbox-action\s+svg\s*\{[^}]*fill:\s*none\s!important;/s);
  assert.match(css, /\.media-lightbox-action\s+svg\s+\[fill\]:not\(\[fill="none"\]\)[^{]*\{[^}]*fill:\s*#ffffff\s!important;/s);
  assert.match(css, /\.media-lightbox-close\s*\{[^}]*top:\s*1\.15rem;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*background:\s*rgba\([^)]+\);/s);
  assert.match(css, /\.media-lightbox-close\s+svg\s*\{[^}]*display:\s*block;[^}]*width:\s*1\.5rem;[^}]*height:\s*1\.5rem;/s);
  assert.match(css, /\.media-lightbox-close\s*\{[^}]*color:\s*#ffffff;/s);
  assert.match(css, /\.media-lightbox-close\s+svg\s*\{[^}]*stroke:\s*#ffffff;/s);
  assert.match(mediaPreviewLifecycle, /class="media-lightbox-close"[^>]*><svg[^>]*stroke="#ffffff"/);
  assert.match(css, /\.message-media-play\s+svg\s+path\s*\{[^}]*fill:\s*#ffffff;/s);
  assert.match(css, /\.message-media-thumb\.message-media-video\s*\{[^}]*background:\s*#111827;/s);
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
  assert.match(css, /\.mp-scroll::-webkit-scrollbar\s*\{\s*width:\s*4px;/);
  assert.match(css, /\.mp-scroll::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*transparent;/s);
  assert.match(css, /\.mp-scroll:hover::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*color-mix/s);
  // Flat and black and white: the tints follow the text colour.
  assert.doesNotMatch(css, /!important/);
  assert.match(css, /\.mp-mode\.is-active\s*\{[^}]*border-color:\s*var\(--text-primary\)/s);
  assert.match(css, /\.mp-slider::-webkit-slider-thumb/);
  assert.match(css, /\.mp-slider::-moz-range-thumb/);
  // The thumb is taller than the track, and the fill is hidden at the first dot, so no black shows around the thumb.
  assert.match(css, /--mp-thumb:\s*2rem;/);
  assert.match(css, /\.mp-slider-track\s*\{[^}]*inset:\s*0\.25rem 0;/s);
  assert.match(css, /\.mp-slider-fill\s*\{[^}]*opacity:\s*clamp\(0,/s);
  // A phone gets the panel where the design picker opens: the same width, height limit and bottom edge.
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*\.mp-panel:not\(\.mp-depth-panel\)\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*calc\(0\.45rem \+ 2\.75rem\);[^}]*width:\s*var\(--mp-phone-width\);[^}]*max-height:\s*min\(70vh,\s*34rem\);/);
  // The thinking control is small: its own button and a narrow panel, not part of the model list.
  assert.match(css, /\.mp-panel\.mp-depth-panel\s*\{[^}]*width:\s*min\(14\.5rem,/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('closing popovers from outside also collapses the model and thinking buttons', () => {
  const source = readUiSource('src/app/runtime/legacy-core/transition-bus-lifecycle.js');

  assert.match(source, /function closeAllPopovers\(\)\s*\{[\s\S]*#model-council-control \.mp-trigger\[aria-expanded="true"\][\s\S]*setAttribute\('aria-expanded',\s*'false'\)/);
});
