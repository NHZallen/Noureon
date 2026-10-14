import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { LANGUAGE_SLICE_QUERY, languageSplitPlugin, splitTable } from '../scripts/language-split.mjs';
import { LANGUAGE_PACK_LANGUAGES, ensureLanguage, isLanguageLoaded, resolvePackLanguage } from '../src/app/i18n/language-packs.js';
import { fillLanguageSlot, languageSlot } from '../src/app/i18n/language-slots.js';

const registry = JSON.parse(readFileSync(new URL('../scripts/language-split-modules.json', import.meta.url), 'utf8'));
const LANGUAGES = registry.languages;
const slotsPath = resolve('src/app/i18n/language-slots.js');
const cut = (code, table = 'TEXTS') => splitTable({ code, moduleId: 'sample.js', table, languages: LANGUAGES, slotsPath });

const table = (inner = (language) => `{ hello: '${language}: 你好 😀 {name}', n: 3, list: ['a', "b"], nested: { deep: \`text\` } }`) => `{\n${LANGUAGES.map((language) => `  '${language}': ${inner(language)}`).join(',\n')}\n}`;

test('the languages of a registered text table are the five languages of the app', () => {
  assert.deepEqual(LANGUAGES, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  assert.deepEqual([...LANGUAGE_PACK_LANGUAGES], LANGUAGES);
  assert.equal(resolvePackLanguage('de'), 'zh-TW');
  assert.equal(resolvePackLanguage('fr'), 'fr');
});

test('a table is cut by language: a constant, an exported constant and the default export, with words that are not plain letters', () => {
  const shapes = {
    constant: [`// header\nconst TEXTS = Object.freeze(${table()});\nexport const get = (language, key) => TEXTS[language]?.[key] ?? key;\n`, 'TEXTS'],
    exported: [`export const TEXTS = ${table()};\n`, 'TEXTS'],
    default: [`export default ${table()};\n`, 'default']
  };
  for (const [name, [code, tableName]] of Object.entries(shapes)) {
    const { main, slices } = cut(code, tableName);
    assert.deepEqual(Object.keys(slices).sort(), [...LANGUAGES].sort(), name);
    assert.equal(slices.en, "export default { hello: 'en: 你好 😀 {name}', n: 3, list: ['a', \"b\"], nested: { deep: `text` } };\n", name);
    for (const language of LANGUAGES) {
      assert.match(main, new RegExp(`__languageSlot\\("sample.js", "${language}"\\)`), `${name}: ${language} is a slot`);
    }
    assert.doesNotMatch(main, /你好/, `${name}: no words are left in the module`);
    assert.match(main, /^import \{ languageSlot as __languageSlot \} from /, name);
    if (name === 'constant') {
      assert.match(main, /export const get = /, 'the rest of the module is as it was');
      assert.match(main, /^import .*\n\/\/ header\n/, 'the comment before the table stays');
    }
  }
});

test('the cut module reads like the whole one: empty until a language is put in, then the words', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'language-split-'));
  try {
    const source = `const TEXTS = Object.freeze(${table()});\nexport const hello = (language, key = 'hello') => TEXTS[language]?.[key] ?? '?' + key;\n`;
    const { main, slices } = cut(source);
    writeFileSync(join(folder, 'main.mjs'), main.replace(JSON.stringify(slotsPath), JSON.stringify(pathToFileURL(slotsPath).href)));
    const module = await import(pathToFileURL(join(folder, 'main.mjs')).href);
    assert.equal(module.hello('en'), '?hello', 'before the words are in, the key shows');
    writeFileSync(join(folder, 'en.mjs'), slices.en);
    const slice = await import(pathToFileURL(join(folder, 'en.mjs')).href);
    fillLanguageSlot('sample.js', 'en', slice.default);
    assert.equal(module.hello('en'), 'en: 你好 😀 {name}');
    assert.equal(module.hello('fr'), '?hello', 'another language stays empty until it is loaded');
    assert.equal(languageSlot('sample.js', 'en'), languageSlot('sample.js', 'en'), 'the same slot every time');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a table that cannot be cut safely fails the build with the name of the module', () => {
  const bad = (code, tableName, pattern) => assert.throws(() => cut(code, tableName), pattern);
  bad(`const OTHER = ${table()};\n`, 'TEXTS', /sample\.js: no table "TEXTS"/);
  bad(`const TEXTS = ${table((language) => `{ a: helper('${language}') }`)};\n`, 'TEXTS', /not plain text or a number \(CallExpression\)/);
  bad(`const TEXTS = ${table((language) => `{ a: \`x\${name}${language}\` }`)};\n`, 'TEXTS', /template with an expression/);
  bad(`const TEXTS = ${table((language) => `{ ...shared, a: '${language}' }`)};\n`, 'TEXTS', /spread, a computed key or a method/);
  bad(`const TEXTS = ${table((language) => `{ ['a']: '${language}' }`)};\n`, 'TEXTS', /spread, a computed key or a method/);
  bad(`const TEXTS = { 'zh-TW': {}, en: {}, fr: {}, ru: {} };\n`, 'TEXTS', /has no "es"/);
  bad(`const TEXTS = { 'zh-TW': {}, en: {}, fr: {}, ru: {}, es: {}, de: {} };\n`, 'TEXTS', /"de", which is not one of/);
  bad(`const TEXTS = { 'zh-TW': {}, 'zh-TW': {}, en: {}, fr: {}, ru: {}, es: {} };\n`, 'TEXTS', /"zh-TW" twice/);
  bad(`const TEXTS = { 'zh-TW': a, en: {}, fr: {}, ru: {}, es: {} };\n`, 'TEXTS', /not plain text or a number \(Identifier\)/);
});

test('every module in the registry exists, has its table, and can be cut: the build cannot be the first to find out', () => {
  assert.ok(registry.modules.length > 0);
  const seen = new Set();
  for (const entry of registry.modules) {
    assert.ok(!seen.has(entry.path), `${entry.path} is listed twice`);
    seen.add(entry.path);
    assert.ok(existsSync(resolve(entry.path)), `${entry.path} exists`);
    const { slices, main } = splitTable({ code: readFileSync(resolve(entry.path), 'utf8'), moduleId: entry.path, table: entry.table, languages: LANGUAGES, slotsPath });
    assert.deepEqual(Object.keys(slices).sort(), [...LANGUAGES].sort(), entry.path);
    // The words of the module are the same as the words in the slices: nothing was lost in the cut.
    for (const language of LANGUAGES) assert.ok(slices[language].length > 100, `${entry.path}: ${language} has words`);
    assert.ok(main.length < readFileSync(resolve(entry.path), 'utf8').length, `${entry.path} is smaller without the words`);
  }
});

test('the words of every slice are the words of the whole module, key by key, in the five languages', async () => {
  for (const entry of registry.modules) {
    const whole = await import(pathToFileURL(resolve(entry.path)).href);
    const reader = { 'src/app/runtime/sandbox/sandbox-texts.js': whole.sandboxTextsFor };
    // A table that is not exported is read through the module's own function; the exported ones are compared directly.
    const wholeTable = reader[entry.path]
      ? Object.fromEntries(LANGUAGES.map((language) => [language, reader[entry.path](language)]))
      : (entry.table === 'default' ? whole.default : whole[entry.table]);
    assert.ok(wholeTable, `${entry.path}: a way to read the whole table (add it to the list of readers in this test)`);
    const { slices } = splitTable({ code: readFileSync(resolve(entry.path), 'utf8'), moduleId: entry.path, table: entry.table, languages: LANGUAGES, slotsPath });
    for (const language of LANGUAGES) {
      const folder = mkdtempSync(join(tmpdir(), 'language-split-'));
      try {
        writeFileSync(join(folder, `${language}.mjs`), slices[language]);
        const slice = await import(pathToFileURL(join(folder, `${language}.mjs`)).href);
        assert.deepEqual(slice.default, wholeTable[language], `${entry.path}: ${language}`);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    }
  }
});

test('outside the cut build, every language is there already: nothing to load', async () => {
  assert.equal(isLanguageLoaded('en'), true);
  assert.equal(isLanguageLoaded('de'), true);
  assert.equal(await ensureLanguage('fr'), 'fr');
  assert.equal(await ensureLanguage('de'), 'zh-TW', 'a language the app does not have is the default one');
});

test('the plugin cuts only in the build: the dev server and the tests use the whole modules', () => {
  const plugin = languageSplitPlugin({ registry, root: resolve('.') });
  const file = resolve(registry.modules[0].path).replace(/\\/g, '/');
  plugin.configResolved({ command: 'serve' });
  assert.equal(plugin.transform('', file), null);
  assert.equal(plugin.load(`${file}?${LANGUAGE_SLICE_QUERY}=en`), null);
  assert.equal(plugin.load('\0virtual:language-packs'), 'export const slices = {};\n');
  assert.deepEqual(plugin.config({}, { command: 'serve' }), {});
  assert.deepEqual(plugin.config({}, { command: 'build' }), { define: { __LANGUAGE_SPLIT__: 'true' } });
  plugin.configResolved({ command: 'build' });
  assert.match(plugin.transform('', file).code, /__languageSlot\(/);
  assert.match(plugin.load(`${file}?${LANGUAGE_SLICE_QUERY}=en`), /^export default \{/);
  const packs = plugin.load('\0virtual:language-packs');
  for (const language of LANGUAGES) assert.match(packs, new RegExp(`"${language}": \\{`));
  for (const entry of registry.modules) assert.ok(packs.includes(JSON.stringify(entry.path)), entry.path);
  assert.equal(plugin.transform('', `${file}?x=1`), null, 'a module with a query (the slices) is not cut again');
  assert.equal(plugin.resolveId('virtual:language-packs'), '\0virtual:language-packs');
  assert.equal(plugin.resolveId('./other.js'), null);
});
