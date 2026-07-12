import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExternalDataValidationError,
  parseExternalJson,
  sanitizeExternalJson,
  validateExternalBackup,
  validateExternalAstra,
  validateExternalAuthBackup,
  validateExternalConversation,
  validateExternalFolder,
  validateZipFileCount
} from '../src/app/runtime/security/external-data-validation.js';

test('external Astra validation normalizes supported fields and removes unknown fields', () => {
  const astra = validateExternalAstra({
    id: ' astra-1 ',
    name: ' Nova ',
    description: 'Helper',
    instructions: 'Be useful',
    avatarUrl: null,
    officialId: 'untrusted-official-id',
    unexpected: 'discard me'
  });

  assert.deepEqual(astra, {
    id: 'astra-1',
    name: 'Nova',
    description: 'Helper',
    instructions: 'Be useful',
    avatarUrl: null,
    officialId: null
  });
});

test('external data rejects dangerous keys at any depth', () => {
  const payload = JSON.parse('{"safe":{"__proto__":{"polluted":true}}}');

  assert.throws(
    () => sanitizeExternalJson(payload),
    (error) => error instanceof ExternalDataValidationError
      && error.code === 'FORBIDDEN_KEY'
      && error.path === '$.safe.__proto__'
  );
  assert.equal(Object.prototype.polluted, undefined);
});

test('external record schemas reject wrong types and excessive field lengths', () => {
  assert.throws(() => validateExternalAstra({ id: 'a', name: '' }), /length is outside/);
  assert.throws(() => validateExternalFolder({ name: 'Folder', conversationIds: 'not-an-array' }), /must be an array/);
  assert.throws(() => validateExternalConversation({ id: 'c', title: 'x'.repeat(501) }), /length is outside/);
});

test('JSON parsing enforces byte limits before parsing', () => {
  assert.throws(
    () => parseExternalJson(JSON.stringify({ value: 'éééé' }), { maxBytes: 10 }),
    (error) => error.code === 'JSON_SIZE_LIMIT'
  );
  assert.equal(parseExternalJson('{"ok":true}').value.ok, true);
});

test('ZIP validation rejects excessive file counts', () => {
  const zip = {
    files: Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`file-${index}.json`, { dir: false }]))
  };

  assert.throws(
    () => validateZipFileCount(zip),
    (error) => error.code === 'ZIP_FILE_LIMIT'
  );
});

test('ZIP validation rejects traversal paths and declared expanded-size abuse', () => {
  assert.throws(
    () => validateZipFileCount({ files: { '../data.json': { dir: false } } }),
    (error) => error.code === 'ZIP_PATH'
  );
  assert.throws(
    () => validateZipFileCount({
      files: { 'images/huge.png': { dir: false, _data: { uncompressedSize: 17 * 1024 * 1024 } } }
    }),
    (error) => error.code === 'ZIP_ENTRY_SIZE'
  );
});

test('backup validation supplies legacy defaults before import loops run', () => {
  const backup = validateExternalBackup({
    conversations: [{ id: 'conv-1' }],
    folders: [{ id: 'folder-1' }],
    astras: [{ id: 'astra-1' }]
  });

  assert.deepEqual(backup.conversations[0].messages, []);
  assert.equal(backup.folders[0].name, 'Folder');
  assert.deepEqual(backup.folders[0].conversationIds, []);
  assert.equal(backup.astras[0].name, 'Noura');
});

test('auth backup validation preserves only bounded credential data', () => {
  const backup = validateExternalAuthBackup({
    backup_identity: { username: ' alice ', exportedAt: '2026-07-12' },
    user_credentials: { passwordHash: 'hash:secret', recoverySecret: 'discarded' },
    conversations: []
  });

  assert.equal(backup.backup_identity.username, 'alice');
  assert.equal(backup.user_credentials.passwordHash, 'hash:secret');
  assert.equal('recoverySecret' in backup.user_credentials, false);
});
