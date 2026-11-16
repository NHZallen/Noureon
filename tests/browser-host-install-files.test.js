// The installer copies a fixed list of files (SERVICE_FILES in browser-host/install.sh). A module that main.mjs needs and that is not in the list would stop the service at its start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dir = new URL('../browser-host/', import.meta.url);
const listed = new Set(/^SERVICE_FILES="([^"]+)"/m.exec(readFileSync(new URL('install.sh', dir), 'utf8'))[1].split(/\s+/));

test('every file the host service imports, from main.mjs on, is installed', () => {
  const seen = new Set();
  const walk = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const text = readFileSync(new URL(name, dir), 'utf8');
    for (const match of text.matchAll(/(?:from|import\()\s*'\.\/([\w.-]+\.mjs)'/g)) walk(match[1]);
  };
  walk('main.mjs');
  const missing = [...seen].filter((name) => !listed.has(name));
  assert.deepEqual(missing, []);
  assert.ok(seen.has('live-proxy.mjs') && seen.has('neko-api.mjs'));
});
