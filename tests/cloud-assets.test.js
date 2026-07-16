import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createCloudAssetTransport } from '../src/app/sync/cloud-assets.js';

function createFixture() {
  const remoteFiles = new Map();
  const localFiles = new Map();
  const downloadCounts = new Map();
  const bucket = {
    async upload(path, blob) {
      if (remoteFiles.has(path)) return { error: { statusCode: '409', message: 'already exists' } };
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

test('cloud assets reuse a persistent download cache across transport instances', async () => {
  const fixture = createFixture();
  const path = 'user-1/persisted-asset';
  fixture.remoteFiles.set(path, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  const value = {
    part: {
      mimeType: 'image/png',
      data: { __astraCloudAsset: { path, mimeType: 'image/png', encoding: 'base64' } }
    }
  };
  const firstTransport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto
  });

  assert.equal((await firstTransport.hydrate(value, { allowNetwork: true })).part.data, 'AQID');

  const secondTransport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto
  });
  const restored = await secondTransport.hydrate(value, { allowNetwork: false });

  assert.equal(restored.part.data, 'AQID');
  assert.equal(fixture.downloadCounts.get(path), 1);
});

test('cloud assets preserve uncached markers during cache-only hydration', async () => {
  const fixture = createFixture();
  const path = 'user-1/uncached-asset';
  fixture.remoteFiles.set(path, new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' }));
  const value = {
    part: {
      mimeType: 'image/png',
      data: { __astraCloudAsset: { path, mimeType: 'image/png', encoding: 'base64' } }
    }
  };
  const transport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto
  });

  const hydrated = await transport.hydrate(value, { allowNetwork: false });

  assert.deepEqual(hydrated, value);
  assert.equal(fixture.downloadCounts.size, 0);
});

test('cloud assets prefer authenticated REST raw upload when Supabase session exists', async () => {
  const fixture = createFixture();
  let sdkUploadCalled = false;
  const requests = [];
  const transport = createCloudAssetTransport({
    ...fixture,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'session-token' } }, error: null })
      },
      storage: {
        from: () => ({
          upload: async () => {
            sdkUploadCalled = true;
            return { error: null };
          },
          download: fixture.supabase.storage.from().download
        })
      }
    },
    userId: 'user-1',
    supabaseUrl: 'https://project.supabase.co',
    supabasePublishableKey: 'publishable-key',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response('', { status: 200 });
    },
    cryptoProvider: webcrypto
  });

  const cloudValue = await transport.externalize({
    part: { mimeType: 'image/png', data: 'AQID' }
  });

  assert.equal(sdkUploadCalled, false);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/user-assets\/user-1\//);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.apikey, 'publishable-key');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer session-token');
  assert.equal(requests[0].options.headers['content-type'], 'image/png');
  assert.equal(requests[0].options.headers['cache-control'], '31536000');
  assert.equal(requests[0].options.headers['x-upsert'], 'true');
  assert.ok(requests[0].options.body instanceof Blob);
  assert.ok(cloudValue.part.data.__astraCloudAsset);
});

test('cloud assets reuse existing Storage objects after duplicate raw upload failures', async () => {
  const fixture = createFixture();
  const downloads = [];
  const transport = createCloudAssetTransport({
    ...fixture,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'session-token' } }, error: null })
      },
      storage: {
        from: () => ({
          upload: async () => assert.fail('raw upload should be used before SDK upload'),
          download: async (path) => {
            downloads.push(path);
            return { data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), error: null };
          }
        })
      }
    },
    userId: 'user-1',
    supabaseUrl: 'https://project.supabase.co',
    supabasePublishableKey: 'publishable-key',
    fetchImpl: async () => new Response(JSON.stringify({
      code: '23505',
      message: 'duplicate key value violates unique constraint "bucketid_objname"'
    }), { status: 400 }),
    cryptoProvider: webcrypto
  });

  const cloudValue = await transport.externalize({
    part: { mimeType: 'image/png', data: 'AQID' }
  });

  assert.equal(downloads.length, 0);
  assert.ok(cloudValue.part.data.__astraCloudAsset);
});

test('cloud assets verify object existence before failing ambiguous raw upload errors', async () => {
  const fixture = createFixture();
  const downloads = [];
  const transport = createCloudAssetTransport({
    ...fixture,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'session-token' } }, error: null })
      },
      storage: {
        from: () => ({
          upload: async () => assert.fail('raw upload should be used before SDK upload'),
          download: async (path) => {
            downloads.push(path);
            return { data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), error: null };
          }
        })
      }
    },
    userId: 'user-1',
    supabaseUrl: 'https://project.supabase.co',
    supabasePublishableKey: 'publishable-key',
    fetchImpl: async () => new Response('<html><body><h1>400 Bad Request</h1></body></html>', { status: 400 }),
    cryptoProvider: webcrypto
  });

  const cloudValue = await transport.externalize({
    part: { mimeType: 'image/png', data: 'AQID' }
  });

  assert.equal(downloads.length, 1);
  assert.match(downloads[0], /^user-1\//);
  assert.ok(cloudValue.part.data.__astraCloudAsset);
});

test('cloud assets do not create remote markers when authenticated REST upload fails', async () => {
  const fixture = createFixture();
  const transport = createCloudAssetTransport({
    ...fixture,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'session-token' } }, error: null })
      },
      storage: fixture.supabase.storage
    },
    userId: 'user-1',
    supabaseUrl: 'https://project.supabase.co',
    supabasePublishableKey: 'publishable-key',
    fetchImpl: async () => new Response('<html><body><h1>400 Bad Request</h1></body></html>', { status: 400 }),
    cryptoProvider: webcrypto
  });

  await assert.rejects(
    () => transport.externalize({ part: { mimeType: 'image/png', data: 'AQID' } }),
    /400 Bad Request/
  );
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

test('cloud assets prefer an existing generated image blob over Storage download', async () => {
  const fixture = createFixture();
  const storageKey = 'generatedImage:supabase:user-1:image-existing';
  fixture.localFiles.set(storageKey, new Blob([new Uint8Array([9, 8, 7])], { type: 'image/webp' }));
  const transport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto
  });
  const value = {
    generatedImage: {
      id: 'image-existing',
      storageKey,
      mediaType: 'image/webp',
      cloudAsset: {
        __astraCloudAsset: {
          path: 'user-1/generated-image-existing',
          mimeType: 'image/webp',
          encoding: 'blob'
        }
      }
    }
  };

  const hydrated = await transport.hydrate(value, { allowNetwork: true });

  assert.equal('cloudAsset' in hydrated.generatedImage, false);
  assert.equal(fixture.downloadCounts.size, 0);
});

test('missing cloud assets preserve their retry marker without retrying the same path in-session', async () => {
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

  assert.deepEqual(
    first.conversations[0].messages[0].parts[0].inlineData.data,
    value.conversations[0].messages[0].parts[0].inlineData.data
  );
  assert.deepEqual(
    second.conversations[0].messages[0].parts[0].inlineData.data,
    value.conversations[0].messages[0].parts[0].inlineData.data
  );
  assert.equal(warnings.length, 1);
  assert.equal(fixture.downloadCounts.get('user-1/missing'), 1);
});

test('missing generated image assets keep their cloud marker for a later retry', async () => {
  const fixture = createFixture();
  const transport = createCloudAssetTransport({
    ...fixture,
    userId: 'user-1',
    cryptoProvider: webcrypto,
    logger: { warn() {} }
  });
  const cloudAsset = {
    __astraCloudAsset: {
      path: 'user-1/missing-generated-image',
      mimeType: 'image/png',
      encoding: 'blob'
    }
  };
  const value = {
    conversations: [{
      id: 'conversation-1',
      messages: [{ role: 'model', parts: [{ generatedImage: {
        id: 'image-1',
        storageKey: 'generatedImage:supabase:user-1:image-1',
        cloudAsset
      } }] }]
    }]
  };

  const hydrated = await transport.hydrate(value);

  assert.deepEqual(
    hydrated.conversations[0].messages[0].parts[0].generatedImage.cloudAsset,
    cloudAsset
  );
  assert.equal(fixture.downloadCounts.get('user-1/missing-generated-image'), 1);
});
