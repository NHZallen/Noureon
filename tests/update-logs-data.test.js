import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { PRODUCT_VERSION } from '../src/data/version.js';

const UPDATE_LOG_COUNT = 112;
// Derived, not copied: the newest update-log entry is by definition the product version.
const LATEST_UPDATE_VERSION = PRODUCT_VERSION;
const UPDATE_LOGS_CONTENT_HASH = 'a6560e21ca8df2ff09e334e3d5a05127805f695ae25b8bf8ed6e2dab664a8325';

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
