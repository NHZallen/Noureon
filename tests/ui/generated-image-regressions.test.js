import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from '../helpers/source-guards.js';

test('generated image cards keep mobile AI spacing, white controls, particles, and reveal motion', () => {
  const css = readUiSource('src/styles/chat.css');
  const lifecycle = readUiSource('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');

  assert.match(css, /\.generated-image-action-btn\s+svg[^{]*\{[^}]*stroke:\s*#fff;/s);
  assert.match(css, /\.generated-image-skeleton::before[^{]*\{[^}]*radial-gradient[\s\S]*animation:\s*generated-image-particles/s);
  assert.match(css, /\.generated-image-skeleton::after[^{]*\{[^}]*radial-gradient[\s\S]*animation:\s*generated-image-particles-reverse/s);
  assert.match(css, /@keyframes\s+generated-image-particles/);
  assert.match(css, /transition:\s*aspect-ratio\s*\.42s/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.image-message-stack[^{]*\{[^}]*width:\s*calc\(100vw\s*-\s*3\.5rem\);[^}]*margin-right:\s*1\.1rem\s*!important;/s);
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
  assert.match(source, /data-drawing-area-label/);
  assert.match(source, /<path d="M22 21H7"\/>/);
  assert.match(css, /\.generated-image-editor-eraser\s+svg[\s\S]*stroke:\s*#fff;/s);
  assert.match(css, /\.generated-image-editor-canvas-wrap::before[^{]*\{[^}]*border:\s*2px dashed/s);
  assert.match(css, /\.generated-image-editor-brush-cursor[^{]*\{[^}]*--brush-size/s);
});
