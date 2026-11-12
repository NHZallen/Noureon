import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { applyMotionPreference, mountMotionSetting, normalizeReduceMotion } from '../src/app/ui/motion/motion-preference.js';

const fakeStorage = () => { const data = new Map(); return { data, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k), getItem: (k) => data.get(k) ?? null }; };
const page = () => {
  const window = new Window();
  window.document.body.innerHTML = '<div id="accessibility-section"><div class="pz"></div></div>';
  return window.document;
};
const words = { motionCardTitle: 'Motion', reduceMotion: 'Reduce motion', reduceMotionDesc: 'About' };

test('the choice is only "on" or "system", and it marks the page and the mirror for the first paint', () => {
  assert.equal(normalizeReduceMotion('on'), 'on');
  assert.equal(normalizeReduceMotion('anything'), 'system');
  const document = page();
  const storage = fakeStorage();
  applyMotionPreference({ document, storage, value: 'on' });
  assert.equal(document.documentElement.getAttribute('data-motion'), 'reduced');
  assert.equal(storage.getItem('noureon-reduce-motion'), 'on');
  applyMotionPreference({ document, storage, value: 'system' });
  assert.equal(document.documentElement.hasAttribute('data-motion'), false);
  assert.equal(storage.getItem('noureon-reduce-motion'), null);
});

test('the switch in the Accessibility settings is added once, shows the saved choice, and saves at once when pressed', async () => {
  const document = page();
  const storage = fakeStorage();
  const config = { reduceMotion: 'on' };
  let saved = 0;
  const args = { document, config, saveConfig: async () => { saved += 1; }, getText: (key) => words[key], storage };
  mountMotionSetting(args);
  mountMotionSetting(args);
  assert.equal(document.querySelectorAll('#reduce-motion-card').length, 1);
  assert.equal(document.querySelector('#reduce-motion-card h3').textContent, 'Motion');
  const input = document.getElementById('reduce-motion-toggle');
  assert.equal(input.checked, true);
  assert.equal(document.documentElement.getAttribute('data-motion'), 'reduced');
  input.checked = false;
  input.dispatchEvent(new document.defaultView.Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(config.reduceMotion, 'system');
  assert.equal(saved, 1);
  assert.equal(document.documentElement.hasAttribute('data-motion'), false);
});
