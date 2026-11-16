import assert from 'node:assert/strict';
import test from 'node:test';

import { browserAsked } from '../src/app/runtime/server-reply/browser-switch.js';

const windowWith = (search, stored = null) => {
  const data = new Map(stored === null ? [] : [['noureon.browserAgent', stored]]);
  return { location: { search }, localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } };
};
const seeing = { provider: 'gemini', id: 'gemini-2.5-flash', name: 'Gemini' };
const blind = { provider: 'openrouter', id: 'some/text-only-model', name: 'Text only' };

test('the browser is asked for only when the switch is on and the model can see pictures', () => {
  assert.equal(browserAsked(seeing, windowWith('')), false, 'off by default');
  assert.equal(browserAsked(seeing, windowWith('?browser=1')), true);
  assert.equal(browserAsked(blind, windowWith('?browser=1')), false, 'a model that cannot see');
});

test('the switch is kept in this browser and ?browser=0 turns it off; nonsense changes nothing; storage that fails is "off"', () => {
  const win = windowWith('?browser=1');
  assert.equal(browserAsked(seeing, win), true);
  win.location.search = '';
  assert.equal(browserAsked(seeing, win), true, 'kept');
  win.location.search = '?browser=maybe';
  assert.equal(browserAsked(seeing, win), true);
  win.location.search = '?browser=0';
  assert.equal(browserAsked(seeing, win), false);
  assert.equal(browserAsked(seeing, { location: { search: '?browser=1' }, localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } }), false);
});
