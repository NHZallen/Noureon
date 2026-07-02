import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from '../helpers/source-guards.js';

test('generated image cards keep mobile AI spacing, white controls, calm skeleton, and reveal motion', () => {
  const css = readUiSource('src/styles/chat.css');
  const lifecycle = readUiSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');

  assert.match(css, /\.generated-image-action-btn\s+svg[^{]*\{[^}]*stroke:\s*#fff;/s);
  assert.match(css, /\.generated-image-card\s*\{[\s\S]*width:\s*fit-content;[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/s);
  assert.match(css, /\.generated-image-preview-btn\s*\{[\s\S]*display:\s*inline-block;[\s\S]*width:\s*auto;/s);
  assert.match(css, /\.generated-image-card\.has-natural-aspect\s*\{[\s\S]*aspect-ratio:\s*auto\s*!important;/s);
  assert.match(css, /\.generated-image-skeleton\s*\{[\s\S]*color-mix\(in srgb,\s*var\(--input-field-bg\)[\s\S]*box-shadow:/s);
  assert.match(css, /\.generated-image-skeleton::before[^{]*\{[^}]*linear-gradient[\s\S]*animation:\s*generated-image-soft-sheen/s);
  assert.doesNotMatch(css, /@keyframes\s+generated-image-particles/);
  assert.match(css, /transition:\s*aspect-ratio\s*\.42s/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.image-message-stack[^{]*\{[^}]*width:\s*calc\(100vw\s*-\s*3\.5rem\);[^}]*margin-right:\s*1\.1rem\s*!important;/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.generated-image-card\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*100%;/s);
  assert.match(css, /\.generated-image-result-enter\.generated-image-result-visible\s+\.generated-image-card/);
  assert.match(lifecycle, /generated-image-stage-morphing/);
  assert.match(lifecycle, /generated-image-skeleton-finalizing/);
  assert.match(lifecycle, /globalThis\.setTimeout\(replaceLoadingWithFinal,\s*420\)/);
  assert.match(lifecycle, /generated-image-result-visible/);
});

test('targeted editor exposes a shared thickness slider and a recognizable white eraser', () => {
  const source = readUiSource('src/app/legacy-runtime/features/generated-image-interactions.js');
  const css = readUiSource('src/styles/generated-image-editor.css');

  assert.match(source, /generated-image-editor-size/);
  assert.match(source, /type="range"\s+min="4"\s+max="48"\s+value="14"/);
  assert.match(source, /brushSize\s*\*\s*\(canvas\.width\s*\/\s*bounds\.width\)/);
  assert.match(source, /generated-image-editor-brush-cursor/);
  assert.doesNotMatch(source, /data-drawing-area-label/);
  assert.doesNotMatch(source, /<strong>\$\{texts\.title\}<\/strong><span>\$\{texts\.hint\}<\/span>/);
  assert.match(source, /generated-image-editor-close[\s\S]*<svg[^>]*viewBox="0 0 24 24"[\s\S]*M18 6 6 18/s);
  assert.match(source, /<path d="M22 21H7"\/>/);
  assert.match(css, /\.generated-image-editor\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*background:\s*rgba\(0,\s*0,\s*0,\s*\.84\);[\s\S]*backdrop-filter:\s*none;/s);
  assert.match(css, /\.generated-image-editor-close\s*\{[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/s);
  assert.match(css, /\.generated-image-editor-close\s+svg[\s\S]*stroke:\s*currentColor;/s);
  assert.match(css, /\.generated-image-editor-stage\s*\{[\s\S]*overflow:\s*auto;/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.generated-image-editor-stage\s*\{[\s\S]*overflow-y:\s*auto;/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.generated-image-editor-canvas-wrap,\s*[\r\n\s]*\.generated-image-editor-photo\s*\{[\s\S]*max-height:\s*none;/s);
  assert.match(css, /\.generated-image-editor-photo\s*\{[\s\S]*border-radius:\s*0;/s);
  assert.match(css, /\.generated-image-lightbox\s+\.media-lightbox-stage\s+img[\s\S]*border-radius:\s*0;/s);
  assert.match(css, /\.generated-image-editor-eraser\s+svg[\s\S]*stroke:\s*#fff;/s);
  assert.doesNotMatch(css, /\.generated-image-editor-canvas-wrap::before/);
  assert.match(css, /\.generated-image-editor-brush-cursor[^{]*\{[^}]*--brush-size/s);
});
