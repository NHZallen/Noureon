import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const EXPECTED_LOCALES = ['zh-TW', 'en', 'fr'];
const EXPECTED_LOCALE_KEY_COUNT = 612;
const EXPECTED_SHELL_LANG_KEY_COUNT = 173;
const EXPECTED_LOCALE_HASHES = {
  'zh-TW': '918d8b62deeab9677ee7950334a2fa4ab4737e9e40fca1f14283a96b4a43bc1e',
  en: 'f18f5cb3010aea5cdeb363f8082e0df0c2f6f51be74687b953d4ce88320ec06f',
  fr: 'f5fb00b8bee0f6baeeb43e1cb18dd742c4a391bfbef164c2ed22d56a54ea3509'
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

test('recent runtime UI strings stay covered by locale keys', async () => {
  const { default: i18n } = await importI18n('runtime-gaps');
  const requiredRuntimeKeys = [
    'back',
    'closePreview',
    'download',
    'share',
    'p2pConnect',
    'p2pChooseRole',
    'p2pInvalidCode',
    'p2pReceivedAstrasSuccess',
    'p2pReceivedFoldersSuccess',
    'p2pDataParseFailed',
    'folderIconLineColor',
    'folderTextColor',
    'folderTextColorGray',
    'folderTextColorBlack',
    'folderTextColorWhite',
    'astrasCategoryProductivity',
    'astrasCategoryPlanning',
    'astrasCategoryLanguageLearning',
    'astrasCategoryMentalHealth',
    'astrasCategoryGames',
    'languageNameZhTW',
    'languageNameEn',
    'languageNameFr'
  ];

  for (const locale of EXPECTED_LOCALES) {
    const missingKeys = requiredRuntimeKeys.filter((key) => !(key in i18n[locale]));
    assert.deepEqual(missingKeys, [], `${locale} should cover recent runtime UI keys`);
  }

  const sourceChecks = [
    ['src/app/runtime/legacy-core/settings-mobile-shell-helper.js', /getSettingsText\('back'/],
    ['src/app/legacy-runtime/features/media-preview-lifecycle.js', /getText\('closePreview'/],
    ['src/app/legacy-runtime/features/app-bootstrap-composition.js', /getText\('p2pInvalidCode'/],
    ['src/app/legacy-runtime/features/received-data-lifecycle.js', /getText\('p2pReceivedAstrasSuccess'/],
    ['src/app/runtime/features/p2p-lifecycle.js', /getText\('p2pChooseRole'/],
    ['src/app/runtime/features/folder-lifecycle.js', /getTexts\(\)\.folderIconLineColor/],
    ['src/app/runtime/legacy-core/core-tail-lifecycle.js', /astrasCategoryProductivity/],
    ['src/app/runtime/legacy-core/core-tail-lifecycle.js', /translations\.languageNameZhTW/],
    ['src/app/runtime/legacy-core/core-tail-lifecycle.js', /settings-mobile-title/],
    ['src/app/runtime/legacy-core/core-tail-lifecycle.js', /section\.dataset\.sectionTitle\s*=\s*translations\[sectionTitleKey\]/],
    ['src/styles/settings-desktop.css', /content:\s*attr\(data-section-title\)/]
  ];

  for (const [sourcePath, pattern] of sourceChecks) {
    assert.match(readFileSync(projectFile(sourcePath), 'utf8'), pattern, `${sourcePath} should use i18n`);
  }
});

test('i18n locale content hashes stay stable for future split verification', async () => {
  const { default: i18n } = await importI18n('hash');

  for (const locale of EXPECTED_LOCALES) {
    assert.equal(hashValue(i18n[locale]), EXPECTED_LOCALE_HASHES[locale], `${locale} content should not drift`);
  }
});
