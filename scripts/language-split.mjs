// The build step of NOU-17 (docs/superpowers/specs/2026-10-14-language-split-design.md): a text table that has every language side by side,
// `{ 'zh-TW': {...}, en: {...}, ... }`, is cut by language, so the page loads only the language it shows.
//
// For a module registered in scripts/language-split-modules.json the plugin
//   * rewrites the module: each language's value becomes `languageSlot('<module>', '<language>')` (src/app/i18n/language-slots.js), an object that
//     is empty until the words of that language are put in it; everything else in the module is as it was;
//   * makes one small module per language, `<module>?language-slice=<language>`, that holds only the value of that language;
//   * makes `virtual:language-packs`, the list of those small modules by language, which `ensureLanguage` (src/app/i18n/language-packs.js) loads.
// Only the browser build does this (the tests, the server and the dev server use the modules whole). A table that cannot be cut safely (a value
// that is not plain text, a language missing) fails the build with the name of the module; it is never left half cut.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAst } from 'rolldown/parseAst';

export const LANGUAGE_SLICE_QUERY = 'language-slice';
export const VIRTUAL_PACKS = 'virtual:language-packs';
const RESOLVED_VIRTUAL_PACKS = `\0${VIRTUAL_PACKS}`;

const fail = (moduleId, message) => {
  throw new Error(`language split: ${moduleId}: ${message}`);
};

// `Object.freeze({...})` is the same table as `{...}`.
const unwrap = (node) => {
  if (
    node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && node.callee.object?.name === 'Object'
    && node.callee.property?.name === 'freeze'
    && node.arguments.length === 1
  ) return unwrap(node.arguments[0]);
  return node;
};

function findTable(ast, table) {
  for (const statement of ast.body) {
    if (table === 'default') {
      if (statement.type === 'ExportDefaultDeclaration') return unwrap(statement.declaration);
      continue;
    }
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const entry of declaration.declarations) {
      if (entry.id?.type === 'Identifier' && entry.id.name === table) return unwrap(entry.init);
    }
  }
  return null;
}

// What may be in a table: text, numbers, booleans, null, and lists and objects of them. A value that needs the rest of the module (a name, a call,
// a spread, a computed key) cannot be moved to a file of its own.
function assertPlain(moduleId, node, where) {
  switch (node?.type) {
    case 'Literal':
      return;
    case 'TemplateLiteral':
      if (node.expressions.length > 0) fail(moduleId, `${where} is a template with an expression`);
      return;
    case 'UnaryExpression':
      if ((node.operator === '-' || node.operator === '+') && node.argument.type === 'Literal') return;
      fail(moduleId, `${where} is not plain text or a number`);
      return;
    case 'ArrayExpression':
      node.elements.forEach((element, index) => {
        if (element) assertPlain(moduleId, element, `${where}[${index}]`);
      });
      return;
    case 'ObjectExpression':
      for (const property of node.properties) {
        if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method) {
          fail(moduleId, `${where} has a spread, a computed key or a method`);
        }
        const name = property.key?.type === 'Identifier' ? property.key.name : String(property.key?.value);
        assertPlain(moduleId, property.value, `${where}.${name}`);
      }
      return;
    default:
      fail(moduleId, `${where} is not plain text or a number (${node?.type || 'nothing'})`);
  }
}

/** The source text of the table of a module (the object that has the languages), for tests that compare it with what the cut makes of it. */
export function tableSource({ code, table, parse = parseAst }) {
  const node = findTable(parse(code), table);
  return node ? code.slice(node.start, node.end) : '';
}

const slotsImport = (slotsPath) => `import { languageSlot as __languageSlot } from ${JSON.stringify(slotsPath)};\n`;

/**
 * Cuts the table of a module. Returns `{ main, slices }`: the module rewritten with a slot for each language, and the source of the small module
 * of each language. `table` is `default` (`export default {...}`) or the name of a constant (`const TEXTS = {...}`, exported or not).
 */
export function splitTable({ code, moduleId, table, languages, slotsPath, parse = parseAst }) {
  const ast = parse(code);
  const node = findTable(ast, table);
  if (!node || node.type !== 'ObjectExpression') fail(moduleId, `no table "${table}" that is an object`);
  const byLanguage = new Map();
  for (const property of node.properties) {
    if (property.type !== 'Property' || property.computed) fail(moduleId, `the table "${table}" has a key that is not a plain language name`);
    const name = property.key?.type === 'Identifier' ? property.key.name : property.key?.value;
    if (!languages.includes(name)) fail(moduleId, `the table "${table}" has "${name}", which is not one of ${languages.join(', ')}`);
    if (byLanguage.has(name)) fail(moduleId, `the table "${table}" has "${name}" twice`);
    assertPlain(moduleId, property.value, `${table}.${name}`);
    byLanguage.set(name, property.value);
  }
  for (const language of languages) {
    if (!byLanguage.has(language)) fail(moduleId, `the table "${table}" has no "${language}"`);
  }

  const slices = {};
  let main = code;
  // From the end, so the places found in the code stay right.
  const ordered = [...byLanguage.entries()].sort((a, b) => b[1].start - a[1].start);
  for (const [language, value] of ordered) {
    slices[language] = `export default ${code.slice(value.start, value.end)};\n`;
    main = `${main.slice(0, value.start)}__languageSlot(${JSON.stringify(moduleId)}, ${JSON.stringify(language)})${main.slice(value.end)}`;
  }
  return { main: slotsImport(slotsPath) + main, slices };
}

const splitOf = (id) => {
  const [file, query = ''] = id.split('?');
  return { file, language: new URLSearchParams(query).get(LANGUAGE_SLICE_QUERY) || '' };
};

export const loadLanguageSplitRegistry = () => JSON.parse(readFileSync(new URL('./language-split-modules.json', import.meta.url), 'utf8'));

/** The Vite plugin. `registry` is the content of scripts/language-split-modules.json (read from there when not given); `root` the folder of the project. */
export function languageSplitPlugin({ registry = loadLanguageSplitRegistry(), root = process.cwd() } = {}) {
  const { languages, modules } = registry;
  const absolute = new Map(modules.map((entry) => [resolve(root, entry.path).replace(/\\/g, '/'), entry]));
  const slotsPath = resolve(root, 'src/app/i18n/language-slots.js').replace(/\\/g, '/');
  let building = false;

  const read = (file, entry) => splitTable({
    code: readFileSync(file, 'utf8'),
    moduleId: entry.path,
    table: entry.table,
    languages,
    slotsPath
  });

  return {
    name: 'noureon-language-split',
    enforce: 'pre',
    config(_config, { command }) {
      // The page knows it is cut (language-packs.js); the dev server and the tests do not cut anything.
      return command === 'build' ? { define: { __LANGUAGE_SPLIT__: 'true' } } : {};
    },
    configResolved(config) {
      building = config.command === 'build';
    },
    resolveId(source) {
      return source === VIRTUAL_PACKS ? RESOLVED_VIRTUAL_PACKS : null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_PACKS) {
        if (!building) return 'export const slices = {};\n';
        const lines = languages.map((language) => {
          const imports = modules.map((entry) => {
            const file = resolve(root, entry.path).replace(/\\/g, '/');
            return `    ${JSON.stringify(entry.path)}: () => import(${JSON.stringify(`${file}?${LANGUAGE_SLICE_QUERY}=${language}`)})`;
          });
          return `  ${JSON.stringify(language)}: {\n${imports.join(',\n')}\n  }`;
        });
        return `export const slices = {\n${lines.join(',\n')}\n};\n`;
      }
      if (!building) return null;
      const { file, language } = splitOf(id);
      const entry = language ? absolute.get(file) : null;
      if (!entry) return null;
      const { slices } = read(file, entry);
      if (!slices[language]) fail(entry.path, `no language "${language}"`);
      return slices[language];
    },
    transform(_code, id) {
      if (!building || id.includes('?')) return null;
      const entry = absolute.get(id);
      if (!entry) return null;
      return { code: read(id, entry).main, map: null };
    }
  };
}
