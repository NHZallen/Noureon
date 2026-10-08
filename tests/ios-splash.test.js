import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { END_MARKER, START_MARKER, THEMES, linkBlock, splashEntries } from '../scripts/generate-ios-splash.mjs';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test('every start-up picture exists at the size of its screen, in the colour of its theme', async () => {
  const entries = splashEntries();
  assert.ok(entries.length >= 40);
  assert.equal(new Set(entries.map((entry) => entry.file)).size, entries.length, 'no two entries share a file');
  for (const entry of entries) {
    const bytes = await readFile(projectFile(`public/${entry.file}`));
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', entry.file);
    assert.equal(bytes.readUInt32BE(16), entry.pixelWidth, entry.file);
    assert.equal(bytes.readUInt32BE(20), entry.pixelHeight, entry.file);
  }
  assert.deepEqual(THEMES, { light: '#ffffff', dark: '#212121' });
});

test('index.html links them all, the dark ones for a device in the dark appearance', async () => {
  const html = await readFile(projectFile('index.html'), 'utf8');
  const start = html.indexOf(START_MARKER);
  const end = html.indexOf(END_MARKER);
  assert.ok(start !== -1 && end > start);
  assert.equal(html.slice(start, end + END_MARKER.length), linkBlock(), 'run node scripts/generate-ios-splash.mjs');
  const dark = [...html.matchAll(/href="\/splash\/dark-[^"]+" media="([^"]+)"/g)];
  const light = [...html.matchAll(/href="\/splash\/light-[^"]+" media="([^"]+)"/g)];
  assert.equal(dark.length, light.length);
  assert.ok(dark.every(([, media]) => media.includes('(prefers-color-scheme: dark)')));
  assert.ok(light.every(([, media]) => media.includes('(prefers-color-scheme: light)')));
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
});
