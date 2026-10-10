import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { renderDepthTrigger } from '../src/app/ui/model-picker/model-picker-markup.js';

const css = readFileSync(new URL('../src/styles/model-picker.css', import.meta.url), 'utf8');

test('the thinking depth button holds every level name, unseen, so its width (and the panel above it) does not move when the level changes', () => {
  const levels = ['即時', '低', '中', '高', 'Pro'].map((label) => ({ label }));
  const ctx = { t: (key) => key, escape: (value) => String(value) };
  const html = renderDepthTrigger({ depth: { levels, index: 1 }, depthOpen: false }, ctx);
  assert.match(html, /data-sizer="即時\n低\n中\n高\nPro"/);
  assert.match(html, /<span class="mp-depth-trigger-value">低<\/span>/);
  assert.match(css, /\.mp-depth-trigger-label::after \{[^}]*content: attr\(data-sizer\)[^}]*visibility: hidden/);
});

test('the slider is a frame with the track inside it, and the thumb is ringed with the accent colour all round', () => {
  assert.match(css, /\.mp-slider-wrap \{[^}]*border: 1px solid var\(--border-color\)[^}]*border-radius: 999px/);
  assert.match(css, /\.mp-slider-track \{[^}]*inset: var\(--mp-inset\)/);
  assert.match(css, /\.mp-slider-fill \{[^}]*background: var\(--button-primary-bg\)/);
  assert.match(css, /\.mp-thumb \{[^}]*border: 0\.2rem solid var\(--button-primary-bg\)[^}]*background: var\(--text-primary\)/);
});

test('the thumb does not grow when it is pressed', () => {
  assert.doesNotMatch(css, /--mp-press/);
  assert.match(css, /\.mp-thumb \{[^}]*transform: translate\(-50%, -50%\);/);
});
