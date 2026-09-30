import assert from 'node:assert/strict';
import test from 'node:test';
import { canRefractBackdrop } from '../../src/app/ui/motion/glass-lens.js';
import { readUiSource } from '../helpers/source-guards.js';

test('only Chromium loads the refraction engine', () => {
  assert.equal(canRefractBackdrop({ userAgentData: { brands: [{ brand: 'Chromium', version: '150' }] } }), true);
  assert.equal(canRefractBackdrop({ userAgentData: { brands: [{ brand: 'Not A Brand', version: '99' }] } }), false);
  // Safari, every iOS browser and Firefox expose no userAgentData: they keep the CSS glass.
  assert.equal(canRefractBackdrop({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15' }), false);
  assert.equal(canRefractBackdrop(undefined), false);
});

test('the engine is vendored with its licence and loaded on demand', () => {
  const lens = readUiSource('src/app/ui/motion/glass-lens.js');
  const notice = readUiSource('src/vendor/liquid-glass/README.md');
  const licence = readUiSource('src/vendor/liquid-glass/LICENSE');

  assert.match(lens, /await import\('\.\.\/\.\.\/\.\.\/vendor\/liquid-glass\/liquid-glass\.js'\)/);
  assert.doesNotMatch(lens, /^import .*vendor\/liquid-glass/m);
  assert.match(licence, /MIT License/);
  assert.match(notice, /gentpan\/liquidglass/);
});
