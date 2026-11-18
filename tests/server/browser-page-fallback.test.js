import assert from 'node:assert/strict';
import test from 'node:test';

import { BROWSER_READS_PER_REPLY, withBrowserReading } from '../../server/browser-page-fallback.js';

const readers = (result) => async () => result;

test('a page the readers could not read (empty, blocked or no key) is read by the browser; the others are left as they are', async () => {
  const asked = [];
  const loader = { readPage: async (url) => { asked.push(url); return url.includes('spa') ? { url, finalUrl: url, title: 'S', text: 'words' } : null; } };
  const open = withBrowserReading(readers({ pages: [{ url: 'https://ok.example/', text: 'fine' }], failed: [{ url: 'https://spa.example/', reason: 'empty' }, { url: 'https://down.example/', reason: 'failed' }, { url: 'https://nokey.spa.example/', reason: 'noReader' }], reader: 'tavily' }), loader);
  const result = await open(['x'], null, { maxChars: 8000 });
  assert.deepEqual(asked, ['https://spa.example/', 'https://down.example/', 'https://nokey.spa.example/']);
  assert.deepEqual(result.pages.map((page) => page.url), ['https://ok.example/', 'https://spa.example/', 'https://nokey.spa.example/']);
  assert.deepEqual(result.failed, [{ url: 'https://down.example/', reason: 'failed' }]);
  assert.equal(result.reader, 'tavily');
});

test('without a loader, or when nothing failed, the readers are used as they are; the browser reads a limited number of pages in a reply, and none after a stop', async () => {
  const plain = readers({ pages: [], failed: [{ url: 'https://a.example/', reason: 'empty' }] });
  assert.equal(withBrowserReading(plain, null), plain);
  const never = { readPage: async () => { throw new Error('should not be asked'); } };
  const fine = await withBrowserReading(readers({ pages: [{ url: 'https://a.example/', text: 't' }], failed: [] }), never)(['a']);
  assert.equal(fine.pages.length, 1);
  let reads = 0;
  const loader = { readPage: async () => { reads += 1; return null; } };
  const failing = Array.from({ length: BROWSER_READS_PER_REPLY + 3 }, (_, i) => ({ url: `https://s${i}.example/`, reason: 'empty' }));
  const open = withBrowserReading(readers({ pages: [], failed: failing }), loader);
  const result = await open([]);
  assert.equal(reads, BROWSER_READS_PER_REPLY);
  assert.equal(result.failed.length, failing.length, 'what the browser could not read stays failed');
  await open([]);
  assert.equal(reads, BROWSER_READS_PER_REPLY, 'the limit is for the whole reply');
  const stopped = new AbortController();
  stopped.abort();
  const again = withBrowserReading(readers({ pages: [], failed: [{ url: 'https://z.example/', reason: 'empty' }] }), { readPage: async () => { reads += 1; return null; } });
  await again([], stopped.signal);
  assert.equal(reads, BROWSER_READS_PER_REPLY);
});
