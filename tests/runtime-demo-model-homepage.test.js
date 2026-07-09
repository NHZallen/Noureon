import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { projectFile, readSource } from './helpers/source-guards.js';

const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
const appShellSource = readSource('src/templates/app-shell.js');
const demoModulePath = 'src/app/runtime/features/demo-model-homepage.js';
const demoModuleUrl = new URL(`../${demoModulePath}`, import.meta.url);
const demoModuleExists = existsSync(demoModuleUrl);
const demoModule = demoModuleExists ? await import(demoModuleUrl.href) : {};
const { setupDemoModelHomepage } = demoModule;
const demoModuleSource = demoModuleExists ? readSource(demoModulePath) : '';
const domContentLoadedMarker = "document.addEventListener('DOMContentLoaded', () => {";
const expectedModelIds = ['proMax', 'proPV', 'pro', 'plusPV', 'mini', 'mill', 'nano'];

function findMatchingBrace(source, openIndex) {
  let state = 'code';
  let depth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line-comment';
        index += 1;
      } else if (char === '/' && next === '*') {
        state = 'block-comment';
        index += 1;
      } else if (char === '"') {
        state = 'double-quote';
      } else if (char === "'") {
        state = 'single-quote';
      } else if (char === '`') {
        state = 'template';
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    } else if (state === 'line-comment') {
      if (char === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
    } else if (state === 'double-quote') {
      if (char === '"' && previous !== '\\') state = 'code';
    } else if (state === 'single-quote') {
      if (char === "'" && previous !== '\\') state = 'code';
    } else if (state === 'template') {
      if (char === '`' && previous !== '\\') state = 'code';
    }
  }

  return -1;
}

function getDemoDomContentLoadedBody() {
  const markerIndex = legacyCoreSource.indexOf(domContentLoadedMarker);
  assert.notEqual(markerIndex, -1, 'legacy-core should register the demo DOMContentLoaded callback');
  const openIndex = legacyCoreSource.indexOf('{', markerIndex);
  const closeIndex = findMatchingBrace(legacyCoreSource, openIndex);
  assert.notEqual(closeIndex, -1, 'demo DOMContentLoaded callback should have a closing brace');
  return legacyCoreSource.slice(openIndex + 1, closeIndex);
}

const demoSetupBody = getDemoDomContentLoadedBody();

function runDemoSetup(document, demoConversations) {
  assert.equal(typeof setupDemoModelHomepage, 'function', 'demo homepage helper should be exported');
  return setupDemoModelHomepage({ document, demoConversations });
}

function createFixture({ includeDemoSurface = true } = {}) {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = includeDemoSurface
    ? `
      <div id="auth-container"></div>
      <div class="demo-model-selector"></div>
      <div id="demo-chat-window"></div>
      <h2 id="demo-chat-title">Initial title</h2>
    `
    : '<div id="auth-container"></div>';
  return { window, document };
}

function createDemoConversations() {
  return Object.fromEntries(
    expectedModelIds.map((id) => [id, `<article data-demo-id="${id}">${id} content</article>`])
  );
}

test('renders every legacy demo model and keeps the first model selected by default', () => {
  const fixture = createFixture();
  try {
    const demoConversations = createDemoConversations();
    runDemoSetup(fixture.document, demoConversations);

    const buttons = [...fixture.document.querySelectorAll('.demo-model-selector .selector-btn')];
    const contents = [...fixture.document.querySelectorAll('#demo-chat-window .demo-chat-content')];

    assert.deepEqual(buttons.map((button) => button.dataset.modelId), expectedModelIds);
    assert.deepEqual(contents.map((content) => content.id), expectedModelIds.map((id) => `demo-chat-${id}`));
    assert.equal(buttons[0].classList.contains('active'), true);
    assert.equal(contents[0].classList.contains('active'), true);
    assert.equal(buttons.slice(1).some((button) => button.classList.contains('active')), false);
    assert.equal(contents.slice(1).some((content) => content.classList.contains('active')), false);

    for (const id of expectedModelIds) {
      assert.equal(
        fixture.document.getElementById(`demo-chat-${id}`).innerHTML,
        demoConversations[id]
      );
    }
  } finally {
    fixture.window.close();
  }
});

test('selecting a demo model updates the active button, visible content, and title', () => {
  const fixture = createFixture();
  try {
    runDemoSetup(fixture.document, createDemoConversations());
    const selector = fixture.document.querySelector('.demo-model-selector');
    const selectedButton = selector.querySelector('[data-model-id="mini"]');

    selectedButton.dispatchEvent(new fixture.window.MouseEvent('click', { bubbles: true }));

    assert.equal(selector.querySelector('.active'), selectedButton);
    assert.equal(
      fixture.document.querySelector('#demo-chat-window .demo-chat-content.active').id,
      'demo-chat-mini'
    );
    assert.match(fixture.document.getElementById('demo-chat-title').textContent, /Noureon-Mini/);
  } finally {
    fixture.window.close();
  }
});

test('empty or missing demo data and an absent demo surface are graceful', () => {
  const emptyDataFixture = createFixture();
  const missingDataFixture = createFixture();
  const missingSurfaceFixture = createFixture({ includeDemoSurface: false });
  try {
    assert.doesNotThrow(() => runDemoSetup(emptyDataFixture.document, {}));
    assert.equal(
      emptyDataFixture.document.querySelectorAll('.demo-model-selector .selector-btn').length,
      expectedModelIds.length
    );

    assert.doesNotThrow(() => runDemoSetup(missingDataFixture.document, undefined));
    assert.equal(
      missingDataFixture.document.querySelectorAll('#demo-chat-window .demo-chat-content').length,
      expectedModelIds.length
    );

    assert.doesNotThrow(() => runDemoSetup(missingSurfaceFixture.document, undefined));
  } finally {
    emptyDataFixture.window.close();
    missingDataFixture.window.close();
    missingSurfaceFixture.window.close();
  }
});

test('legacy core removes the retired homepage demo section without lazy-loading it', () => {
  assert.equal(existsSync(projectFile(demoModulePath)), true);
  assert.equal(typeof setupDemoModelHomepage, 'function');
  assert.match(legacyCoreSource, /document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{/);
  assert.doesNotMatch(legacyCoreSource, /import\s+\{\s*setupDemoModelHomepage\s*\}\s+from/);
  assert.match(demoSetupBody, /getElementById\('auth-container'\)\.classList\.add\('visible'\)/);
  assert.match(demoSetupBody, /document\.querySelector\('\.demo-model-selector'\)\?\.closest\('section'\)\?\.remove\(\)/);
  assert.match(appShellSource, /appShellWithLegacyDemo\.replace/);
  assert.match(appShellSource, /demo-chat-window/);
  assert.doesNotMatch(demoSetupBody, /demo-model-homepage|setupDemoModelHomepage\(\{\s*document,\s*demoConversations\s*\}\)|contentDiv/);
  assert.match(demoModuleSource, /export\s+function\s+setupDemoModelHomepage\s*\(/);
  assert.match(demoModuleSource, /document\.querySelector\('\.demo-model-selector'\)/);
  assert.match(demoModuleSource, /contentDiv\.innerHTML\s*=/);
  assert.doesNotMatch(
    demoModuleSource,
    /legacyRuntimeContext|registerLazyBinding|resolveBinding|resolveOptionalBinding/
  );
  assert.doesNotMatch(
    demoModuleSource,
    /runtime-entry|app-bootstrap|startup-lifecycle|sidebar|settings|submit|input|globalThis/
  );
});
