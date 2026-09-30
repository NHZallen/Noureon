import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { patchHTML } from '../src/app/ui/dom/patch-html.js';

test('a ticking panel keeps its elements and only its numbers change', () => {
  const window = new Window();
  const target = window.document.createElement('div');
  patchHTML(target, '<details class="p" open><summary><span>模型</span><span>1s</span></summary><p>字元: 0</p></details>');
  const summary = target.querySelector('summary');
  patchHTML(target, '<details class="p" open><summary><span>模型</span><span>2s</span></summary><p>字元: 12</p></details>');
  assert.equal(target.querySelector('summary'), summary, 'same elements');
  assert.equal(target.textContent, '模型2s字元: 12');
  window.happyDOM.abort();
});

test('a folded panel stays folded across ticks', () => {
  const window = new Window();
  const target = window.document.createElement('div');
  patchHTML(target, '<details open><summary>1s</summary></details>');
  target.querySelector('details').open = false;
  patchHTML(target, '<details open><summary>2s</summary></details>');
  assert.equal(target.querySelector('details').open, false);
  window.happyDOM.abort();
});

test('different markup replaces what is there', () => {
  const window = new Window();
  const target = window.document.createElement('div');
  patchHTML(target, '<p>準備中</p>');
  patchHTML(target, '<div class="error">失敗</div>');
  assert.equal(target.innerHTML, '<div class="error">失敗</div>');
  window.happyDOM.abort();
});
