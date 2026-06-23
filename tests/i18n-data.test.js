import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const EXPECTED_LOCALES = ['zh-TW', 'en', 'fr'];
const EXPECTED_LOCALE_KEY_COUNT = 440;
const EXPECTED_SHELL_LANG_KEY_COUNT = 164;
const EXPECTED_LOCALE_HASHES = {
  'zh-TW': 'f3c3836744d755a27f97e293a3a6cec7f228e798c0185788aff73ccfa6bcce53',
  en: '08a0ed171c48087e59a7cdaf2fe82dda2d8aa11ebdef4794b57037ffc9a4b224',
  fr: 'dbccfe5ee071a6c1c14a2c9a66865131d8885edf8ad4d17d980651e7e059c264'
};

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

const GLOBAL_KEYS_TO_RESTORE = ['window', 'i18n'];

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

const importI18n = async (tag) => {
  const snapshot = snapshotGlobals();

  try {
    delete globalThis.i18n;
    globalThis.window = {};

    const module = await import(projectFile(`src/data/i18n.js?${tag}=${Date.now()}`));
    return {
      ...module,
      globalI18n: globalThis.i18n,
      windowI18n: globalThis.window.i18n
    };
  } finally {
    restoreGlobals(snapshot);
  }
};

const getShellLangKeys = () => {
  const keys = new Set();
  const fragmentDir = projectFile('src/templates/fragments/');
  const fragmentNames = readdirSync(fragmentDir).filter((name) => name.endsWith('.fragment.js')).sort();

  for (const fragmentName of fragmentNames) {
    const source = readFileSync(new URL(fragmentName, fragmentDir), 'utf8');
    for (const match of source.matchAll(/data-lang-key(?:-(?:title|placeholder))?=\\?"([^"\\]+)\\?"/g)) {
      keys.add(match[1]);
    }
  }

  return keys;
};

test('i18n compatibility entry preserves exports and global side effects', async () => {
  const module = await importI18n('compat');
  const exportedI18n = module.default;

  assert.ok(exportedI18n);
  assert.equal(module.i18n, exportedI18n);
  assert.equal(module.globalI18n, exportedI18n);
  assert.equal(module.windowI18n, exportedI18n);
});

test('i18n locales keep the expected list and identical key coverage', async () => {
  const { default: i18n } = await importI18n('coverage');
  const localeEntries = Object.entries(i18n);
  const locales = localeEntries.map(([locale]) => locale);

  assert.deepEqual(locales, EXPECTED_LOCALES);

  const baselineKeys = Object.keys(i18n[EXPECTED_LOCALES[0]]).sort();
  assert.equal(baselineKeys.length, EXPECTED_LOCALE_KEY_COUNT);

  for (const locale of EXPECTED_LOCALES) {
    const keys = Object.keys(i18n[locale]).sort();
    assert.equal(keys.length, EXPECTED_LOCALE_KEY_COUNT, `${locale} should keep ${EXPECTED_LOCALE_KEY_COUNT} keys`);
    assert.deepEqual(keys, baselineKeys, `${locale} should match the baseline key set`);
  }
});

test('i18n values remain flat strings except for the months arrays', async () => {
  const { default: i18n } = await importI18n('shape');

  for (const locale of EXPECTED_LOCALES) {
    assert.ok(Array.isArray(i18n[locale].months), `${locale}.months should be an array`);
    i18n[locale].months.forEach((month, index) => {
      assert.equal(typeof month, 'string', `${locale}.months[${index}] should be a string`);
    });

    for (const [key, value] of Object.entries(i18n[locale])) {
      if (key === 'months') continue;
      assert.equal(typeof value, 'string', `${locale}.${key} should be a string`);
      assert.notEqual(value && typeof value, 'object', `${locale}.${key} should not be a nested object`);
    }
  }
});

test('shell template language keys are covered by every locale', async () => {
  const { default: i18n } = await importI18n('shell');
  const shellKeys = [...getShellLangKeys()].sort();

  assert.equal(shellKeys.length, EXPECTED_SHELL_LANG_KEY_COUNT);

  for (const locale of EXPECTED_LOCALES) {
    const missingKeys = shellKeys.filter((key) => !(key in i18n[locale]));
    assert.deepEqual(missingKeys, [], `${locale} should cover every shell data-lang-key`);
  }
});

test('i18n locale content hashes stay stable for future split verification', async () => {
  const { default: i18n } = await importI18n('hash');

  for (const locale of EXPECTED_LOCALES) {
    assert.equal(hashValue(i18n[locale]), EXPECTED_LOCALE_HASHES[locale], `${locale} content should not drift`);
  }
});
