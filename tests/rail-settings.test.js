import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createRail } from '../src/app/ui/rail/rail.js';
import { mountPanelModeRow } from '../src/app/ui/rail/rail-settings.js';
import { PANEL_MODE_KEY } from '../src/app/ui/rail/rail-mode.js';
import railTexts from '../src/data/i18n/parts/rail.js';

// The choice of the panel in the settings: a row after the colour scheme, with the two choices, kept in step with the rail's button and key, and not there on a phone.

const setup = ({ width = 1440, language = 'en' } = {}) => {
  const window = new Window({ url: 'https://noureon.test/', width, height: 900 });
  window.innerWidth = width;
  window.matchMedia = (query) => ({ matches: query === '(pointer: coarse)' ? false : true, media: query, addEventListener() {}, removeEventListener() {} });
  const { document } = window;
  document.body.innerHTML = '<nav id="desktop-rail"></nav><aside id="sidebar"></aside><button id="menu-toggle-btn"></button><section class="pz-card"><div class="pz-row"><select id="color-scheme-select"></select></div><div class="pz-row" id="after"></div></section>';
  const state = { language };
  const text = (key) => railTexts[state.language][key] ?? key;
  const rail = createRail({ document, storage: window.localStorage, toggleSidebar() {}, text, platform: 'Win32' });
  return { window, document, rail, state, row: () => document.getElementById('rail-panel-row'), select: () => document.getElementById('rail-panel-select') };
};

test('without the appearance card there is no row', () => {
  const window = new Window({ url: 'https://noureon.test/' });
  assert.equal(mountPanelModeRow({ document: window.document, text: (key) => key, onChange() {} }), null);
});

test('the row is after the colour scheme, with the two choices in the language, and the choice changes the panel', () => {
  const t = setup();
  assert.equal(t.row().previousElementSibling.querySelector('#color-scheme-select') !== null, true, 'right after the colour scheme');
  assert.equal(t.row().nextElementSibling.id, 'after');
  assert.equal(t.row().hidden, false);
  assert.deepEqual([...t.select().options].map((option) => [option.value, option.textContent]), [['pinned', 'Docked'], ['hover', 'Open on hover']]);
  assert.equal(t.select().value, 'pinned');
  assert.equal(t.row().querySelector('label').textContent, 'Sidebar');
  t.select().value = 'hover';
  t.select().dispatchEvent(new t.window.Event('change'));
  assert.equal(t.rail.mode(), 'hover');
  assert.equal(t.window.localStorage.getItem(PANEL_MODE_KEY), 'hover');
  assert.equal(t.document.documentElement.getAttribute('data-rail-layout'), 'hover');
});

test('the button and the key change what the row shows; a new language changes its words', () => {
  const t = setup();
  t.document.getElementById('menu-toggle-btn').click();
  assert.equal(t.select().value, 'hover');
  t.state.language = 'fr';
  t.rail.refresh();
  assert.equal(t.row().querySelector('label').textContent, 'Panneau latéral');
  assert.equal(t.select().options[1].textContent, 'Au survol');
});

test('on a phone the row is hidden', () => {
  const t = setup({ width: 390 });
  assert.equal(t.row().hidden, true);
});
