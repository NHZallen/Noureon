import assert from 'node:assert/strict';
import test from 'node:test';

import { absoluteLinks, findPassages, pageWindow } from '../src/app/legacy-runtime/features/web-page-text.js';

const menu = ['Skip to content', '', 'Navigation Menu', ...Array.from({ length: 15 }, (_, index) => `- [Item ${index}](/m/${index})`)].join('\n');

test('links get full addresses and the page is kept whole; anchors and mail links become their text', () => {
  assert.equal(absoluteLinks('[a](/x) [b](#top) [c](mailto:x@y.z) [d](https://o.test/p)', 'https://s.test/q/r'), '[a](https://s.test/x) b c [d](https://o.test/p)');
  const page = absoluteLinks(`${menu}\n\n[go](/z)`, 'https://s.test/');
  assert.match(page, /Navigation Menu/, 'nothing of the page is cut, its menu included');
  assert.match(page, /\[Item 3\]\(https:\/\/s\.test\/m\/3\)/);
  assert.equal(page.endsWith('[go](https://s.test/z)'), true);
});

test('a window is read from a place, cut at a line end, and says where it ends', () => {
  const text = Array.from({ length: 50 }, (_, index) => `line ${index} ${'x'.repeat(40)}`).join('\n');
  const window = pageWindow(text, 0, 500);
  assert.equal(window.total, text.length);
  assert.equal(window.text.endsWith('x'), true);
  assert.equal(window.to <= 500 && window.to > 300, true);
  assert.equal(pageWindow(text, window.to, 500).from, window.to);
  assert.equal(pageWindow('short', 99).text, '');
});

test('passages are found by the whole phrase first, then by its words, with where they start', () => {
  const text = `${'filler '.repeat(300)}the latest version is 17.3.0 today ${'more '.repeat(300)} version only here`;
  const [first] = findPassages(text, 'latest version');
  assert.match(first.text, /latest version is 17\.3\.0/);
  assert.equal(text.slice(first.from, first.from + 20).length, 20);
  assert.equal(findPassages(text, 'version latest')[0].text.includes('latest'), true, 'words in another order still find it');
  assert.deepEqual(findPassages(text, 'zebra'), []);
  assert.deepEqual(findPassages(text, ''), []);
  assert.equal(findPassages('a '.repeat(2000), 'a').length <= 5, true);
});
