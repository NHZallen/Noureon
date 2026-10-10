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

  // The mark of the home page is the project logo cropped to its ring (public/home/logo-mark.png).
  assert.match(shell, /\/home\/logo-mark\.png/);
  assert.doesNotMatch(shell, /M12 8V4H8/);
});

test('English and Traditional Chinese READMEs display the project logo', async () => {
  const englishReadme = await readFile(projectFile('README.md'), 'utf8');
  const chineseReadme = await readFile(projectFile('README.zh-TW.md'), 'utf8');

  for (const readme of [englishReadme, chineseReadme]) {
    assert.match(readme, /<img src="\.\/public\/logo\.png" alt="Noureon logo" width="220">/);
    assert.match(readme, /<h1 align="center">Noureon<\/h1>/);
  }
});

test('project logo and PWA icons have their declared square dimensions', async () => {
  assert.deepEqual(await readPngDimensions('public/logo.png'), { width: 640, height: 640 });
  assert.deepEqual(await readPngDimensions('public/icon-192.png'), { width: 192, height: 192 });
  assert.deepEqual(await readPngDimensions('public/icon-512.png'), { width: 512, height: 512 });
});

test('service worker refreshes and precaches the new logo asset', async () => {
  const serviceWorker = await readFile(projectFile('public/service-worker.js'), 'utf8');

  assert.match(serviceWorker, /noureon-cache-[\s\S]*v24/);
  assert.match(serviceWorker, /'\/logo\.png'/);
  const manifest = JSON.parse(await readFile(projectFile('public/manifest.json'), 'utf8'));
  assert.equal('orientation' in manifest, false);
});

test('the dark manifest is the manifest with the dark colours, and the dark theme links it before the first paint', async () => {
  const light = JSON.parse(await readFile(projectFile('public/manifest.json'), 'utf8'));
  const dark = JSON.parse(await readFile(projectFile('public/manifest-dark.json'), 'utf8'));
  assert.deepEqual({ ...dark, background_color: light.background_color, theme_color: light.theme_color }, light, 'only the two colours differ');
  assert.equal(dark.background_color, '#212121');
  assert.equal(dark.theme_color, '#212121');
  const init = await readFile(projectFile('public/theme-init.js'), 'utf8');
  assert.match(init, /manifest\.href\s*=\s*'\/manifest-dark\.json'/);
  const index = await readFile(projectFile('index.html'), 'utf8');
  assert.match(index, /html\[data-theme="dark"\]\s*\[data-startup-skeleton\]\s*\{[^}]*background:\s*#212121/, 'the start-up screen is dark too');
});
