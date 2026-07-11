import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import test from 'node:test';
import { projectFile, projectRoot, readSource } from '../helpers/source-guards.js';

const CORE_TAIL_BINDING_NAMES = [
  'setupTimeAnalysis',
  'updateTimeDistributionChart',
  'getDominantColorPalette',
  'applyUiTheme',
  'renderUiColorOptions',
  'analyzeImageBrightness',
  'applyCustomWallpaper',
  'handleWallpaperUpload',
  'handleConfirmCrop',
  'restoreDefaultWallpaper',
  'openStore',
  'closeStore',
  'renderStore',
  'handleSubscription',
  'openAvatarEditor',
  'handleAvatarUpload',
  'handleConfirmAvatarCrop',
  'applyLanguage',
  'showMobileContextMenu',
  'showMobileContextMenuForFolder',
  'showMobileContextMenuForAstras',
  'setupScrollToBottomButton',
  'showUpdateHistory',
  'checkAndShowLatestUpdate',
  'setupMessageIntersectionObserver',
  'renderTrash',
  'handleRestoreTrashItem',
  'handleDeleteTrashItemPermanently',
  'showTrashItemInViewModal',
  'toggleTrashSelectionMode',
  'renderTrashBatchActionBar',
  'handleBatchRestoreFromTrash',
  'handleBatchDeleteFromTrash',
  'handleEmptyTrash',
  'updateDisplayedVersion'
];

const CONTRACT_CATEGORIES = new Map([
  ['app.initChatApp', 'startup/bootstrap'],
  ['input.updateFunctionButtonsState', 'input'],
  ['input.updateInputState', 'input'],
  ['memory.getHistoryRecallStatus', 'memory'],
  ['memory.grantHistoryRecallConsent', 'memory'],
  ['memory.retrieveHistory', 'memory'],
  ['memory.rebuildHistoryIndex', 'memory'],
  ['memory.recordUsage', 'memory'],
  ['memory.revokeHistoryRecallConsent', 'memory'],
  ['runtime.coreTailDependencies', 'core tail'],
  ['runtime.entryDependencies', 'runtime entry'],
  ['runtimeEntry.submit.adjustTextareaHeight', 'runtime entry'],
  ['settings.setupSettingsModal', 'settings'],
  ['sidebar.toggleSidebar', 'sidebar'],
  ['submit.adjustTextareaHeight', 'transitional-only'],
  ['submit.generateTitleAndSummary', 'submit'],
  ['submit.renderFilePreviews', 'submit'],
  ['submit.shouldPerformWebSearch', 'submit'],
  ['submit.updateSubmitButtonState', 'submit'],
  ...CORE_TAIL_BINDING_NAMES.map((name) => [`coreTail.${name}`, 'core tail'])
]);

const KNOWN_CATEGORIES = new Set([
  'settings',
  'input',
  'memory',
  'submit',
  'sidebar',
  'runtime entry',
  'core tail',
  'startup/bootstrap',
  'transitional-only'
]);

const expectedDynamicCalls = [
  'src/app/legacy-runtime/runtime/legacy-runtime-context.js:resolveOptionalBinding:name',
  'src/app/runtime-entry.js:registerLazyBinding:bindingName',
  'src/app/runtime-entry.js:registerLazyBinding:bindingName',
  'src/app/runtime-entry.js:resolveOptionalBinding:bindingName',
  'src/app/runtime-entry.js:resolveOptionalBinding:bindingName',
  'src/app/runtime/legacy-core/transition-bus-lifecycle.js:resolveBinding:`coreTail.${name}`'
].sort();

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

function collectRuntimeMethodCalls() {
  const methodPattern = /\b(registerLazyBinding|resolveBinding|resolveOptionalBinding)\s*\(\s*((?:'[^']*'|"[^"]*"|`[^`]*`)|[A-Za-z_$][\w$]*)/g;
  const files = collectFiles(projectFile('src'))
    .filter((path) => ['.js', '.mjs'].includes(extname(path)));
  const calls = [];

  for (const path of files) {
    const projectPath = toProjectPath(path);
    const source = readSource(projectPath);
    for (const match of source.matchAll(methodPattern)) {
      calls.push({
        path: projectPath,
        method: match[1],
        argument: match[2]
      });
    }
  }

  return calls;
}

function literalValue(argument) {
  const quote = argument[0];
  if (!['\'', '"', '`'].includes(quote) || argument.at(-1) !== quote) return undefined;
  if (quote === '`' && argument.includes('${')) return undefined;
  return argument.slice(1, -1);
}

function collectRuntimeEntryWrapperRegistrations(runtimeEntrySource) {
  return [...runtimeEntrySource.matchAll(/\bregisterBinding\(\s*(['"])([^'"]+)\1/g)]
    .map((match) => match[2]);
}

function collectCoreTailNames(runtimeEntrySource) {
  const arrayMatch = runtimeEntrySource.match(
    /const\s+CORE_TAIL_BINDING_NAMES\s*=\s*\[([\s\S]*?)\];/
  );
  assert.ok(arrayMatch, 'runtime-entry must declare CORE_TAIL_BINDING_NAMES');
  return [...arrayMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('production runtime binding inventory matches the classified contract allowlist', () => {
  const calls = collectRuntimeMethodCalls();
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const literalBindings = calls
    .map(({ argument }) => literalValue(argument))
    .filter(Boolean);
  const coreTailNames = collectCoreTailNames(runtimeEntrySource);
  const actualBindings = new Set([
    ...literalBindings,
    ...collectRuntimeEntryWrapperRegistrations(runtimeEntrySource),
    ...coreTailNames.map((name) => `coreTail.${name}`)
  ]);

  assert.deepEqual(coreTailNames, CORE_TAIL_BINDING_NAMES);
  assert.deepEqual(
    [...actualBindings].sort(),
    [...CONTRACT_CATEGORIES.keys()].sort(),
    'new runtime bindings must be classified in the V5 contract map'
  );
});

test('every classified runtime binding has a registration and a resolver path', () => {
  const calls = collectRuntimeMethodCalls();
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const coreTailBindings = collectCoreTailNames(runtimeEntrySource)
    .map((name) => `coreTail.${name}`);
  const registrations = new Set([
    ...calls
      .filter(({ method }) => method === 'registerLazyBinding')
      .map(({ argument }) => literalValue(argument))
      .filter(Boolean),
    ...collectRuntimeEntryWrapperRegistrations(runtimeEntrySource),
    ...coreTailBindings
  ]);
  const resolutions = new Set([
    ...calls
      .filter(({ method }) => method !== 'registerLazyBinding')
      .map(({ argument }) => literalValue(argument))
      .filter(Boolean),
    ...coreTailBindings
  ]);
  const expected = [...CONTRACT_CATEGORIES.keys()].sort();

  assert.deepEqual([...registrations].sort(), expected);
  assert.deepEqual([...resolutions].sort(), expected);
});

test('dynamic runtime binding calls stay limited to documented registry adapters', () => {
  const dynamicCalls = collectRuntimeMethodCalls()
    .filter(({ argument }) => literalValue(argument) === undefined)
    .map(({ path, method, argument }) => `${path}:${method}:${argument}`)
    .sort();

  assert.deepEqual(
    dynamicCalls,
    expectedDynamicCalls,
    'new dynamic binding expressions need an explicit owner and inventory strategy'
  );
});

test('runtime binding categories stay limited to the known contract groups', () => {
  assert.deepEqual(new Set(CONTRACT_CATEGORIES.values()), KNOWN_CATEGORIES);
});

test('retired virtual runtime and fragment paths remain absent from production', () => {
  const productionSources = collectFiles(projectFile('src'))
    .filter((path) => ['.js', '.mjs', '.css', '.html'].includes(extname(path)))
    .map((path) => [toProjectPath(path), readSource(toProjectPath(path))]);
  productionSources.push(['vite.config.js', readSource('vite.config.js')]);

  for (const [path, source] of productionSources) {
    assert.doesNotMatch(source, /virtual:legacy-app-runtime/, `${path} must not restore virtual runtime`);
    assert.doesNotMatch(
      source,
      /src\/app\/legacy-runtime\/fragments|legacy-runtime\/fragments\//,
      `${path} must not restore retired runtime fragments`
    );
  }
});
