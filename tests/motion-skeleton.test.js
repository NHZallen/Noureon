import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createFileSkeleton } from '../src/app/ui/files/file-skeleton.js';
import { morphChildren } from '../src/app/ui/motion/morph-children.js';

const parse = (html) => {
  const { document } = new Window();
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
};

test('the place of a file has the boxes of the card, bars that shimmer, and what is being done', () => {
  const { document } = new Window();
  const card = createFileSkeleton(document, 'Redoing the presentation');
  assert.equal(card.classList.contains('ac-file-card'), true, 'the card\'s own style gives it its size');
  assert.equal(card.classList.contains('file-skeleton'), true);
  assert.equal(card.getAttribute('aria-hidden'), 'true');
  assert.equal(card.querySelectorAll('.sk').length, 2, 'an icon and a name, as bars');
  assert.equal(card.querySelector('.ac-file-link-static').textContent, 'Redoing the presentation');
  assert.equal(createFileSkeleton(document).querySelector('.ac-file-link-static').textContent, '');
});

test('morphing changes only what differs: a line that grew, a new item, and nothing of the lines before it', () => {
  const target = parse('<p>Heading</p>\n<ul><li>one</li><li>tw</li></ul>');
  const first = target.querySelector('p');
  const firstItem = target.querySelector('li');
  morphChildren(target, parse('<p>Heading</p>\n<ul><li>one</li><li>two</li><li>three</li></ul>'));
  assert.equal(target.querySelector('p'), first, 'the heading is the same element');
  assert.equal(target.querySelector('li'), firstItem, 'the first item is the same element');
  assert.deepEqual([...target.querySelectorAll('li')].map((item) => item.textContent), ['one', 'two', 'three']);
  morphChildren(target, parse('<p>Heading</p>'));
  assert.equal(target.querySelector('ul'), null, 'what is not there any more goes');
  morphChildren(target, parse('<h2>Other</h2>'));
  assert.equal(target.innerHTML, '<h2>Other</h2>');
});
