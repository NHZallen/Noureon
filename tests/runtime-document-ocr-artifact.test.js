import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  createEncryptedOcrArtifact,
  extractionContainsOcr,
  readEncryptedOcrArtifact
} from '../src/app/runtime/documents/document-ocr-artifact.js';
import { createSyncVaultRecord } from '../src/app/sync/sync-vault.js';

test('OCR artifacts encrypt extraction text and require an unlocked vault key', async () => {
  const { key } = await createSyncVaultRecord('a-strong-test-password', { cryptoProvider: webcrypto, iterations: 1 });
  const extraction = {
    method: 'pdf-hybrid',
    pages: [{ page: 1, extractionMethod: 'ocr' }],
    sections: [{ text: 'Sensitive OCR text', sourceLocator: { type: 'pdf', page: 1 } }]
  };
  const artifact = await createEncryptedOcrArtifact({
    documentHash: 'document-hash', extraction, vaultKey: key, cryptoProvider: webcrypto
  });
  assert.equal(artifact.data.includes('Sensitive OCR text'), false);
  assert.deepEqual(await readEncryptedOcrArtifact({ artifact, vaultKey: null, cryptoProvider: webcrypto }), { locked: true });
  const restored = await readEncryptedOcrArtifact({ artifact, vaultKey: key, cryptoProvider: webcrypto });
  assert.equal(restored.payload.documentHash, 'document-hash');
  assert.deepEqual(restored.payload.extraction, extraction);
  assert.equal(extractionContainsOcr(extraction), true);
});
test('OCR artifact integrity rejects modified ciphertext containers', async () => {
  const { key } = await createSyncVaultRecord('another-test-password', { cryptoProvider: webcrypto, iterations: 1 });
  const artifact = await createEncryptedOcrArtifact({
    documentHash: 'hash', extraction: { method: 'pdf-hybrid', sections: [] }, vaultKey: key, cryptoProvider: webcrypto
  });
  await assert.rejects(
    () => readEncryptedOcrArtifact({ artifact: { ...artifact, contentHash: 'wrong' }, vaultKey: key, cryptoProvider: webcrypto }),
    /integrity check failed/
  );
});
