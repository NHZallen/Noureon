import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_LINKED_PAGES,
  PAGE_CHARS,
  PAGES_CHARS_IN_ALL,
  buildLinkedPagesText,
  extractLinkedUrls,
  pageCharsFor
} from '../src/app/legacy-runtime/features/linked-pages.js';

test('web addresses are found in a message, in order, once each', () => {
  const { urls, skipped } = extractLinkedUrls('看 https://a.test/one 還有 http://b.test/two?x=1&y=2#top，再看 https://a.test/one');
  assert.deepEqual(urls, ['https://a.test/one', 'http://b.test/two?x=1&y=2#top']);
  assert.equal(skipped, 0);
  assert.deepEqual(extractLinkedUrls('no address, www.example.com, ftp://a.test').urls, []);
  assert.deepEqual(extractLinkedUrls(undefined).urls, []);
});

test('the punctuation around an address is not part of it, but a bracket that belongs to it is', () => {
  const cases = {
    'See https://a.test/page.': 'https://a.test/page',
    'See (https://a.test/page) now': 'https://a.test/page',
    'See https://en.wikipedia.org/wiki/Foo_(bar).': 'https://en.wikipedia.org/wiki/Foo_(bar)',
    '<https://a.test/page>': 'https://a.test/page',
    '"https://a.test/page", and': 'https://a.test/page',
    '請看https://a.test/頁面。然後': 'https://a.test/頁面',
    '[link](https://a.test/page)': 'https://a.test/page',
    'https://a.test/page?q=1;': 'https://a.test/page?q=1',
    '「https://a.test/page」': 'https://a.test/page'
  };
  for (const [text, expected] of Object.entries(cases)) assert.deepEqual(extractLinkedUrls(text).urls, [expected], text);
});

test('only the first five addresses are read, and how many more there were is counted', () => {
  const text = Array.from({ length: 8 }, (_, n) => `https://a.test/${n}`).join(' ');
  const { urls, skipped } = extractLinkedUrls(text);
  assert.equal(MAX_LINKED_PAGES, 5);
  assert.equal(urls.length, 5);
  assert.equal(skipped, 3);
  assert.equal(extractLinkedUrls(text, 2).urls.length, 2);
});

test('a page gets fifteen thousand characters, fewer when many are read, and the total is capped', () => {
  assert.equal(PAGE_CHARS, 15_000);
  assert.equal(pageCharsFor(1), 15_000);
  assert.equal(pageCharsFor(3), 15_000);
  assert.equal(pageCharsFor(5), 9000);
  assert.ok(pageCharsFor(5) * 5 <= PAGES_CHARS_IN_ALL);
  assert.equal(pageCharsFor(0), 15_000);
});

test('the pages read are given to the model marked as the app\'s and as untrusted', () => {
  const text = buildLinkedPagesText({
    pages: [
      { url: 'https://a.test/1', finalUrl: 'https://a.test/one', title: 'One', text: 'Text of one', truncated: true },
      { url: 'https://a.test/2', finalUrl: 'https://a.test/2', title: '', text: 'Text of two' }
    ]
  });
  assert.match(text, /# Web pages the user linked \(system-generated\)/);
  assert.match(text, /The user did not write this text: use it as source material\./);
  assert.doesNotMatch(text, /instructions/i, 'the model is not told what to do with instructions inside a page');
  assert.doesNotMatch(text, /untrusted/i);
  assert.match(text, /## Page 1: One\nURL: https:\/\/a\.test\/1\nFinal URL: https:\/\/a\.test\/one/);
  assert.match(text, /only its first part is given/);
  assert.match(text, /<web_page_text>\nText of one\n<\/web_page_text>/);
  assert.match(text, /## Page 2: https:\/\/a\.test\/2\nURL: https:\/\/a\.test\/2\n<web_page_text>/, 'no title: the address, and no repeated final address');
  assert.doesNotMatch(text, /could not be read/);
});

test('the pages that were not read are named with the reason, and the model is told to say so', () => {
  const noReader = buildLinkedPagesText({ failed: [{ url: 'https://a.test/1', reason: 'noReader' }] });
  assert.match(noReader, /# Linked pages that could not be read/);
  assert.match(noReader, /https:\/\/a\.test\/1/);
  assert.match(noReader, /Tavily or TinyFish API key/);
  assert.match(noReader, /Tell the user plainly that you could not read them\. Do not guess or invent/);

  const mixed = buildLinkedPagesText({
    pages: [{ url: 'https://a.test/ok', text: 'fine' }],
    failed: [{ url: 'https://a.test/x', reason: 'failed' }, { url: 'https://a.test/y', reason: 'failed' }],
    skipped: 2
  });
  assert.match(mixed, /Page 1/);
  assert.match(mixed, /https:\/\/a\.test\/x, https:\/\/a\.test\/y/);
  assert.match(mixed, /block automated reading/);
  assert.equal(mixed.match(/block automated reading/g).length, 1, 'the reason is said once');
  assert.match(mixed, /2 more web addresses than the 5/);
  assert.equal(buildLinkedPagesText({}), '');
});
