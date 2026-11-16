import assert from 'node:assert/strict';
import test from 'node:test';

import { browserAsked, isBrowserOn, setBrowserOn } from '../src/app/runtime/server-reply/browser-switch.js';

const storageWindow = (initial = null) => {
  const data = new Map(initial === null ? [] : [['noureon.browserAgentConversations', initial]]);
  return { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, data };
};
const seeing = { provider: 'gemini', id: 'gemini-2.5-flash', name: 'Gemini' };
const blind = { provider: 'openrouter', id: 'some/text-only-model', name: 'Text only' };

test('the browser is asked for only when the conversation has it on and the model can see pictures', () => {
  const win = storageWindow();
  assert.equal(browserAsked(seeing, 'c1', win), false, 'off by default');
  setBrowserOn('c1', true, win);
  assert.equal(browserAsked(seeing, 'c1', win), true);
  assert.equal(browserAsked(blind, 'c1', win), false, 'a model that cannot see');
  assert.equal(browserAsked(seeing, 'c2', win), false, 'one conversation does not switch on another');
});

test('the switch is kept for each conversation and can be turned off again', () => {
  const win = storageWindow();
  assert.equal(setBrowserOn('c1', true, win), true);
  assert.equal(setBrowserOn('c2', true, win), true);
  assert.equal(isBrowserOn('c1', win), true);
  assert.equal(setBrowserOn('c1', false, win), false);
  assert.equal(isBrowserOn('c1', win), false);
  assert.equal(isBrowserOn('c2', win), true);
  assert.equal(setBrowserOn('', true, win), false, 'no conversation, nothing kept');
});

test('what is kept stays small, and nonsense or storage that fails is "off"', () => {
  const win = storageWindow();
  for (let i = 0; i < 250; i += 1) setBrowserOn(`c${i}`, true, win);
  assert.equal(JSON.parse(win.data.get('noureon.browserAgentConversations')).length, 200);
  assert.equal(isBrowserOn('c0', win), false, 'the oldest go first');
  assert.equal(isBrowserOn('c249', win), true);
  assert.equal(isBrowserOn('c1', storageWindow('not json')), false);
  assert.equal(isBrowserOn('c1', storageWindow('{"a":1}')), false);
  const broken = { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } };
  assert.equal(isBrowserOn('c1', broken), false);
  assert.equal(setBrowserOn('c1', true, broken), false);
  assert.equal(browserAsked(seeing, 'c1', broken), false);
});
