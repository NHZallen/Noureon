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

// The chat page's shell (shell.js) is a real module that only the runtime entry loads; the runtime fragments and the virtual
// module it was once built from stay gone. scripts/check-shell-boundaries.mjs guards the same rules in `npm run check:shell`.

const SHELL = 'src/app/runtime/shell/shell.js';
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

  const exportLines = readSource(SHELL).match(/^export\b.*/gm) ?? [];
  assert.equal(exportLines.length, 1, 'shell.js hands nothing back but startPage');
  assert.match(exportLines[0], /^export\s+function\s+startPage\b/);
});

test('only the runtime entry loads the shell, and the page entry goes through it', () => {
  assert.match(readSource('src/app/runtime-entry.js'), /import\('\.\/runtime\/shell\/shell\.js'\)/);
  const chatAppSource = readSource('src/app/chat-app.js');
  assert.match(chatAppSource, /import\s+\{\s*startRuntimeEntry\s*\}\s+from\s+['"]\.\/runtime-entry\.js['"]/);

  const loadsShell = /(?:from\s*|import\s*\(\s*)['"](?:[^'"]*\/shell\/shell|\.\/shell)\.js['"]/;
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

test('check:shell runs the boundary script, which passes on this tree', () => {
  const packageJson = JSON.parse(readSource('package.json'));
  assert.equal(packageJson.scripts['check:shell'], 'node scripts/check-shell-boundaries.mjs');

  const output = execFileSync(process.execPath, ['scripts/check-shell-boundaries.mjs'], { cwd: projectRoot, encoding: 'utf8' });
  assert.match(output, /Shell boundary check passed\./);
});

test('the shell stays within its ownership budget', () => {
  const shellSize = statSync(projectFile(SHELL)).size;
  const shellLineCount = readSource(SHELL).split(/\r?\n/).length;

  assert.ok(shellSize <= 120 * 1024, 'shell.js must stay within its byte budget');
  assert.ok(shellLineCount <= 2300, 'shell.js must stay within its line budget');
});
