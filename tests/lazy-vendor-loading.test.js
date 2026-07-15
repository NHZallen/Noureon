import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { installVendorBridge } from '../src/app/bootstrap/vendor-bridge.js';
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

test('vendor bridge stays eager-free and memoizes compatibility handoffs', async () => {
  const globalNames = [
    'marked',
    'DOMPurify',
    'Chart',
    'Cropper',
    'katex',
    'JSZip',
    'Peer',
    'QRCode',
    'Html5Qrcode',
    'loadArchiveVendor',
    'loadSharingVendor'
  ];
  const previousGlobals = new Map(
    globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  );
  let archiveLoads = 0;
  let sharingLoads = 0;
  class FakeJSZip {}
  class FakePeer {}
  class FakeScanner {}
  const QRCodeGenerator = { toCanvas: async () => {} };

  try {
    installVendorBridge({
      marked: {},
      DOMPurify: {},
      Chart: class {},
      Cropper: class {},
      katex: {},
      loadArchiveVendor: async () => {
        archiveLoads += 1;
        return FakeJSZip;
      },
      loadSharingVendor: async () => {
        sharingLoads += 1;
        return { Peer: FakePeer, QRCodeGenerator, Html5Qrcode: FakeScanner };
      }
    });

    assert.equal(archiveLoads, 0);
    assert.equal(sharingLoads, 0);

    const firstArchiveLoad = globalThis.loadArchiveVendor();
    assert.strictEqual(globalThis.loadArchiveVendor(), firstArchiveLoad);
    assert.strictEqual(await firstArchiveLoad, FakeJSZip);
    assert.strictEqual(globalThis.JSZip, FakeJSZip);
    assert.equal(archiveLoads, 1);

    const firstSharingLoad = globalThis.loadSharingVendor();
    assert.strictEqual(globalThis.loadSharingVendor(), firstSharingLoad);
    const sharingVendors = await firstSharingLoad;
    assert.strictEqual(sharingVendors.Peer, FakePeer);
    assert.strictEqual(sharingVendors.Html5Qrcode, FakeScanner);
    assert.strictEqual(globalThis.Peer, FakePeer);
    assert.strictEqual(globalThis.QRCode, sharingVendors.QRCode);
    assert.equal(sharingLoads, 1);
  } finally {
    for (const [name, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('P2P and archive packages are dynamic-only and absent from main static imports', () => {
  const mainSource = readSource('src/main.js');
  const sharingLoaderSource = readSource('src/app/vendors/sharing-vendor.js');
  const archiveLoaderSource = readSource('src/app/vendors/archive-vendor.js');
  const p2pSource = readSource('src/app/runtime/features/p2p-lifecycle.js');
  const importExportSource = readSource('src/app/runtime/features/import-export-lifecycle.js');
  const authImportSource = readSource('src/app/runtime/features/auth-import-lifecycle.js');

  for (const packageName of ['peerjs', 'qrcode', 'html5-qrcode', 'jszip']) {
    assert.doesNotMatch(
      mainSource,
      new RegExp(`(?:from\\s+|import\\s*)['"]${packageName}['"]`),
      `${packageName} should not be imported statically by main`
    );
  }

  assert.match(mainSource, /from '\.\/app\/vendors\/sharing-vendor\.js'/);
  assert.match(mainSource, /from '\.\/app\/vendors\/archive-vendor\.js'/);
  assert.match(sharingLoaderSource, /import\('peerjs'\)/);
  assert.match(sharingLoaderSource, /import\('qrcode'\)/);
  assert.match(sharingLoaderSource, /import\('html5-qrcode'\)/);
  assert.match(archiveLoaderSource, /import\('jszip'\)/);

  assert.match(p2pSource, /function initP2P[\s\S]*requireSharingVendors\(\)/);
  assert.match(p2pSource, /async function setupSenderConnection[\s\S]*await requireArchiveVendor\(\)/);
  assert.match(importExportSource, /const JSZipCtor = await requireArchiveVendor\(\)/);
  assert.match(authImportSource, /const JSZipCtor = await requireArchiveVendor\(\)/);
});
