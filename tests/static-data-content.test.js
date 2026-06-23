import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const EXPECTED_ASTRAS_COUNT = 11;
const EXPECTED_FIRST_ASTRA = {
  id: 'official-writer-01',
  name: '旅遊小編',
  category: '生產力'
};
const EXPECTED_ASTRAS_HASH = 'eb2f62db91e3fdf83939a0271f9b81ba3caa9efd6cc5edc177f7b74d34ef7f94';
const EXPECTED_DEMO_KEYS = ['proMax', 'proPV', 'pro', 'plusPV', 'mini', 'mill', 'nano'];
const EXPECTED_DEMO_HASH = 'eb83bb2c6ce275d9018d4d44ddc805a1ec0945c01b033c20bf582f366f3dccb7';
const GLOBAL_KEYS_TO_RESTORE = ['window', 'OFFICIAL_ASTRAS', 'demoConversations'];

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

test('demo conversations keep legacy window/global bridge, exports, key order, and content hash', async () => {
  await withGlobalSnapshot(async () => {
    delete globalThis.demoConversations;
    globalThis.window = {};

    const module = await importFresh('src/data/demo-conversations.js');
    const demoConversations = module.default;

    assert.equal(Array.isArray(demoConversations), false);
    assert.equal(module.demoConversations, demoConversations);
    assert.equal(globalThis.demoConversations, demoConversations);
    assert.equal(globalThis.window.demoConversations, demoConversations);
    assert.deepEqual(Object.keys(demoConversations), EXPECTED_DEMO_KEYS);
    assert.equal(hashValue(demoConversations), EXPECTED_DEMO_HASH);
  });
});

test('demo conversation entries keep the runtime-expected HTML message shape', async () => {
  await withGlobalSnapshot(async () => {
    delete globalThis.demoConversations;
    globalThis.window = {};

    const { default: demoConversations } = await importFresh('src/data/demo-conversations.js');

    for (const key of EXPECTED_DEMO_KEYS) {
      const value = demoConversations[key];
      assert.equal(typeof value, 'string', `${key} demo conversation should stay a string`);
      assert.ok(value.trim().length > 0, `${key} demo conversation should not be empty`);
      assert.match(value, /<!-- Round 1 -->/, `${key} should keep the first demo round marker`);
      assert.match(value, /<!-- Round 2 -->/, `${key} should keep the second demo round marker`);
      assert.match(value, /<!-- Round 3 -->/, `${key} should keep the third demo round marker`);
      assert.match(value, /class="flex (?:justify-end )?gap-3/, `${key} should keep message row markup`);
      assert.match(value, /class="[^"]*message|class="[^"]*max-w-\[80%\]/, `${key} should keep message bubble-like markup`);
      assert.match(value, />AI</, `${key} should keep model avatar/content marker`);
      assert.match(value, />U</, `${key} should keep user avatar/content marker`);
    }
  });
});
