import assert from 'node:assert/strict';
import test from 'node:test';
import { glassLightState } from '../../src/app/ui/motion/glass-light.js';
import { readUiSource } from '../helpers/source-guards.js';

test('the light rests at the top left and swings a few degrees with scrolling', () => {
  const rest = glassLightState(0);

  assert.equal(rest.lx, '-0.707');
  assert.equal(rest.ly, '-0.707');
  assert.equal(rest.sheen, '135deg');

  for (const scrollTop of [0, 250, 500, 1000, 4000, 12000]) {
    const { lx, ly } = glassLightState(scrollTop);
    const degrees = (Math.atan2(Number(ly), Number(lx)) * 180) / Math.PI;
    assert.ok(degrees <= -110 && degrees >= -160, `${scrollTop}px gave ${degrees}deg`);
  }
});

test('the temporary chat controls get the same glass outside the header', () => {
  const css = readUiSource('src/styles/chat-edge-fade.css');
  const feel = readUiSource('src/app/ui/motion/glass-button-feel.js');

  assert.match(css, /#chat-workspace #temporary-chat-entry-button/);
  assert.match(css, /inset calc\(var\(--glass-lx\) \* -2px\) calc\(var\(--glass-ly\) \* -2px\)/);
  assert.match(feel, /`#chat-workspace \$\{id\}`/);
});
