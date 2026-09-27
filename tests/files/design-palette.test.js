import assert from 'node:assert/strict';
import test from 'node:test';

import { adjustForContrast, contrastRatio, hexToOklch, oklchToHex, parseHexColor } from '../../src/app/ui/files/design/color.js';
import { normalizeDesign } from '../../src/app/ui/files/design/design-params.js';
import { DESIGN_PRESETS, DESIGN_PRESET_IDS } from '../../src/app/ui/files/design/design-presets.js';
import { buildPalette, contrastReport, invertPalette } from '../../src/app/ui/files/design/palette.js';

// The four "AI tuning" examples from the approved proposal: none is a preset.
const AI_EXAMPLES = [
  { mode: 'dark', accent: '#FF6A3D', accent2: '#FFC53D', background: 'neutral', colorUse: 'vivid', fonts: 'tight', chart: 'duo' },
  { mode: 'light', accent: '#1E88E5', accent2: '#FFB300', background: 'tinted', colorUse: 'vivid', fonts: 'rounded', chart: 'categorical' },
  { mode: 'light', accent: '#123C69', accent2: '#2BB3A3', background: 'neutral', colorUse: 'restrained', fonts: 'consulting', chart: 'duo' },
  { mode: 'light', accent: '#2F2A25', accent2: '#B08D57', background: 'warm', colorUse: 'restrained', fonts: 'modernSerif', chart: 'accent' }
];

const failures = (palette) => contrastReport(palette).filter((pair) => !pair.pass).map((pair) => `${pair.foreground}/${pair.background} ${pair.ratio.toFixed(2)}<${pair.target}`);

test('hex colours are parsed, converted and measured correctly', () => {
  assert.equal(parseHexColor('#abc'), '#AABBCC');
  assert.equal(parseHexColor('1f4e9a'), '#1F4E9A');
  assert.equal(parseHexColor('navy'), null);
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
  assert.ok(Math.abs(hexToOklch('#FFFFFF').l - 1) < 1e-6);
  for (const hex of ['#1F4E9A', '#FF5B1F', '#DDF247', '#0E7C66', '#6B2D5C']) {
    assert.equal(oklchToHex(hexToOklch(hex)), hex, `${hex} round-trips`);
  }
});

test('contrast adjustment changes lightness, never hue', () => {
  const yellow = hexToOklch('#F5C400');
  const adjusted = adjustForContrast(yellow, ['#FFFFFF'], 4.5);
  assert.ok(contrastRatio(oklchToHex(adjusted), '#FFFFFF') >= 4.5);
  assert.ok(Math.abs(adjusted.h - yellow.h) < 1e-9, 'hue unchanged');
  assert.ok(adjusted.l < yellow.l, 'darkened against white');
});

test('every preset passes every contrast pair in light and dark mode', () => {
  for (const id of DESIGN_PRESET_IDS) {
    for (const mode of ['light', 'dark']) {
      const { design } = normalizeDesign({ ...DESIGN_PRESETS[id].params, mode });
      const palette = buildPalette(design);
      assert.deepEqual(failures(palette), [], `${id} (${mode})`);
      assert.deepEqual(failures(invertPalette(palette)).filter((entry) => entry.startsWith('text/') || entry.startsWith('muted/background')), [], `${id} (${mode}) inverse slides`);
    }
  }
});

test('the AI tuning examples pass in light and dark mode', () => {
  for (const example of AI_EXAMPLES) {
    for (const mode of ['light', 'dark']) {
      const { design } = normalizeDesign({ ...example, mode });
      assert.deepEqual(failures(buildPalette(design)), [], `${example.accent} (${mode})`);
    }
  }
});

test('no accent, background tone or chart style can produce unreadable text', () => {
  const accents = ['#000000', '#FFFFFF', '#808080', '#FFFF00', '#00FFFF', '#FF00FF', '#F5C400', '#3D5AFE', '#E5282E', '#0B8043', '#8B4513', '#FFB6C1', '#1A1A1A', '#7FFF00', '#4B0082', '#C0C0C0'];
  for (const accent of accents) {
    for (const background of ['neutral', 'warm', 'cool', 'tinted', 'accent']) {
      for (const mode of ['light', 'dark']) {
        for (const chart of ['accent', 'duo', 'categorical']) {
          const { design } = normalizeDesign({ accent, background, mode, chart });
          assert.deepEqual(failures(buildPalette(design)), [], `${accent} ${background} ${mode} ${chart}`);
        }
      }
    }
  }
});

test('an accent-coloured deck uses text colour for marks and flips its colour blocks', () => {
  const { design } = normalizeDesign({ preset: 'neon' });
  const palette = buildPalette(design);
  assert.equal(palette.background, '#DDF247', 'the neon accent is the background');
  assert.equal(palette.accent, palette.text, 'marks use the text colour');
  assert.ok(contrastRatio(palette.onFill, palette.fill) >= 4.5);
  assert.ok(palette.dark === false && contrastRatio(palette.fill, palette.background) > 4.5, 'colour blocks are dark on the neon deck');
});

test('chart styles give a highlight, tonal or categorical palette', () => {
  const base = { preset: 'whitespace' };
  const duo = buildPalette(normalizeDesign({ ...base, chart: 'duo' }).design).series;
  assert.equal(new Set(duo.slice(1)).size, 1, 'everything but the highlight is one grey');
  assert.notEqual(duo[0], duo[1]);
  const categorical = buildPalette(normalizeDesign({ ...base, chart: 'categorical' }).design);
  assert.equal(new Set(categorical.series).size, 6, 'six distinct series colours');
  categorical.series.forEach((color) => assert.ok(contrastRatio(color, categorical.background) >= 3, `${color} visible on the background`));
  const tonal = buildPalette(normalizeDesign({ ...base, chart: 'accent' }).design).series;
  const hues = tonal.slice(0, 3).map((color) => hexToOklch(color).h);
  assert.ok(Math.max(...hues) - Math.min(...hues) < 12, 'tonal series keeps the accent hue');
});
