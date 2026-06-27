import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { projectFile, readSource } from './helpers/source-guards.js';

const helperPath = 'src/app/runtime/legacy-core/history-sidebar-helpers.js';
const helperUrl = new URL(`../${helperPath}`, import.meta.url);
const helperExists = existsSync(helperUrl);
const helperModule = helperExists ? await import(helperUrl.href) : {};
const { createHistorySidebarHelpers } = helperModule;
const helperSource = helperExists ? readSource(helperPath) : '';
const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');

function createHarness({ elements: suppliedElements } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `
    <aside id="history-sidebar"></aside>
    <div id="history-sidebar-overlay" class="hidden"></div>
  `;
  const elements = suppliedElements || {
    historySidebar: document.getElementById('history-sidebar'),
    historySidebarOverlay: document.getElementById('history-sidebar-overlay')
  };
  const frames = [];
  const calls = [];

  assert.equal(typeof createHistorySidebarHelpers, 'function', 'history sidebar helper factory should be exported');
  const helpers = createHistorySidebarHelpers({
    elements,
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    setupMessageIntersectionObserver: () => calls.push('setupMessageIntersectionObserver')
  });

  return { calls, document, elements, frames, helpers, window };
}

test('opening the history sidebar preserves overlay and RAF ordering', () => {
  const harness = createHarness();
  try {
    harness.helpers.toggleHistorySidebar(true);

    assert.equal(harness.elements.historySidebarOverlay.classList.contains('hidden'), false);
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('visible'), false);
    assert.equal(harness.frames.length, 2);

    harness.frames[0]();
    assert.deepEqual(harness.calls, ['setupMessageIntersectionObserver']);
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);

    harness.frames[1]();
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), true);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('visible'), true);
  } finally {
    harness.window.close();
  }
});

test('closing waits for transition end before hiding the overlay', () => {
  const harness = createHarness();
  try {
    harness.elements.historySidebar.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.remove('hidden');

    harness.helpers.toggleHistorySidebar(false);

    assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('visible'), false);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('hidden'), false);

    harness.elements.historySidebarOverlay.dispatchEvent(new harness.window.Event('transitionend'));
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('hidden'), true);
  } finally {
    harness.window.close();
  }
});

test('reopening before the close transition keeps the overlay visible', () => {
  const harness = createHarness();
  try {
    harness.elements.historySidebar.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.remove('hidden');

    harness.helpers.toggleHistorySidebar(false);
    harness.helpers.toggleHistorySidebar(true);
    for (const frame of harness.frames) frame();
    harness.elements.historySidebarOverlay.dispatchEvent(new harness.window.Event('transitionend'));

    assert.equal(harness.elements.historySidebar.classList.contains('visible'), true);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('visible'), true);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('hidden'), false);
  } finally {
    harness.window.close();
  }
});

test('missing sidebar elements preserve the current explicit failure boundary', () => {
  const harness = createHarness({ elements: {} });
  try {
    assert.throws(() => harness.helpers.toggleHistorySidebar(true), TypeError);
    assert.throws(() => harness.helpers.toggleHistorySidebar(false), TypeError);
  } finally {
    harness.window.close();
  }
});

test('legacy core composes the helper without moving conversation behavior or runtime contracts', () => {
  assert.equal(existsSync(projectFile(helperPath)), true);
  assert.match(helperSource, /export\s+function\s+createHistorySidebarHelpers\s*\(/);
  assert.match(
    legacyCoreSource,
    /import\s+\{\s*createHistorySidebarHelpers\s*\}\s+from\s+['"]\/src\/app\/runtime\/legacy-core\/history-sidebar-helpers\.js['"]/
  );
  assert.match(
    legacyCoreSource,
    /createHistorySidebarHelpers\(\{[\s\S]*?elements:\s*ALL_ELEMENTS,[\s\S]*?requestAnimationFrame,[\s\S]*?setupMessageIntersectionObserver/
  );
  assert.doesNotMatch(legacyCoreSource, /function\s+toggleHistorySidebar\s*\(show\)\s*\{/);
  assert.match(legacyCoreSource, /function\s+renderHistorySidebarContent\s*\(\)/);
  assert.match(legacyCoreSource, /const\s+renderHistorySidebar\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(
    helperSource,
    /legacyRuntimeContext|registerLazyBinding|resolveBinding|resolveOptionalBinding|conversations|archive|delete|rename|pinned|folderId/
  );
  assert.doesNotMatch(
    helperSource,
    /^import\s+[\s\S]*?from\s+['"][^'"]*(?:runtime-entry|app-bootstrap|startup-lifecycle|settings|input|submit|provider)[^'"]*['"]/m
  );
});
