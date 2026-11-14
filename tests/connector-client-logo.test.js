import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

// Vercel's MCP login reads our client description document (CIMD) and refuses a logo over 100 KB,
// so the logo named in it must be the small file, and the three places that name it must agree.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the client description names a logo that is a PNG under 100 KB', () => {
  const document = JSON.parse(read('public/.well-known/oauth-client.json'));
  assert.equal(document.logo_uri, 'https://noureon.com/logo-small.png');
  const file = new URL('../public/logo-small.png', import.meta.url);
  assert.ok(statSync(file).size < 100 * 1024, 'logo-small.png must stay under 100 KB');
  assert.equal(readFileSync(file).subarray(1, 4).toString('latin1'), 'PNG');
});

test('the server documents (test site and connector identity) name the same small logo', () => {
  assert.match(read('server/app.js'), /logo_uri: `\$\{config\.siteUrl\}\/logo-small\.png`/);
  assert.match(read('server/main.js'), /logoUri: `\$\{config\.siteUrl\}\/logo-small\.png`/);
});
