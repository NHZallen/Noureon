import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import test from 'node:test';
import {
  assertFileExists,
  listFilesIfDirExists,
  projectFile,
  projectRoot,
  readSource
} from '../helpers/source-guards.js';

const retiredRuntimeFragments = [
  '00-runtime.fragment.js',
  '01-runtime.fragment.js',
  '02-runtime.fragment.js',
  '03-runtime.fragment.js',
  '04-runtime.fragment.js',
  '05-runtime.fragment.js',
  '06-runtime.fragment.js'
];

const oldViteRuntimeSymbols = [
  'legacyRuntimeModuleId',
  'resolvedLegacyRuntimeModuleId',
  'legacyCoreFragmentNames',
  'legacyRuntimeFragmentsPlugin'
];

const productionSourceExtensions = new Set(['.js', '.mjs', '.css', '.html']);

const collectFiles = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath);
    if (!entry.isFile()) return [];
    return [filePath];
  });
};

const toProjectPath = (filePath) => relative(projectRoot, filePath).replace(/\\/g, '/');

test('retired runtime fragments stay absent while the real legacy core module exists', () => {
  const fragmentNames = listFilesIfDirExists('src/app/legacy-runtime/fragments')
    .filter((name) => name.endsWith('.fragment.js'))
    .sort();
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');

  assert.deepEqual(fragmentNames, []);
  assertFileExists(assert, 'src/app/runtime/legacy-core/legacy-core.js');
  assert.match(legacyCoreSource, /const\s+legacyRuntimeContext\s*=\s*createLegacyRuntimeContext\(\);/);
  assert.match(legacyCoreSource, /export\s+\{\s*legacyRuntimeContext\s*\};/);

  for (const fragmentName of retiredRuntimeFragments) {
    assert.equal(
      existsSync(projectFile('src/app/legacy-runtime/fragments', fragmentName)),
      false,
      `${fragmentName} must remain retired`
    );
  }
});

test('production runtime entry uses the real legacy core without the virtual runtime plugin', () => {
  const viteSource = readSource('vite.config.js');
  const legacyEntrySource = readSource('src/app/legacy-app.js');
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');

  assert.doesNotMatch(viteSource, /virtual:legacy-app-runtime/);
  for (const symbol of oldViteRuntimeSymbols) {
    assert.doesNotMatch(viteSource, new RegExp(symbol));
  }
  assert.doesNotMatch(viteSource, /readdirSync|readFileSync|addWatchFile|legacyRuntimeContext/);
  assert.match(
    runtimeEntrySource,
    /await\s+import\('\.\/runtime\/legacy-core\/legacy-core\.js'\)/
  );
  assert.doesNotMatch(runtimeEntrySource, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.match(
    legacyEntrySource,
    /import\s+\{\s*startRuntimeEntry\s*\}\s+from\s+['"]\.\/runtime-entry\.js['"]/
  );
  assert.match(legacyEntrySource, /startRuntimeEntry\(\);/);
  assert.doesNotMatch(legacyEntrySource, /virtual:legacy-app-runtime|legacy-core\/legacy-core\.js/);
});

test('production source does not reference retired virtual runtime or runtime fragments', () => {
  const productionFiles = [
    ...collectFiles(projectFile('src'))
      .filter((filePath) => productionSourceExtensions.has(extname(filePath))),
    projectFile('vite.config.js')
  ];

  for (const filePath of productionFiles) {
    const source = readSource(toProjectPath(filePath));
    assert.doesNotMatch(source, /virtual:legacy-app-runtime/, `${toProjectPath(filePath)} must not reference virtual runtime`);
    assert.doesNotMatch(source, /src\/app\/legacy-runtime\/fragments|legacy-runtime\/fragments\//, `${toProjectPath(filePath)} must not reference retired runtime fragments`);
  }
});

test('check:legacy-runtime remains the primary script-level boundary guard', () => {
  const packageJson = JSON.parse(readSource('package.json'));
  const scriptPath = 'scripts/check-legacy-runtime-boundaries.mjs';
  const scriptSource = readSource(scriptPath);
  const templateFragmentNames = readdirSync(projectFile('src/templates/fragments'))
    .filter((name) => name.endsWith('.fragment.js'))
    .sort();

  assert.equal(
    packageJson.scripts['check:legacy-runtime'],
    'node scripts/check-legacy-runtime-boundaries.mjs'
  );
  assert.match(scriptSource, /src\/app\/legacy-runtime\/fragments/);
  assert.match(scriptSource, /virtual:legacy-app-runtime/);
  assert.match(scriptSource, /legacyRuntimeFragmentsPlugin/);
  assert.match(scriptSource, /legacyRuntimeModuleId/);
  assert.match(scriptSource, /resolvedLegacyRuntimeModuleId/);
  assert.match(scriptSource, /legacyCoreFragmentNames/);
  assert.match(scriptSource, /\.\/runtime\/legacy-core\/legacy-core\.js/);
  assert.match(scriptSource, /legacy-core ownership budget/);
  assert.match(scriptSource, /maxBytes:\s*120\s*\*\s*1024/);
  assert.match(scriptSource, /maxLines:\s*2300/);
  assert.match(scriptSource, /legacy-core\.js exceeded the Phase 8 ownership budget/);
  assert.match(scriptSource, /extract a real lifecycle\/module instead of expanding the core shell/);
  assert.doesNotMatch(scriptSource, /src\/templates\/fragments/);
  assert.ok(templateFragmentNames.length > 0, 'template fragments are unrelated and must remain allowed');
});

test('legacy core remains under the explicit legacy runtime ownership budget', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const legacyCoreSize = statSync(projectFile('src/app/runtime/legacy-core/legacy-core.js')).size;
  const legacyCoreLineCount = legacyCoreSource.split(/\r?\n/).length;

  assert.ok(legacyCoreSize <= 120 * 1024, 'legacy-core.js must stay within the Phase 8 byte budget');
  assert.ok(legacyCoreLineCount <= 2300, 'legacy-core.js must stay within the Phase 8 line budget');
});
