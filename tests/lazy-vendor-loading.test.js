import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { createQrCodeClass } from '../src/app/vendors/sharing-vendor.js';
import { createDom } from './behaviours/helpers/create-dom.js';
import { createMemoizedVendorLoader } from '../src/app/vendors/memoized-vendor-loader.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('memoized vendor loaders share concurrent work and retry after a failed load', async () => {
  let resolveLoad;
  let loadCalls = 0;
  const loadedVendor = { name: 'vendor' };
  const loader = createMemoizedVendorLoader(() => {
    loadCalls += 1;
    return new Promise((resolve) => {
      resolveLoad = resolve;
    });
  });

  const firstLoad = loader();
  const secondLoad = loader();
  assert.strictEqual(firstLoad, secondLoad);
  assert.equal(loadCalls, 0, 'vendor work should start in a microtask');

  await Promise.resolve();
  assert.equal(loadCalls, 1);
  resolveLoad(loadedVendor);
  assert.strictEqual(await firstLoad, loadedVendor);
  assert.strictEqual(loader(), firstLoad);

  let attempts = 0;
  const retryingLoader = createMemoizedVendorLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary chunk failure');
    return loadedVendor;
  });

  await assert.rejects(retryingLoader(), /temporary chunk failure/);
  assert.strictEqual(await retryingLoader(), loadedVendor);
  assert.equal(attempts, 2);
});

test('the QR code of a share is drawn on a canvas in its container, black on white', async () => {
  const { document, cleanup } = createDom('<div id="qr"></div>');
  const previousDocument = globalThis.document;
  globalThis.document = document;
  try {
    const drawn = [];
    const QRCode = createQrCodeClass({ toCanvas: async (canvas, text, options) => drawn.push([canvas.width, canvas.height, text, options.color]) });
    new QRCode(document.getElementById('qr'), { text: 'astra-p2p-ABC', width: 128 });
    await Promise.resolve();
    assert.equal(document.querySelectorAll('#qr canvas').length, 1);
    assert.deepEqual(drawn, [[128, 128, 'astra-p2p-ABC', { dark: '#000000', light: '#ffffff' }]]);
  } finally {
    globalThis.document = previousDocument;
    cleanup();
  }
});

// The libraries are imported by the modules that use them, or loaded by their loaders (app/vendors/); none is put on globalThis
// for other code to find (NOU-79). KaTeX is the one script whose own global is read, by its loader only: mhchem extends it.
test('no source code reads a library from globalThis', () => {
  const names = 'marked|DOMPurify|Chart|Cropper|katex|JSZip|Peer|QRCode|Html5Qrcode|loadArchiveVendor|loadSharingVendor';
  const pattern = new RegExp(`(?:globalThis|window)\\??\\.(?:${names})\\b|\\}\\s*=\\s*globalThis\\s*;`);
  const files = readdirSync(projectFile('src'), { recursive: true })
    .filter((name) => name.endsWith('.js') && !name.endsWith('katex-vendor.js'));
  const offenders = files.filter((name) => pattern.test(readSource(`src/${name}`)));
  assert.deepEqual(offenders, []);
  assert.match(readSource('src/app/vendors/katex-vendor.js'), /globalThis\.katex/);
  assert.equal(existsSync(projectFile('src/app/bootstrap/vendor-bridge.js')), false);
});

test('P2P and archive packages are dynamic-only and absent from main static imports', () => {
  const mainSource = readSource('src/main.js');
  const sharingLoaderSource = readSource('src/app/vendors/sharing-vendor.js');
  const archiveLoaderSource = readSource('src/app/vendors/archive-vendor.js');
  const p2pSource = readSource('src/app/runtime/features/p2p-lifecycle.js');
  const importExportSource = readSource('src/app/runtime/features/import-export-lifecycle.js');
  const authImportSource = readSource('src/app/runtime/features/auth-import-lifecycle.js');

  for (const packageName of ['peerjs', 'qrcode', 'jsqr', 'jszip']) {
    assert.doesNotMatch(
      mainSource,
      new RegExp(`(?:from\\s+|import\\s*)['"]${packageName}['"]`),
      `${packageName} should not be imported statically by main`
    );
  }

  assert.match(readSource('src/app/runtime/legacy-core/legacy-core.js'), /from '\/src\/app\/vendors\/sharing-vendor\.js'/);
  assert.match(mainSource, /from '\.\/app\/vendors\/archive-vendor\.js'/);
  assert.match(sharingLoaderSource, /import\('peerjs'\)/);
  assert.match(sharingLoaderSource, /import\('qrcode'\)/);
  assert.match(sharingLoaderSource, /import\('\.\/qr-scanner\.js'\)/);
  assert.match(readSource('src/app/vendors/qr-scanner.js'), /import\('jsqr'\)/);
  assert.match(archiveLoaderSource, /import\('jszip'\)/);

  assert.match(p2pSource, /function initP2P[\s\S]*requireSharingVendors\(\)/);
  assert.match(p2pSource, /async function setupSenderConnection[\s\S]*await requireArchiveVendor\(\)/);
  assert.match(importExportSource, /const JSZipCtor = await requireArchiveVendor\(\)/);
  assert.match(authImportSource, /const JSZipCtor = await requireArchiveVendor\(\)/);
});
