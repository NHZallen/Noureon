import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtimeFragmentsDir = resolve(projectRoot, 'src/app/legacy-runtime/fragments');
const runtimeEntryPath = resolve(projectRoot, 'src/app/runtime-entry.js');
const legacyCorePath = resolve(projectRoot, 'src/app/runtime/legacy-core/legacy-core.js');
const viteConfigPath = resolve(projectRoot, 'vite.config.js');

const oldViteSymbols = [
  'legacyRuntimeFragmentsPlugin',
  'legacyRuntimeModuleId',
  'resolvedLegacyRuntimeModuleId',
  'legacyCoreFragmentNames'
];

const productionSourceExtensions = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html'
]);

const failures = [];

const toProjectPath = (path) => relative(projectRoot, path).replace(/\\/g, '/');

const fail = (message) => {
  failures.push(message);
};

const listFiles = (dir) => {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).map((name) => resolve(dir, name));
  const files = [];
  for (const entry of entries) {
    const stats = statSync(entry);
    if (stats.isDirectory()) {
      files.push(...listFiles(entry));
    } else if (stats.isFile()) {
      files.push(entry);
    }
  }
  return files;
};

const getExtension = (path) => {
  const match = /\.[^.\\/]+$/.exec(path);
  return match?.[0] ?? '';
};

const runtimeFragments = listFiles(runtimeFragmentsDir)
  .filter((file) => file.endsWith('.fragment.js'));

if (runtimeFragments.length > 0) {
  fail(`Retired runtime fragments returned: ${runtimeFragments.map(toProjectPath).join(', ')}`);
}

if (!existsSync(legacyCorePath)) {
  fail('Missing real legacy core module: src/app/runtime/legacy-core/legacy-core.js');
} else {
  const legacyCoreSource = readFileSync(legacyCorePath, 'utf8');
  if (!/export\s+\{\s*legacyRuntimeContext\s*\};/.test(legacyCoreSource)) {
    fail('legacy-core.js must explicitly export legacyRuntimeContext.');
  }
}

const runtimeEntrySource = existsSync(runtimeEntryPath)
  ? readFileSync(runtimeEntryPath, 'utf8')
  : '';

if (!runtimeEntrySource.includes("import('./runtime/legacy-core/legacy-core.js')")) {
  fail('runtime-entry.js must load ./runtime/legacy-core/legacy-core.js.');
}
if (runtimeEntrySource.includes('virtual:legacy-app-runtime')) {
  fail('runtime-entry.js must not load virtual:legacy-app-runtime.');
}

const viteSource = existsSync(viteConfigPath)
  ? readFileSync(viteConfigPath, 'utf8')
  : '';

for (const symbol of oldViteSymbols) {
  if (viteSource.includes(symbol)) {
    fail(`vite.config.js must not contain retired virtual runtime symbol: ${symbol}`);
  }
}
if (viteSource.includes('virtual:legacy-app-runtime')) {
  fail('vite.config.js must not contain virtual:legacy-app-runtime.');
}

const productionFiles = [
  ...listFiles(resolve(projectRoot, 'src')).filter((file) => productionSourceExtensions.has(getExtension(file))),
  viteConfigPath
];

for (const file of productionFiles) {
  const source = readFileSync(file, 'utf8');
  const projectPath = toProjectPath(file);
  if (source.includes('virtual:legacy-app-runtime')) {
    fail(`${projectPath} must not reference virtual:legacy-app-runtime.`);
  }
  if (source.includes('src/app/legacy-runtime/fragments') || source.includes('legacy-runtime/fragments/')) {
    fail(`${projectPath} must not import or read retired legacy runtime fragments.`);
  }
}

if (failures.length > 0) {
  console.error('Legacy runtime boundary check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Legacy runtime boundary check passed.');
