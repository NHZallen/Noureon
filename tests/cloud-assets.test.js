import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createCloudAssetTransport } from '../src/app/sync/cloud-assets.js';

function createFixture() {
  const remoteFiles = new Map();
  const localFiles = new Map();
  const downloadCounts = new Map();
  const uploadOptions = [];
  const bucket = {
    async upload(path, blob, options = {}) {
      uploadOptions.push({ path, options });
      if (remoteFiles.has(path) && !options.upsert) return { error: { statusCode: '409', message: 'already exists' } };
      remoteFiles.set(path, blob);
      return { error: null };
    },
    async download(path) {
      downloadCounts.set(path, (downloadCounts.get(path) || 0) + 1);
      return remoteFiles.has(path)
        ? { data: remoteFiles.get(path), error: null }
        : { data: null, error: new Error('missing') };
    }
  };
  return {
    remoteFiles,
    localFiles,
    downloadCounts,
    uploadOptions,
    supabase: { storage: { from: () => bucket } },
    storage: {
      getItem: async key => localFiles.get(key) ?? null,
      setItem: async (key, value) => localFiles.set(key, value)
    }
  };
}

test('cloud assets externalize and restore data URLs and inline attachment bytes', async () => {
  const fixture = createFixture();
  const transport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto
  });
  const value = {
    avatarUrl: 'data:image/png;base64,AQID',
    part: { mimeType: 'application/pdf', data: 'BAUG' }
  };

  const cloudValue = await transport.externalize(value);
  assert.equal(fixture.remoteFiles.size, 2);
  assert.ok(cloudValue.avatarUrl.__astraCloudAsset);
  assert.ok(cloudValue.part.data.__astraCloudAsset);
  assert.deepEqual(await transport.hydrate(cloudValue), value);
});

test('cloud assets uploads are idempotent for existing hashed storage paths', async () => {
  const fixture = createFixture();
  const value = { avatarUrl: 'data:image/png;base64,AQID' };

  const firstTransport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto
  });
  await firstTransport.externalize(value);

  const secondTransport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto
  });
  await secondTransport.externalize(value);

  assert.equal(fixture.remoteFiles.size, 1);
  assert.equal(fixture.uploadOptions.length, 2);
  assert.ok(fixture.uploadOptions.every(({ options }) => options.upsert === true));
});

test('cloud assets restore generated image blobs to their IndexedDB storage key', async () => {
  const fixture = createFixture();
  const storageKey = 'generatedImage:supabase:user-1:image-1';
  fixture.localFiles.set(storageKey, new Blob([new Uint8Array([7, 8, 9])], { type: 'image/webp' }));
  const transport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto
  });
  const localValue = { generatedImage: { id: 'image-1', storageKey, mediaType: 'image/webp' } };
  const cloudValue = await transport.externalize(localValue);

  assert.ok(cloudValue.generatedImage.cloudAsset.__astraCloudAsset);
  fixture.localFiles.delete(storageKey);
  const restored = await transport.hydrate(cloudValue);
  assert.equal('cloudAsset' in restored.generatedImage, false);
  assert.deepEqual(
    new Uint8Array(await fixture.localFiles.get(storageKey).arrayBuffer()),
    new Uint8Array([7, 8, 9])
  );
});

test('missing cloud assets do not block workspace hydration or retry the same path', async () => {
  const fixture = createFixture();
  const warnings = [];
  const transport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto,
    logger: { warn: (...args) => warnings.push(args) }
  });
  const value = {
    conversations: [{
      id: 'conversation-1',
      messages: [{ role: 'user', parts: [{ inlineData: {
        mimeType: 'image/png',
        data: { __astraCloudAsset: { path: 'user-1/missing', encoding: 'base64' } }
      } }] }]
    }]
  };

  const first = await transport.hydrate(value);
  const second = await transport.hydrate(value);

  assert.equal(first.conversations[0].messages[0].parts[0].inlineData.data, null);
  assert.equal(second.conversations[0].messages[0].parts[0].inlineData.data, null);
  assert.equal(warnings.length, 1);
  assert.equal(fixture.downloadCounts.get('user-1/missing'), 1);
});
