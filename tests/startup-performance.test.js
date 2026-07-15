import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  STARTUP_MARKS,
  STARTUP_MEASURES,
  markStartup,
  measureStartup
} from '../src/app/bootstrap/startup-performance.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test('startup performance helper records fixed, content-free entries', () => {
  const calls = [];
  const performanceTarget = {
    mark: (name) => calls.push(['mark', name]),
    measure: (name, startMark, endMark) => {
      calls.push(['measure', name, startMark, endMark]);
    }
  };

  assert.equal(markStartup(STARTUP_MARKS.BOOTSTRAP_START, performanceTarget), true);
  assert.equal(measureStartup(
    STARTUP_MEASURES.TO_SHELL,
    STARTUP_MARKS.BOOTSTRAP_START,
    STARTUP_MARKS.SHELL_MOUNTED,
    performanceTarget
  ), true);
  assert.deepEqual(calls, [
    ['mark', 'noureon:bootstrap-start'],
    [
      'measure',
      'noureon:bootstrap-to-shell',
      'noureon:bootstrap-start',
      'noureon:shell-mounted'
    ]
  ]);

  for (const entryName of [
    ...Object.values(STARTUP_MARKS),
    ...Object.values(STARTUP_MEASURES)
  ]) {
    assert.match(entryName, /^noureon:[a-z-]+$/);
  }
});

test('startup performance helper is a no-op when the API is unavailable or rejects an entry', () => {
  assert.equal(markStartup(STARTUP_MARKS.BOOTSTRAP_START, null), false);
  assert.equal(measureStartup(
    STARTUP_MEASURES.TO_SHELL,
    STARTUP_MARKS.BOOTSTRAP_START,
    STARTUP_MARKS.SHELL_MOUNTED,
    null
  ), false);

  const throwingPerformance = {
    mark() {
      throw new Error('marks unavailable');
    },
    measure() {
      throw new Error('marks missing');
    }
  };

  assert.doesNotThrow(() => markStartup(STARTUP_MARKS.BOOTSTRAP_START, throwingPerformance));
  assert.equal(markStartup(STARTUP_MARKS.BOOTSTRAP_START, throwingPerformance), false);
  assert.doesNotThrow(() => measureStartup(
    STARTUP_MEASURES.TO_SHELL,
    STARTUP_MARKS.BOOTSTRAP_START,
    STARTUP_MARKS.SHELL_MOUNTED,
    throwingPerformance
  ));
  assert.equal(measureStartup(
    STARTUP_MEASURES.TO_SHELL,
    STARTUP_MARKS.BOOTSTRAP_START,
    STARTUP_MARKS.SHELL_MOUNTED,
    throwingPerformance
  ), false);
  assert.equal(markStartup('', throwingPerformance), false);
});

test('main records local interactivity before starting non-blocking cloud sync', () => {
  const mainSource = readFileSync(projectFile('src/main.js'), 'utf8');
  const orderedMarkers = [
    'markStartup(STARTUP_MARKS.BOOTSTRAP_START)',
    'installVendorBridge({',
    'mountAppShell(appShell)',
    'STARTUP_MARKS.SHELL_MOUNTED',
    'const startupDataReady = Promise.all([',
    "import('./data/i18n.js')",
    "import('./data/demo-conversations.js')",
    "import('./data/astras-data.js')",
    "import('./data/update-logs.js')",
    "loadVendorScript('/vendor/mhchem.min.js')",
    'STARTUP_MARKS.STARTUP_DATA_READY',
    'const identityAndRequiredAuthReady = resolveStartupIdentity()',
    'STARTUP_MARKS.IDENTITY_RESOLVED',
    "startupIdentity.mode === 'local'",
    'await initializeStartupAuthBridge({ window, document, startupIdentity })',
    'const [{ auth, startupIdentity }] = await Promise.all([',
    'identityAndRequiredAuthReady',
    'startupDataReady',
    'const cloudSyncBootstrapQueue =',
    "await import('./app/legacy-app.js')",
    'await legacyApp.legacyAppReady',
    'dismissStartupSkeleton(document)',
    'STARTUP_MARKS.RUNTIME_INTERACTIVE',
    'void initializeLocalAuthBridgeInBackground({ window, document, startupIdentity })',
    'markStartup(STARTUP_MARKS.CLOUD_SYNC_START)',
    'retryAsync(async () =>',
    "import('./app/sync/cloud-workspace-sync.js')",
    'initializeCloudWorkspaceSync({',
    'window.__astraCloudWorkspaceSyncReady = cloudSyncReady',
    'markStartup(STARTUP_MARKS.CLOUD_SYNC_READY)'
  ];

  let cursor = -1;
  for (const marker of orderedMarkers) {
    const next = mainSource.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `expected main bootstrap to contain ${marker}`);
    assert.ok(next > cursor, `${marker} should preserve startup order`);
    cursor = next;
  }
});
