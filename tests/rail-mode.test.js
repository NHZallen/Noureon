import assert from 'node:assert/strict';
import test from 'node:test';

import { layoutFor, otherMode, readPanelMode, writePanelMode, PANEL_MODE_KEY } from '../src/app/ui/rail/rail-mode.js';

// What the layout of the left side is for a width and for the choice of the person (docs/superpowers/specs/2026-11-05-desktop-rail-sidebar-design.md, §5).

test('a phone has no rail; 768 to 1023 px has the drawer; from 1024 px the panel is docked or on hover as chosen', () => {
  assert.equal(layoutFor(390), 'none');
  assert.equal(layoutFor(767), 'none');
  assert.equal(layoutFor(768), 'drawer');
  assert.equal(layoutFor(1023, 'hover'), 'drawer', 'a narrow window never has the hover panel');
  assert.equal(layoutFor(1024), 'pinned', 'docked is the default');
  assert.equal(layoutFor(1440, 'pinned'), 'pinned');
  assert.equal(layoutFor(1440, 'hover'), 'hover');
  assert.equal(layoutFor(1440, 'nonsense'), 'pinned');
});

test('a screen that is touched has no hover: the panel stays docked', () => {
  assert.equal(layoutFor(1440, 'hover', { coarse: true }), 'pinned');
  assert.equal(layoutFor(900, 'hover', { coarse: true }), 'drawer');
});

test('the choice is kept on the device, and a storage that fails leaves the default', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(readPanelMode(storage), 'pinned');
  assert.equal(writePanelMode(storage, 'hover'), true);
  assert.equal(data.get(PANEL_MODE_KEY), 'hover');
  assert.equal(readPanelMode(storage), 'hover');
  assert.equal(writePanelMode(storage, 'sideways'), false, 'only the two choices are kept');
  data.set(PANEL_MODE_KEY, 'junk');
  assert.equal(readPanelMode(storage), 'pinned');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readPanelMode(broken), 'pinned');
  assert.equal(writePanelMode(broken, 'hover'), false);
  assert.equal(readPanelMode(null), 'pinned');
});

test('the other choice', () => {
  assert.equal(otherMode('pinned'), 'hover');
  assert.equal(otherMode('hover'), 'pinned');
});
