import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { dialMarkup, dialStyle, setDial } from '../src/app/ui/model-picker/depth-dial.js';
import { renderDepthTrigger } from '../src/app/ui/model-picker/model-picker-markup.js';

const ctx = { t: (key, values) => `${key}${values?.level ? `:${values.level}` : ''}`, escape: (value) => String(value) };
const depth = (index) => ({ levels: [{ label: 'Fast' }, { label: 'Medium' }, { label: 'High' }, { label: 'Max' }], index, defaultIndex: 1, disabled: false });

test('the dial is turned by the share of the levels the model has, so any number of levels divides it evenly', () => {
  assert.equal(dialStyle(0, 3), '--dial-p:0.0000;--dial-dash:0.000');
  assert.equal(dialStyle(3, 3), '--dial-p:1.0000;--dial-dash:75.000');
  assert.equal(dialStyle(1, 2), '--dial-p:0.5000;--dial-dash:37.500');
  assert.equal(dialStyle(5, 2), '--dial-p:1.0000;--dial-dash:75.000', 'a position past the end stays on the gauge');
  assert.equal(dialStyle(0, 0), '--dial-p:0.0000;--dial-dash:0.000', 'a single level does not divide by zero');
});

test('the thinking button carries the dial next to the name of the level, and marks a level that is not the default', () => {
  const html = renderDepthTrigger({ depth: depth(1), depthOpen: false, disabled: false }, ctx);
  assert.match(html, /<svg class="mp-dial"/);
  assert.match(html, /<span class="mp-depth-trigger-value">Medium<\/span>/);
  assert.doesNotMatch(html, /is-custom/);
  const custom = renderDepthTrigger({ depth: depth(3), depthOpen: false, disabled: false }, ctx);
  assert.match(custom, /mp-depth-trigger is-custom/);
  assert.match(custom, /--dial-p:1\.0000/);
});

test('setDial follows the thumb while it is dragged', () => {
  const { document } = new Window();
  document.body.innerHTML = `<button id="b">${dialMarkup()}</button>`;
  const button = document.getElementById('b');
  setDial(button, 2, 3, false);
  assert.equal(button.style.getPropertyValue('--dial-p'), '0.6667');
  assert.equal(button.style.getPropertyValue('--dial-dash'), '50.000');
  assert.ok(button.classList.contains('is-custom'));
  setDial(button, 1, 3, true);
  assert.ok(!button.classList.contains('is-custom'));
  assert.doesNotThrow(() => setDial(null, 1, 3, true));
});

test('the dial is for phones only and the panel becomes a bar over the composer there', () => {
  const css = readFileSync(new URL('../src/styles/depth-dial.css', import.meta.url), 'utf8');
  assert.match(css, /\.mp-dial \{ display: none;/);
  const phone = css.slice(css.indexOf('@media (max-width: 768px)'));
  assert.match(phone, /\.mp-depth-trigger \.mp-dial \{ display: block; \}/);
  assert.match(phone, /\.mp-depth-trigger \.mp-chevron \{ display: none; \}/);
  assert.match(phone, /\.mp-panel\.mp-depth-panel\.visible \{ transform: none;/, 'open, it has no transform, or the dimmed page behind it is laid against the box');
  assert.match(phone, /\.mp-depth-panel::before \{[^}]*position: fixed;[^}]*backdrop-filter: blur/s);
});
