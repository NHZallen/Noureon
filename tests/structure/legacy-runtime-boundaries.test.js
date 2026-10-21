import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import test from 'node:test';
import {
  listFilesIfDirExists,
  projectFile,
  projectRoot,
  readSource
} from '../helpers/source-guards.js';

// The chat page's shell (legacy-core.js) is a real module that only the runtime entry loads; the runtime fragments and the virtual
// module it was once built from stay gone. scripts/check-legacy-runtime-boundaries.mjs guards the same rules in `npm run check:legacy-runtime`.

const LEGACY_CORE = 'src/app/runtime/legacy-core/legacy-core.js';
const productionSourceExtensions = new Set(['.js', '.mjs', '.css', '.html']);

const collectFiles = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath);
    return entry.isFile() ? [filePath] : [];
  });
};

const toProjectPath = (filePath) => relative(projectRoot, filePath).replace(/\\/g, '/');

test('retired runtime fragments stay absent and the shell exports only startPage', () => {
  const fragmentNames = listFilesIfDirExists('src/app/legacy-runtime/fragments').filter((name) => name.endsWith('.fragment.js'));
  assert.deepEqual(fragmentNames, []);

  const exportLines = readSource(LEGACY_CORE).match(/^export\b.*/gm) ?? [];
  assert.equal(exportLines.length, 1, 'legacy-core.js hands nothing back but startPage');
  assert.match(exportLines[0], /^export\s+function\s+startPage\b/);
});

test('only the runtime entry loads the shell, and the page entry goes through it', () => {
  assert.match(readSource('src/app/runtime-entry.js'), /import\('\.\/runtime\/legacy-core\/legacy-core\.js'\)/);
  const legacyAppSource = readSource('src/app/legacy-app.js');
  assert.match(legacyAppSource, /import\s+\{\s*startRuntimeEntry\s*\}\s+from\s+['"]\.\/runtime-entry\.js['"]/);

  const loadsShell = /(?:from\s*|import\s*\(\s*)['"](?:[^'"]*\/legacy-core\/legacy-core|\.\/legacy-core)\.js['"]/;
  const loaders = collectFiles(projectFile('src'))
    .filter((filePath) => extname(filePath) === '.js' && loadsShell.test(readSource(toProjectPath(filePath))))
    .map(toProjectPath);
  assert.deepEqual(loaders, ['src/app/runtime-entry.js']);
});

test('production source has no virtual runtime, runtime fragments or bindings looked up by name', () => {
  const viteSource = readSource('vite.config.js');
  for (const symbol of ['legacyRuntimeModuleId', 'resolvedLegacyRuntimeModuleId', 'legacyCoreFragmentNames', 'legacyRuntimeFragmentsPlugin']) {
    assert.equal(viteSource.includes(symbol), false, `vite.config.js must not bring back ${symbol}`);
  }

  const productionFiles = [
    ...collectFiles(projectFile('src')).filter((filePath) => productionSourceExtensions.has(extname(filePath))),
    projectFile('vite.config.js')
  ];
  for (const filePath of productionFiles) {
    const path = toProjectPath(filePath);
    const source = readSource(path);
    assert.doesNotMatch(source, /virtual:legacy-app-runtime/, `${path} must not reference the virtual runtime`);
    assert.doesNotMatch(source, /legacy-runtime\/fragments/, `${path} must not reference retired runtime fragments`);
    assert.doesNotMatch(source, /\b(?:resolveBinding|resolveOptionalBinding|registerLazyBinding|registerValueBinding)\s*\(/, `${path} must pass functions as parameters`);
  }
});

test('check:legacy-runtime runs the boundary script, which passes on this tree', () => {
  const packageJson = JSON.parse(readSource('package.json'));
  assert.equal(packageJson.scripts['check:legacy-runtime'], 'node scripts/check-legacy-runtime-boundaries.mjs');

  const output = execFileSync(process.execPath, ['scripts/check-legacy-runtime-boundaries.mjs'], { cwd: projectRoot, encoding: 'utf8' });
  assert.match(output, /Legacy runtime boundary check passed\./);
});

test('legacy core remains under the explicit legacy runtime ownership budget', () => {
  const legacyCoreSize = statSync(projectFile(LEGACY_CORE)).size;
  const legacyCoreLineCount = readSource(LEGACY_CORE).split(/\r?\n/).length;

  assert.ok(legacyCoreSize <= 120 * 1024, 'legacy-core.js must stay within the legacy runtime byte budget');
  assert.ok(legacyCoreLineCount <= 2300, 'legacy-core.js must stay within the legacy runtime line budget');
});
