import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateAvatarSource,
  verifyDataImageDecode,
  validateBackupAstraAvatars,
  validateDataImageUrl,
  validateImageBase64
} from '../src/app/runtime/security/image-content-validation.js';

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlXcAAAAASUVORK5CYII=';

test('validates PNG data URLs from decoded bytes and dimensions', () => {
  const source = `data:image/png;base64,${PNG_1X1_BASE64}`;
  const result = validateDataImageUrl(source);

  assert.equal(result, source);
  const metadata = validateImageBase64({ base64: PNG_1X1_BASE64, mimeType: 'image/png' });
  assert.equal(metadata.width, 1);
  assert.equal(metadata.height, 1);
  assert.equal(metadata.bytes.length > 24, true);
});

test('rejects active image formats, MIME spoofing, and unsafe URL schemes', () => {
  const svg = btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

  assert.throws(() => validateDataImageUrl(`data:image/svg+xml;base64,${svg}`), /not allowed/);
  assert.throws(
    () => validateImageBase64({ base64: PNG_1X1_BASE64, mimeType: 'image/jpeg' }),
    (error) => error.code === 'IMAGE_MIME_MISMATCH'
  );
  assert.throws(() => validateAvatarSource('javascript:alert(1)'), /scheme is not allowed/);
  assert.throws(() => validateAvatarSource('data:text/html;base64,PGgxPng8L2gxPg=='), /data URL is invalid/);
});

test('rejects oversized decoded data and excessive image dimensions', () => {
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
  assert.throws(
    () => validateImageBase64({ base64: oversized, mimeType: 'image/png' }),
    (error) => error.code === 'IMAGE_SIZE_LIMIT'
  );

  const bytes = Buffer.from(PNG_1X1_BASE64, 'base64');
  bytes.writeUInt32BE(5000, 16);
  assert.throws(
    () => validateImageBase64({ base64: bytes.toString('base64'), mimeType: 'image/png' }),
    (error) => error.code === 'IMAGE_DIMENSION_LIMIT'
  );
});

test('prevalidates ZIP avatar content before import mutation', async () => {
  const backup = { astras: [{ id: 'a-1', _avatarZipRef: 'images/avatar.png' }] };
  const zip = {
    file: (name) => name === 'images/avatar.png'
      ? { async: async (format) => format === 'base64' ? PNG_1X1_BASE64 : null }
      : null
  };

  await validateBackupAstraAvatars(backup, zip);

  assert.equal(backup.astras[0].avatarUrl, `data:image/png;base64,${PNG_1X1_BASE64}`);
  assert.equal('_avatarZipRef' in backup.astras[0], false);
});

test('uses the platform decoder and rejects decode or dimension mismatches', async () => {
  const source = `data:image/png;base64,${PNG_1X1_BASE64}`;
  let closed = false;
  await verifyDataImageDecode(source, {
    createImageBitmapImpl: async () => ({ width: 1, height: 1, close: () => { closed = true; } }),
    BlobCtor: Blob
  });
  assert.equal(closed, true);

  await assert.rejects(
    verifyDataImageDecode(source, {
      createImageBitmapImpl: async () => { throw new Error('decode failed'); },
      BlobCtor: Blob
    }),
    (error) => error.code === 'IMAGE_DECODE_FAILED'
  );
  await assert.rejects(
    verifyDataImageDecode(source, {
      createImageBitmapImpl: async () => ({ width: 2, height: 1, close() {} }),
      BlobCtor: Blob
    }),
    (error) => error.code === 'IMAGE_DIMENSION_MISMATCH'
  );
});
