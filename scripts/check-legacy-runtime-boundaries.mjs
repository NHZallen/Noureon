import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtimeFragmentsDir = resolve(projectRoot, 'src/app/legacy-runtime/fragments');
const runtimeEntryPath = resolve(projectRoot, 'src/app/runtime-entry.js');
const legacyCorePath = resolve(projectRoot, 'src/app/runtime/legacy-core/legacy-core.js');
const viteConfigPath = resolve(projectRoot, 'vite.config.js');

const legacyCoreOwnershipBudget = Object.freeze({
  label: 'legacy-core ownership budget',
  maxBytes: 120 * 1024,
  maxLines: 2300
});

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

const countLines = (source) => {
  if (source.length === 0) return 0;
  const lines = source.split(/\r\n|\r|\n/).length;
  return source.endsWith('\n') ? lines - 1 : lines;
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
  const legacyCoreSize = statSync(legacyCorePath).size;
  const legacyCoreLineCount = countLines(legacyCoreSource);

  if (!/export\s+\{\s*legacyRuntimeContext\s*\};/.test(legacyCoreSource)) {
    fail('legacy-core.js must explicitly export legacyRuntimeContext.');
  }
  if (legacyCoreSize > legacyCoreOwnershipBudget.maxBytes) {
    fail(
      `legacy-core.js exceeded the Phase 8 ownership budget (${legacyCoreSize} bytes > ${legacyCoreOwnershipBudget.maxBytes} bytes). ` +
      'If this growth is intentional, extract a real lifecycle/module instead of expanding the core shell.'
    );
  }
  if (legacyCoreLineCount > legacyCoreOwnershipBudget.maxLines) {
    fail(
      `legacy-core.js exceeded the Phase 8 ownership budget (${legacyCoreLineCount} lines > ${legacyCoreOwnershipBudget.maxLines} lines). ` +
      'If this growth is intentional, extract a real lifecycle/module instead of expanding the core shell.'
    );
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
