import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtimeFragmentsDir = resolve(projectRoot, 'src/app/legacy-runtime/fragments');
const runtimeEntryPath = resolve(projectRoot, 'src/app/runtime-entry.js');
const shellPath = resolve(projectRoot, 'src/app/runtime/shell/shell.js');
const viteConfigPath = resolve(projectRoot, 'vite.config.js');

const shellOwnershipBudget = Object.freeze({
  label: 'shell ownership budget',
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

if (!existsSync(shellPath)) {
  fail('Missing the chat page shell: src/app/runtime/shell/shell.js');
} else {
  const shellSource = readFileSync(shellPath, 'utf8');
  const shellSize = statSync(shellPath).size;
  const shellLineCount = countLines(shellSource);

  // The shell makes every feature of the page itself and the runtime entry only starts it: nothing is handed back and forth.
  if (!/export\s+function\s+startPage\b/.test(shellSource)) {
    fail('shell.js must export startPage.');
  }
  if (shellSize > shellOwnershipBudget.maxBytes) {
    fail(
      `shell.js exceeded the shell ownership budget (${shellSize} bytes > ${shellOwnershipBudget.maxBytes} bytes). ` +
      'If this growth is intentional, extract a real lifecycle/module instead of expanding the core shell.'
    );
  }
  if (shellLineCount > shellOwnershipBudget.maxLines) {
    fail(
      `shell.js exceeded the shell ownership budget (${shellLineCount} lines > ${shellOwnershipBudget.maxLines} lines). ` +
      'If this growth is intentional, extract a real lifecycle/module instead of expanding the core shell.'
    );
  }
}

const runtimeEntrySource = existsSync(runtimeEntryPath)
  ? readFileSync(runtimeEntryPath, 'utf8')
  : '';

if (!runtimeEntrySource.includes("import('./runtime/shell/shell.js')")) {
  fail('runtime-entry.js must load ./runtime/shell/shell.js.');
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
  // The parts of the page find each other through src/app/runtime/services.js, not properties of window (NOU-73).
  // The parts are connected by parameters and named exports, not by names looked up at run time (NOU-76).
  if (/\b(?:resolveBinding|resolveOptionalBinding|registerLazyBinding|registerValueBinding)\s*\(/.test(source)) {
    fail(`${projectPath} must not register or resolve a runtime binding by name: pass the function as a parameter.`);
  }
  if (/\b(?:window|globalThis|globalObject|self)\??\.__astra/.test(source)) {
    fail(`${projectPath} must not keep or read a window.__astra… global: provide or get a service (src/app/runtime/services.js).`);
  }
}

if (failures.length > 0) {
  console.error('Legacy runtime boundary check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Shell boundary check passed.');
