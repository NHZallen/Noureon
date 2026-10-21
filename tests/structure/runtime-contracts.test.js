import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import test from 'node:test';
import { projectFile, projectRoot, readSource } from '../helpers/source-guards.js';

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    if (!entry.isFile()) return [];
    return [path];
  });
}

function toProjectPath(path) {
  return relative(projectRoot, path).replace(/\\/g, '/');
}

const productionSources = () => {
  const sources = collectFiles(projectFile('src'))
    .filter((path) => ['.js', '.mjs', '.css', '.html'].includes(extname(path)))
    .map((path) => [toProjectPath(path), readSource(toProjectPath(path))]);
  sources.push(['vite.config.js', readSource('vite.config.js')]);
  return sources;
};

// The parts of the page are connected by parameters and named exports (NOU-76): nothing registers a function under a name for another
// part to look up at run time.
test('no production code registers or resolves a runtime binding by name', () => {
  for (const [path, source] of productionSources()) {
    assert.doesNotMatch(
      source,
      /\b(?:resolveBinding|resolveOptionalBinding|registerLazyBinding|registerValueBinding)\s*\(|legacyRuntimeContext/,
      `${path} must pass the function as a parameter instead of a runtime binding`
    );
  }
  assert.equal(existsSync(projectFile('src/app/legacy-runtime/runtime/legacy-runtime-context.js')), false);
});

// The shell makes every feature of the page itself and the runtime entry only starts it (NOU-77): nothing is handed out to be made
// elsewhere and connected back.
test('the shell starts the page itself; the runtime entry only loads it', () => {
  const legacyCore = readSource('src/app/runtime/shell/shell.js');
  assert.match(legacyCore, /export\s+function\s+startPage\b/);
  assert.doesNotMatch(legacyCore, /coreTailDependencies|connectCoreTail|connectRuntimeEntry/);
  const runtimeEntry = readSource('src/app/runtime-entry.js');
  assert.match(runtimeEntry, /core\.startPage\(\)/);
  for (const path of ['src/app/runtime/legacy-core/transition-bus-lifecycle.js', 'src/app/runtime/legacy-core/core-tail-lifecycle.js',
    'src/app/runtime/runtime-entry-dependencies.js']) {
    assert.equal(existsSync(projectFile(path)), false, `${path} stays removed`);
  }
});

test('retired virtual runtime and fragment paths remain absent from production', () => {
  for (const [path, source] of productionSources()) {
    assert.doesNotMatch(source, /virtual:legacy-app-runtime/, `${path} must not restore virtual runtime`);
    assert.doesNotMatch(
      source,
      /src\/app\/legacy-runtime\/fragments|legacy-runtime\/fragments\//,
      `${path} must not restore retired runtime fragments`
    );
  }
});
