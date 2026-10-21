import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { LANGUAGE_SLICE_QUERY, languageSplitPlugin, splitTable, tableSource } from '../scripts/language-split.mjs';
import { LANGUAGE_PACK_LANGUAGES, ensureLanguage, isLanguageLoaded, resolvePackLanguage } from '../src/app/i18n/language-packs.js';
import { fillLanguageSlot, languageSlot, setEarlyReadHandler } from '../src/app/i18n/language-slots.js';

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
    // A slot read before its words are in asks for the language (once the language is in, nothing more is asked).
    const asked = [];
    setEarlyReadHandler((language, id) => asked.push(`${language}@${id}`));
    assert.equal(module.hello('fr'), '?hello');
    assert.deepEqual(asked, ['fr@sample.js']);
    assert.equal(module.hello('en'), 'en: 你好 😀 {name}');
    assert.deepEqual(asked, ['fr@sample.js'], 'a slot that is filled asks for nothing');
    setEarlyReadHandler(null);
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

test('every registered module still loads with its languages empty: nothing reads the words while the module is being loaded', async () => {
  // Cut the way the build cuts it, with the imports made absolute (the file is run from another folder), and the slot module as a file URL.
  const absolutize = (code, file) => code
    .replace(/(from\s+|import\s*\()\s*(['"])(\.{1,2}\/[^'"]+)\2/g, (match, lead, quote, specifier) => `${lead}${quote}${pathToFileURL(resolve(dirname(file), specifier)).href}${quote}`)
    .replace(JSON.stringify(slotsPath), JSON.stringify(pathToFileURL(slotsPath).href));
  for (const entry of registry.modules) {
    const file = resolve(entry.path);
    const { main } = splitTable({ code: readFileSync(file, 'utf8'), moduleId: entry.path, table: entry.table, languages: LANGUAGES, slotsPath });
    const folder = mkdtempSync(join(tmpdir(), 'language-split-'));
    try {
      writeFileSync(join(folder, 'cut.mjs'), absolutize(main, file));
      const cutModule = await import(pathToFileURL(join(folder, 'cut.mjs')).href);
      const wholeModule = await import(pathToFileURL(file).href);
      assert.deepEqual(Object.keys(cutModule).sort(), Object.keys(wholeModule).sort(), `${entry.path}: the same exports`);
      // What the module worked out from its words while it was loaded is the same too (a list of keys made from a language would be empty in the cut one).
      for (const [name, value] of Object.entries(wholeModule)) {
        if (typeof value === 'function' || name === entry.table || (entry.testOnlyExports || []).includes(name)) continue;
        assert.deepEqual(cutModule[name], value, `${entry.path}: ${name} is not worked out from the words while the module loads (or list it as testOnlyExports)`);
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
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
    // A table that is not exported and has no reader is evaluated from its own source (it is plain text, checked by the cut).
    const source = readFileSync(resolve(entry.path), 'utf8');
    const evaluated = wholeTable || new Function(`"use strict"; return (${tableSource({ code: source, table: entry.table })});`)();
    assert.deepEqual(Object.keys(evaluated).sort(), [...LANGUAGES].sort(), `${entry.path}: the table has the five languages`);
    const { slices } = splitTable({ code: readFileSync(resolve(entry.path), 'utf8'), moduleId: entry.path, table: entry.table, languages: LANGUAGES, slotsPath });
    for (const language of LANGUAGES) {
      const folder = mkdtempSync(join(tmpdir(), 'language-split-'));
      try {
        writeFileSync(join(folder, `${language}.mjs`), slices[language]);
        const slice = await import(pathToFileURL(join(folder, `${language}.mjs`)).href);
        assert.deepEqual(slice.default, evaluated[language], `${entry.path}: ${language}`);
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

test('the texts of a language for the app: full at once outside the cut build, and `onLanguageLoaded` answers at once there', async () => {
  const { localeTexts, mergeLocale } = await import('../src/data/i18n/parts/index.js');
  const { onLanguageLoaded } = await import('../src/app/i18n/language-packs.js');
  const english = localeTexts('en');
  assert.deepEqual({ ...english }, mergeLocale('en'));
  assert.ok(Object.keys(english).length > 500);
  let called = 0;
  onLanguageLoaded('fr', () => { called += 1; });
  assert.equal(called, 1);
  const { default: i18n } = await import('../src/data/i18n/index.js');
  assert.deepEqual(Object.keys(i18n).sort(), [...LANGUAGES].sort());
  for (const language of LANGUAGES) assert.equal(i18n[language].login !== undefined, true, language);
});

test('every part of the interface texts is in the registry, so none is left in the startup file', async () => {
  const { parts } = await import('../src/data/i18n/parts/index.js');
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(resolve('src/data/i18n/parts')).filter((name) => name.endsWith('.js') && name !== 'index.js');
  assert.equal(files.length, parts.length, 'every file of parts/ is in the list of parts/index.js');
  for (const name of files) {
    assert.ok(registry.modules.some((entry) => entry.path === `src/data/i18n/parts/${name}` && entry.table === 'default'), `${name} is in scripts/language-split-modules.json`);
  }
});

// A text module with the five languages side by side that is over this many bytes must be cut by language (scripts/language-split-modules.json), or
// be here with the reason it is not: a new one that is neither would grow the file the page loads at start for every language (NOU-17).
const SPLIT_LIMIT_BYTES = 8 * 1024;
const NOT_SPLIT = {
  'src/data/home-texts.js': 'the home page before sign-in has its own five-language build and numbers worked out from the registry; to look at separately',
  'src/data/skill-catalog.js': 'the catalogue of skills is data of a chunk of its own, loaded when the Extensions page opens',
  'src/data/skill-catalog-guides.js': 'the guides of the skills, in the same lazy chunk as the catalogue',
  'src/app/runtime/shell/model-registry.js': 'the labels of the registry are lists in code (reasoning levels), not a table of words',
  'src/app/runtime/settings/settings-memory-summary-controls.js': 'texts written inside the code of a settings control, not a table of words'
};

test('a new text module with the five languages side by side must be cut by language, or say why it is not', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.js') && statSync(path).size > SPLIT_LIMIT_BYTES) files.push(path);
    }
  };
  walk(resolve('src'));
  const registered = new Set(registry.modules.map((entry) => resolve(entry.path)));
  const sideBySide = /^\s*['"]?zh-TW['"]?\s*:\s*\{/m;
  const found = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!sideBySide.test(text) || !/^\s*['"]?ru['"]?\s*:\s*\{/m.test(text)) continue;
    found.push(file.slice(resolve('.').length + 1).replace(/\\/g, '/'));
  }
  const missing = found.filter((path) => !registered.has(resolve(path)) && !NOT_SPLIT[path]);
  assert.deepEqual(missing, [], `these text modules (over ${SPLIT_LIMIT_BYTES} bytes, five languages side by side) are not in scripts/language-split-modules.json: add them there (table: the name of the constant, or "default"), or list them in NOT_SPLIT of this test with the reason`);
  for (const path of Object.keys(NOT_SPLIT)) assert.ok(found.includes(path), `${path} is listed in NOT_SPLIT but is no longer a text module of this kind: take it out of the list`);
});
