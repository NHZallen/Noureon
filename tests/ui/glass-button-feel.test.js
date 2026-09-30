import assert from 'node:assert/strict';
import test from 'node:test';
import { GLASS_BUTTON_SELECTOR, glassPullState } from '../../src/app/ui/motion/glass-button-feel.js';
import { readUiSource } from '../helpers/source-guards.js';

const scaleOf = (state) => state.scale.split(' ').map(Number);
const translateOf = (state) => state.translate.split(' ').map((value) => parseFloat(value));

test('a still press only lifts the glass', () => {
  const state = glassPullState(0, 0);

  assert.deepEqual(translateOf(state), [0, 0]);
  assert.deepEqual(scaleOf(state), [1.1, 1.1]);
});

test('dragging pulls toward the finger with a limit and stretches along the pull', () => {
  const near = glassPullState(30, 0);
  const far = glassPullState(400, 0);
  const [nearX] = translateOf(near);
  const [farX, farY] = translateOf(far);
  const [stretchX, squashY] = scaleOf(far);

  assert.ok(nearX > 0 && nearX < farX);
  assert.ok(farX <= 22 && farY === 0);
  assert.ok(stretchX > 1.1 && squashY < 1.1);
  assert.deepEqual(translateOf(glassPullState(-400, 0)), [-farX, 0]);
});

test('the glass press feel covers the header buttons and moves with translate and scale', () => {
  const css = readUiSource('src/styles/chat-edge-fade.css');

  assert.match(GLASS_BUTTON_SELECTOR, /#menu-toggle-btn/);
  assert.match(GLASS_BUTTON_SELECTOR, /#temporary-chat-entry-button/);
  assert.match(css, /:is\([^)]*#menu-toggle-btn[^)]*\)\.is-glass-pressed\s*\{[^}]*scale:\s*1\.1;/s);
  assert.match(css, /touch-action:\s*none;/);
  assert.match(css, /translate\s+0\.5s\s+cubic-bezier\(0\.34,\s*1\.56/);
  assert.doesNotMatch(css, /transform:\s*(translate|scale)/);
});
