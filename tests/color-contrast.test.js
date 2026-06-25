import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as colorContrast from '../src/utils/color-contrast.js';

const { getTextColorForBackground } = colorContrast;
const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('color contrast helper preserves six-digit hex behavior', () => {
  assert.equal(getTextColorForBackground('#ffffff'), '#000000');
  assert.equal(getTextColorForBackground('000000'), '#ffffff');
  assert.equal(getTextColorForBackground('ABCDEF'), '#000000');
  assert.equal(getTextColorForBackground('#3b82f6'), '#ffffff');
});

test('color contrast helper preserves invalid input fallback behavior', () => {
  for (const value of [undefined, null, '', '#fff', 'red', '#ffffffff']) {
    assert.equal(getTextColorForBackground(value), '#000000');
  }
});

test('color contrast helper preserves the strict luminance threshold', () => {
  assert.equal(getTextColorForBackground('#808080'), '#000000');
  assert.equal(getTextColorForBackground('#7f7f7f'), '#ffffff');
});

test('color contrast helper keeps its parser private and has no runtime responsibilities', () => {
  const source = readSource('src/utils/color-contrast.js');

  assert.deepEqual(Object.keys(colorContrast), ['getTextColorForBackground']);
  assert.match(source, /const\s+hexToRgb\s*=/);
  assert.doesNotMatch(source, /export\s+(?:const|function)\s+hexToRgb|export\s*\{[^}]*hexToRgb/);
  assert.doesNotMatch(source, /document|window|globalThis|ALL_ELEMENTS/);
  assert.doesNotMatch(source, /config|conversations|folders|localStorage|sessionStorage|indexedDB|fetch/i);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource|callback/i);
  assert.doesNotMatch(source, /setTimeout|setInterval|requestAnimationFrame|addEventListener/);
});
