import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

async function readPngDimensions(path) {
  const bytes = await readFile(projectFile(path));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

test('login header uses the project logo instead of the robot mark', async () => {
  const shell = await readFile(projectFile('src/templates/fragments/00-shell.fragment.js'), 'utf8');

  assert.match(shell, /\/logo\.png/);
  assert.doesNotMatch(shell, /M12 8V4H8/);
});

test('English and Traditional Chinese READMEs display the project logo', async () => {
  const englishReadme = await readFile(projectFile('README.md'), 'utf8');
  const chineseReadme = await readFile(projectFile('README.zh-TW.md'), 'utf8');

  assert.match(englishReadme, /<img src="\.\/public\/logo\.png" alt="AstraChat logo"/);
  assert.match(chineseReadme, /<img src="\.\/public\/logo\.png" alt="AstraChat logo"/);
});

test('project logo and PWA icons have their declared square dimensions', async () => {
  assert.deepEqual(await readPngDimensions('public/logo.png'), { width: 1024, height: 1024 });
  assert.deepEqual(await readPngDimensions('public/icon-192.png'), { width: 192, height: 192 });
  assert.deepEqual(await readPngDimensions('public/icon-512.png'), { width: 512, height: 512 });
});

test('service worker refreshes and precaches the new logo asset', async () => {
  const serviceWorker = await readFile(projectFile('public/service-worker.js'), 'utf8');

  assert.match(serviceWorker, /astra-chat-vite-cache-v2/);
  assert.match(serviceWorker, /'\/logo\.png'/);
});
