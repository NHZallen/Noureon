import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const UPDATE_LOG_COUNT = 83;
const LATEST_UPDATE_VERSION = '16.4.5';
const UPDATE_LOGS_CONTENT_HASH = '7a2c0dd3e3f7c5f7a84795587e5a122fe27ec0076c84849f5e97ac6b05346cee';

const hashLogs = (logs) => createHash('sha256').update(JSON.stringify(logs)).digest('hex');

test('update logs compatibility entry exports logs and preserves the global side effect', async () => {
  delete globalThis.updateLogs;

  const module = await import(`../src/data/update-logs.js?test=${Date.now()}`);
  const exportedLogs = module.default;

  assert.ok(Array.isArray(exportedLogs));
  assert.equal(module.updateLogs, exportedLogs);
  assert.equal(globalThis.updateLogs, exportedLogs);
  assert.equal(exportedLogs.length, UPDATE_LOG_COUNT);
  assert.equal(exportedLogs[0].version, LATEST_UPDATE_VERSION);
  assert.equal(hashLogs(exportedLogs), UPDATE_LOGS_CONTENT_HASH);
});

test('update log entries keep the required data shape', async () => {
  const { default: updateLogs } = await import(`../src/data/update-logs.js?shape=${Date.now()}`);

  for (const [index, log] of updateLogs.entries()) {
    assert.equal(typeof log.version, 'string', `log ${index} should include a version string`);
    assert.equal(typeof log.date, 'string', `log ${index} should include a date string`);
    assert.ok(Array.isArray(log.content), `log ${index} should include content entries`);
    log.content.forEach((entry, entryIndex) => {
      assert.equal(typeof entry, 'string', `log ${index} content ${entryIndex} should be a string`);
    });
  }
});
