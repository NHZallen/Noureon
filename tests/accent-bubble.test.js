import assert from 'node:assert/strict';
import test from 'node:test';

import { ACCENT_BUBBLES, bubbleColorsFor } from '../src/utils/accent-bubble.js';
import { UI_THEME_COLORS } from '../src/app/runtime/legacy-core/runtime-ui-colors.js';

const HEX = /^#[0-9a-f]{6}$/;
const lightness = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};

test('every choice of the accent menu has a bubble in the light and the dark theme, and nothing else does', () => {
  assert.deepEqual(Object.keys(ACCENT_BUBBLES), Object.keys(UI_THEME_COLORS));
  for (const bubble of Object.values(ACCENT_BUBBLES)) {
    for (const theme of ['light', 'dark']) {
      assert.match(bubble[theme].bg, HEX);
      assert.match(bubble[theme].text, HEX);
    }
    assert.ok(lightness(bubble.light.bg) > 0.88, 'a pale bubble in the light theme');
    assert.ok(lightness(bubble.light.text) < 0.4, 'with dark letters');
  }
});

test('a choice of the menu gets its own bubble, whatever the case of its code', () => {
  assert.deepEqual(bubbleColorsFor('#3b82f6', 'light', UI_THEME_COLORS), { bg: '#ecf2fe', text: '#0e39ab' });
  assert.deepEqual(bubbleColorsFor('#3B82F6', 'dark', UI_THEME_COLORS), { bg: '#020462', text: '#e6f2ff' });
  assert.deepEqual(bubbleColorsFor(UI_THEME_COLORS.black, 'dark', UI_THEME_COLORS), { bg: '#404040', text: '#ffffff' });
  assert.deepEqual(bubbleColorsFor(UI_THEME_COLORS.yellow, 'dark', UI_THEME_COLORS), { bg: '#ca7600', text: '#fff1a8' });
  assert.deepEqual(bubbleColorsFor('not a colour', 'light', UI_THEME_COLORS), ACCENT_BUBBLES.default.light);
});

test('a colour of the person\'s own gets a bubble with the proportions of the menu: pale in the light theme, deep in the dark one, grey when it is grey', () => {
  for (const hex of ['#ff0000', '#00ff00', '#8800ff', '#1a2a6c', '#e91e63', '#12abcd']) {
    const light = bubbleColorsFor(hex, 'light', UI_THEME_COLORS);
    const dark = bubbleColorsFor(hex, 'dark', UI_THEME_COLORS);
    assert.match(light.bg, HEX);
    assert.ok(lightness(light.bg) > 0.88, `${hex} light bubble is pale`);
    assert.ok(lightness(light.text) < 0.4, `${hex} light letters are dark`);
    assert.ok(lightness(dark.bg) < 0.25, `${hex} dark bubble is deep`);
    assert.ok(lightness(dark.text) > 0.75, `${hex} dark letters are light`);
  }
  assert.deepEqual(bubbleColorsFor('#777777', 'light', UI_THEME_COLORS), ACCENT_BUBBLES.black.light);
  assert.deepEqual(bubbleColorsFor('#777777', 'dark', UI_THEME_COLORS), ACCENT_BUBBLES.black.dark);
});

test('a custom colour between two choices gets a bubble between theirs', () => {
  // A colour of the same hue as a choice but not its code lands on that choice's bubble hue.
  const red = bubbleColorsFor('#ff0000', 'dark', UI_THEME_COLORS);
  const orange = ACCENT_BUBBLES.orange.dark.bg;
  const pink = ACCENT_BUBBLES.pink.dark.bg;
  const channel = (hex, index) => parseInt(hex.slice(index, index + 2), 16);
  assert.ok(channel(red.bg, 1) >= Math.min(channel(orange, 1), channel(pink, 1)) - 12 && channel(red.bg, 1) <= Math.max(channel(orange, 1), channel(pink, 1)) + 12, 'red channel stays between the neighbours');
});
