import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const EXPECTED_ASTRAS_COUNT = 11;
const EXPECTED_FIRST_ASTRA = {
  id: 'official-writer-01',
  name: '旅遊小編',
  category: '生產力'
};
const EXPECTED_ASTRAS_HASH = '2ee2c5e84c26ae01dd615eed2cd116bb29eecf0c57335936052ae94c5091d019';
const GLOBAL_KEYS_TO_RESTORE = ['window', 'OFFICIAL_ASTRAS'];

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const hashValue = (value) => createHash('sha256').update(stableStringify(value)).digest('hex');

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

const importFresh = (path) => import(projectFile(`${path}?content=${Date.now()}-${Math.random().toString(16).slice(2)}`));

test('official Astras data keeps legacy global, exports, order, and content hash', async () => {
  await withGlobalSnapshot(async () => {
    delete globalThis.OFFICIAL_ASTRAS;

    const module = await importFresh('src/data/astras-data.js');
    const officialAstras = module.default;

    assert.ok(Array.isArray(officialAstras));
    assert.equal(module.OFFICIAL_ASTRAS, officialAstras);
    assert.equal(globalThis.OFFICIAL_ASTRAS, officialAstras);
    assert.equal(officialAstras.length, EXPECTED_ASTRAS_COUNT);
    assert.deepEqual(
      {
        id: officialAstras[0]?.id,
        name: officialAstras[0]?.name,
        category: officialAstras[0]?.category
      },
      EXPECTED_FIRST_ASTRA
    );
    assert.equal(hashValue(officialAstras), EXPECTED_ASTRAS_HASH);
  });
});

test('official Astras entries keep the runtime-required data shape', async () => {
  await withGlobalSnapshot(async () => {
    delete globalThis.OFFICIAL_ASTRAS;

    const { default: officialAstras } = await importFresh('src/data/astras-data.js');
    const ids = new Set();

    for (const [index, astra] of officialAstras.entries()) {
      assert.equal(typeof astra.id, 'string', `astra ${index} should keep an id`);
      assert.match(astra.id, /^official-/, `astra ${index} id should remain an official id`);
      assert.equal(ids.has(astra.id), false, `astra ${index} id should be unique`);
      ids.add(astra.id);

      assert.equal(typeof astra.name, 'string', `astra ${index} should keep a name`);
      assert.equal(typeof astra.category, 'string', `astra ${index} should keep a category`);
      assert.equal(typeof astra.description, 'string', `astra ${index} should keep a description`);
      assert.equal(typeof astra.instructions, 'string', `astra ${index} should keep instructions`);
      assert.ok('avatarUrl' in astra, `astra ${index} should keep avatarUrl`);
      assert.ok(astra.avatarUrl === null || typeof astra.avatarUrl === 'string', `astra ${index} avatarUrl should stay nullable string`);

      assert.ok(astra.name.trim().length > 0, `astra ${index} name should not be empty`);
      assert.ok(astra.category.trim().length > 0, `astra ${index} category should not be empty`);
      assert.ok(astra.description.trim().length > 0, `astra ${index} description should not be empty`);
      assert.ok(astra.instructions.trim().length > 0, `astra ${index} instructions should not be empty`);
    }
  });
});

test('official mental-health Nouras expose bounded, non-clinical runtime instructions', async () => {
  const { default: officialAstras } = await importFresh('src/data/astras-data.js');
  for (const id of ['official-editor-09', 'official-editor-10']) {
    const nouras = officialAstras.find((entry) => entry.id === id);
    assert.match(nouras.instructions, /不具有真人專業資格/);
    assert.match(nouras.instructions, /不診斷/);
    assert.match(nouras.instructions, /緊急服務/);
  }
});
