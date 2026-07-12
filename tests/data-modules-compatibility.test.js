import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const EXPECTED_DATA_IMPORT_ORDER = [
  './data/i18n.js',
  './data/demo-conversations.js',
  './data/astras-data.js',
  './data/update-logs.js'
];
const EXPECTED_DEMO_CONVERSATION_KEYS = ['proMax', 'proPV', 'pro', 'plusPV', 'mini', 'mill', 'nano'];
const EXPECTED_ASTRA_COUNT = 11;
const EXPECTED_FIRST_ASTRA_ID = 'official-writer-01';
const EXPECTED_UPDATE_LOG_COUNT = 83;
const EXPECTED_LATEST_UPDATE_VERSION = '16.4.5';
const GLOBAL_KEYS_TO_RESTORE = ['window', 'i18n', 'demoConversations', 'OFFICIAL_ASTRAS', 'updateLogs'];

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

const snapshotGlobals = () => new Map(GLOBAL_KEYS_TO_RESTORE.map((key) => [
  key,
  {
    exists: Object.prototype.hasOwnProperty.call(globalThis, key),
    value: globalThis[key]
  }
]));

const restoreGlobals = (snapshot) => {
  for (const [key, state] of snapshot.entries()) {
    if (state.exists) {
      globalThis[key] = state.value;
    } else {
      delete globalThis[key];
    }
  }
};

const withGlobalSnapshot = async (callback) => {
  const snapshot = snapshotGlobals();

  try {
    return await callback();
  } finally {
    restoreGlobals(snapshot);
  }
};

const importFresh = (path) => import(projectFile(`${path}?compat=${Date.now()}-${Math.random().toString(16).slice(2)}`));

test('i18n data module keeps browser and legacy global compatibility', async () => {
  await withGlobalSnapshot(async () => {
    delete globalThis.i18n;
    globalThis.window = {};

    const module = await importFresh('src/data/i18n.js');
    const exportedI18n = module.default;

    assert.ok(exportedI18n);
    assert.equal(module.i18n, exportedI18n);
    assert.equal(globalThis.i18n, exportedI18n);
    assert.equal(globalThis.window.i18n, exportedI18n);
    assert.deepEqual(Object.keys(exportedI18n), ['zh-TW', 'en', 'fr', 'ru', 'es']);
  });
});

test('update logs data module keeps export and global compatibility', async () => {
  await withGlobalSnapshot(async () => {
    delete globalThis.updateLogs;

    const module = await importFresh('src/data/update-logs.js');
    const exportedLogs = module.default;

    assert.ok(Array.isArray(exportedLogs));
    assert.equal(module.updateLogs, exportedLogs);
    assert.equal(globalThis.updateLogs, exportedLogs);
    assert.equal(exportedLogs.length, EXPECTED_UPDATE_LOG_COUNT);
    assert.equal(exportedLogs[0].version, EXPECTED_LATEST_UPDATE_VERSION);
  });
});

test('astras data module keeps official astras export and global compatibility', async () => {
  await withGlobalSnapshot(async () => {
    delete globalThis.OFFICIAL_ASTRAS;

    const module = await importFresh('src/data/astras-data.js');
    const officialAstras = module.default;

    assert.ok(Array.isArray(officialAstras));
    assert.equal(module.OFFICIAL_ASTRAS, officialAstras);
    assert.equal(globalThis.OFFICIAL_ASTRAS, officialAstras);
    assert.equal(officialAstras.length, EXPECTED_ASTRA_COUNT);
    assert.equal(officialAstras[0].id, EXPECTED_FIRST_ASTRA_ID);

    for (const [index, astra] of officialAstras.entries()) {
      assert.equal(typeof astra.id, 'string', `astra ${index} should keep an id`);
      assert.equal(typeof astra.name, 'string', `astra ${index} should keep a name`);
      assert.equal(typeof astra.category, 'string', `astra ${index} should keep a category`);
      assert.equal(typeof astra.description, 'string', `astra ${index} should keep a description`);
      assert.equal(typeof astra.instructions, 'string', `astra ${index} should keep instructions`);
    }
  });
});

test('demo conversations data module keeps window bridge and export compatibility', async () => {
  await withGlobalSnapshot(async () => {
    delete globalThis.demoConversations;
    globalThis.window = {};

    const module = await importFresh('src/data/demo-conversations.js');
    const demoConversations = module.default;

    assert.ok(demoConversations);
    assert.equal(module.demoConversations, demoConversations);
    assert.equal(globalThis.demoConversations, demoConversations);
    assert.equal(globalThis.window.demoConversations, demoConversations);
    assert.deepEqual(Object.keys(demoConversations), EXPECTED_DEMO_CONVERSATION_KEYS);

    for (const key of EXPECTED_DEMO_CONVERSATION_KEYS) {
      assert.equal(typeof demoConversations[key], 'string', `${key} demo conversation should remain a string`);
      assert.ok(demoConversations[key].length > 0, `${key} demo conversation should not be empty`);
    }
  });
});

test('main bootstrap keeps legacy data import order', () => {
  const source = readFileSync(projectFile('src/main.js'), 'utf8');
  const positions = EXPECTED_DATA_IMPORT_ORDER.map((specifier) => source.indexOf(`await import('${specifier}')`));

  positions.forEach((position, index) => {
    assert.notEqual(position, -1, `${EXPECTED_DATA_IMPORT_ORDER[index]} should remain an awaited data import`);
  });

  const sortedPositions = [...positions].sort((a, b) => a - b);
  assert.deepEqual(positions, sortedPositions, 'data imports should keep the legacy initialization order');
});
