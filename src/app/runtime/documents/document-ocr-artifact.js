import { decryptSyncVaultPayload, encryptSyncVaultPayload } from '../../sync/sync-vault.js';
import { DOCUMENT_EXTRACTION_VERSION, sha256Hex } from './document-schema.js';

export const OCR_ARTIFACT_VERSION = 1;
export const OCR_ARTIFACT_MIME_TYPE = 'application/vnd.noureon.document-ocr+json';

const bytesToBase64 = bytes => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = value => {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

export async function createEncryptedOcrArtifact({
  documentHash,
  extraction,
  vaultKey,
  extractionVersion = DOCUMENT_EXTRACTION_VERSION,
  cryptoProvider = globalThis.crypto
} = {}) {
  if (!documentHash || !extraction || !vaultKey) throw new TypeError('Encrypted OCR artifacts require documentHash, extraction, and an unlocked vault key.');
  const payload = {
    artifactVersion: OCR_ARTIFACT_VERSION,
    extractionVersion,
    documentHash,
    extraction
  };
  const encrypted = await encryptSyncVaultPayload(payload, vaultKey, { cryptoProvider });
  const serialized = JSON.stringify(encrypted);
  return {
    version: OCR_ARTIFACT_VERSION,
    mimeType: OCR_ARTIFACT_MIME_TYPE,
    encoding: 'base64-json',
    contentHash: await sha256Hex(serialized, cryptoProvider),
    data: bytesToBase64(new TextEncoder().encode(serialized))
  };
}
export async function readEncryptedOcrArtifact({ artifact, vaultKey, cryptoProvider = globalThis.crypto } = {}) {
  if (!artifact?.data || artifact.mimeType !== OCR_ARTIFACT_MIME_TYPE) return null;
  if (!vaultKey) return { locked: true };
  const serialized = new TextDecoder().decode(base64ToBytes(artifact.data));
  const contentHash = await sha256Hex(serialized, cryptoProvider);
  if (artifact.contentHash && contentHash !== artifact.contentHash) throw new Error('OCR artifact integrity check failed.');
  const payload = await decryptSyncVaultPayload(JSON.parse(serialized), vaultKey, { cryptoProvider });
  if (payload?.artifactVersion !== OCR_ARTIFACT_VERSION) throw new Error('Unsupported OCR artifact version.');
  return { locked: false, payload };
}

export function extractionContainsOcr(extraction = {}) {
  return extraction.method === 'pdf-hybrid'
    || (extraction.pages || []).some(page => page.extractionMethod === 'ocr' || page.extractionMethod === 'hybrid');
}
