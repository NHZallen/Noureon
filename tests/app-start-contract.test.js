import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

// The contracts of the page's start that are not about how the code is split: the ids the app shell must have, the order the CSS files
// are layered in, the order the vendor scripts and the first data are loaded in, and the order the sign-in listeners are bound in before
// the app starts. (Kept from tests/structure-regressions.test.js by NOU-74; the rest of that file became retired-code.test.js and
// module-exports.test.js.)

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const findMatchingBrace = (source, openIndex) => {
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
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block-comment';
        index += 1;
        continue;
      }
      if (char === '"') {
        state = 'double-quote';
        continue;
      }
      if (char === "'") {
        state = 'single-quote';
        continue;
      }
      if (char === '`') {
        state = 'template';
        continue;
      }
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
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
};

const getBlockFromMarker = (source, marker) => {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected to find marker ${marker}`);
  const openIndex = source.indexOf('{', markerIndex);
  assert.notEqual(openIndex, -1, `Expected to find block for marker ${marker}`);
  const closeIndex = findMatchingBrace(source, openIndex);
  assert.notEqual(closeIndex, -1, `Expected to close block for marker ${marker}`);
  return source.slice(markerIndex, closeIndex + 1);
};

const assertMarkersInOrder = (source, markers, context) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${context} should contain ${marker}`);
    assert.ok(next > cursor, `${marker} should remain in ${context} legacy order`);
    cursor = next;
  }
};

test('auth and homepage import bindings remain before startup in legacy order', () => {
  const runtimeEntrySource = readSource('src/app/runtime-entry.js');
  const startupLifecycleSource = readSource('src/app/runtime/features/startup-lifecycle.js');
  const initializeAppBody = getBlockFromMarker(startupLifecycleSource, 'async function initializeApp()');

  assertMarkersInOrder(startupLifecycleSource, [
    "elements.authForm.addEventListener('submit', handleLogin)",
    "elements.usernameInput.addEventListener('input', toggleAuthImportButton)",
    "elements.passwordInput.addEventListener('input', toggleAuthImportButton)",
    "elements.importBtnAuth.addEventListener('click', handleImportOnAuth)",
    "elements.confirmImportBtnAuth.addEventListener('click', processAuthImport)",
    "elements.cancelImportBtnAuth.addEventListener('click'",
    'async function initializeApp()'
  ], 'startup auth bootstrap');

  assertMarkersInOrder(initializeAppBody, [
    'await loadConfig()',
    'await loadAppData()',
    'applyUiTheme()',
    "elements.authContainer.style.display = 'none'",
    "elements.appContainer.classList.remove('hidden')",
    "elements.appContainer.classList.add('visible')",
    'initChatApp()'
  ], 'auto-login startup');
  assertMarkersInOrder(runtimeEntrySource, [
    'startupLifecycle.bindAuthStartupListeners()',
    'startupLifecycle.initializeApp()',
    'startupLifecycle.bindLoginLanguageSwitcher()',
    'startupLifecycle.runStartupPostlude()'
  ], 'runtime entry startup lifecycle wiring');
});

test('app shell imports and preserves critical DOM IDs', async () => {
  const { default: appShell } = await import(projectFile('src/templates/app-shell.js'));

  assert.equal(typeof appShell, 'string');
  assert.ok(appShell.length > 0);

  for (const id of [
    'auth-container',
    'app-container',
    'sidebar',
    'message-list',
    'chat-form',
    'message-input',
    'settings-btn',
    'settings-modal',
    'model-switcher-container',
    'file-options-popover',
    'search-modal',
    'trash-section',
    'p2p-share-modal'
  ]) {
    assert.match(appShell, new RegExp(`id="${id}"`), `app shell should include #${id}`);
  }
});

test('main bootstrap delegates vendor bridge, shell mount, and vendor script loading in order', () => {
  const mainSource = readSource('src/main.js');

  assert.match(mainSource, /import\s+katexScriptUrl\s+from\s+'katex\/dist\/katex\.min\.js\?url';/);
  assert.doesNotMatch(mainSource, /import\s+katex\s+from\s+'katex\/dist\/katex\.min\.js';/);
  assert.match(mainSource, /import\s+\{\s*installVendorBridge\s*\}\s+from\s+'\.\/app\/bootstrap\/vendor-bridge\.js';/);
  assert.match(mainSource, /import\s+\{\s*loadVendorScript\s*\}\s+from\s+'\.\/app\/bootstrap\/load-vendor-script\.js';/);
  assert.match(mainSource, /import\s+\{[^}]*\bmountAppShell\b[^}]*\}\s+from\s+'\.\/app\/bootstrap\/mount-shell\.js';/);

  const orderedBootstrapSteps = [
    'await loadVendorScript(katexScriptUrl)',
    'installVendorBridge({',
    'mountAppShell(appShell)',
    "import('./data/i18n.js')",
    "import('./data/astras-data.js')",
    "import('./data/update-logs.js')",
    "loadVendorScript('/vendor/mhchem.min.js')",
    "await import('./app/legacy-app.js')"
  ];

  let previousIndex = -1;
  for (const step of orderedBootstrapSteps) {
    const currentIndex = mainSource.indexOf(step);
    assert.notEqual(currentIndex, -1, `main bootstrap should include ${step}`);
    assert.ok(currentIndex > previousIndex, `${step} should keep the legacy bootstrap order`);
    previousIndex = currentIndex;
  }
});

test('main css is an ordered split manifest with every imported file under the source size limit', () => {
  const mainCss = readSource('src/styles/main.css');
  const expectedImports = [
    'tokens.css',
    'base.css',
    'sidebar.css',
    'input.css',
    'store.css',
    'layout.css',
    'chat.css',
    'chat-streaming.css',
    'chat-prose.css',
    'chat-generated-image.css',
    'chat-reply-layout.css',
    'reply-wait.css',
    'generated-image-editor.css',
    'generated-image-set.css',
    'modals.css',
    'personalization.css',
    'update-log.css',
    'input-polish.css',
    'quote-inquiry.css',
    'model-council.css',
    'charts.css',
    'settings.css',
    'permissions.css',
    'conversation-search.css',
    'regression-overrides.css',
    'desktop-composer-layout.css',
    'mobile.css',
    'mobile-composer-layout.css',
    'chat-edge-fade.css',
    'busy-feedback.css',
    'typography.css',
    'dark-bridge.css'
  ];

  const imports = [...mainCss.matchAll(/@import\s+['"]\.\/(.+?)['"];/g)].map((match) => match[1]);
  assert.deepEqual(imports, expectedImports);
  assert.equal(mainCss.trimStart().startsWith("@import './tokens.css';"), true);

  const baseCss = readSource('src/styles/base.css');
  assert.match(baseCss, /@tailwind base;\s*@tailwind components;\s*@tailwind utilities;/);

  for (const importPath of expectedImports) {
    const cssPath = `src/styles/${importPath}`;
    const size = statSync(projectFile(cssPath)).size;
    assert.ok(size > 0, `${cssPath} should not be empty`);
    assert.ok(size < 150 * 1024, `${cssPath} should stay under 150 KB`);
  }

  assert.ok(statSync(projectFile('src/styles/main.css')).size < 150 * 1024);

  // The sheets only the settings dialog uses load with it (settings-dialog.css); it is added last, so it repeats, in the same order, the
  // page sheets that came after the first of them, which keep winning over them.
  const dialogOnly = ['settings-cards.css', 'settings-mobile.css', 'settings-api-keys.css', 'settings-output-translator.css',
    'settings-theme-bubble.css', 'settings-desktop.css', 'settings-danger.css'];
  const dialogImports = [...readSource('src/styles/settings-dialog.css').matchAll(/@import\s+['"]\.\/(.+?)['"];/g)].map((match) => match[1]);
  assert.deepEqual(dialogImports.filter((name) => !imports.includes(name)), dialogOnly);
  assert.deepEqual(dialogImports.filter((name) => imports.includes(name)), imports.slice(imports.indexOf('update-log.css')));
  for (const name of dialogOnly) assert.ok(statSync(projectFile(`src/styles/${name}`)).size > 0, `${name} should not be empty`);
  assert.match(readSource('src/app/runtime/legacy-core/settings-modal-lifecycle.js'), /import\('\.\.\/\.\.\/\.\.\/styles\/settings-dialog\.css'\)/);
});

test('the vendor bridge puts the libraries where the older code looks for them, and loads the archive and sharing ones on demand', async () => {
  const { installVendorBridge } = await import(projectFile('src/app/bootstrap/vendor-bridge.js'));
  const names = ['marked', 'DOMPurify', 'Chart', 'Cropper', 'katex', 'JSZip', 'Peer', 'QRCode', 'Html5Qrcode', 'loadArchiveVendor', 'loadSharingVendor'];
  const previous = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  try {
    const stubs = { marked: {}, DOMPurify: {}, Chart: class {}, Cropper: class {}, katex: {} };
    const JSZip = class {};
    const Peer = class {};
    const Html5Qrcode = class {};
    installVendorBridge({ ...stubs, loadArchiveVendor: async () => JSZip, loadSharingVendor: async () => ({ Peer, QRCodeGenerator: { toCanvas: async () => {} }, Html5Qrcode }) });
    for (const name of Object.keys(stubs)) assert.equal(globalThis[name], stubs[name], name);
    assert.equal(await globalThis.loadArchiveVendor(), JSZip);
    assert.equal(globalThis.JSZip, JSZip);
    const sharing = await globalThis.loadSharingVendor();
    assert.equal(globalThis.Peer, Peer);
    assert.equal(globalThis.Html5Qrcode, Html5Qrcode);
    assert.equal(globalThis.QRCode, sharing.QRCode);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete globalThis[name];
      else globalThis[name] = previous[name];
    }
  }
});

test('a vendor script is added once, and the shell needs its #app mount node', async () => {
  const { Window } = await import('happy-dom');
  const window = new Window();
  const previousDocument = globalThis.document;
  globalThis.document = window.document;
  try {
    const { loadVendorScript } = await import(projectFile('src/app/bootstrap/load-vendor-script.js'));
    const { mountAppShell } = await import(projectFile('src/app/bootstrap/mount-shell.js'));
    void loadVendorScript('/vendor/example.js').catch(() => {});
    void loadVendorScript('/vendor/example.js').catch(() => {});
    assert.equal(window.document.querySelectorAll('script[src="/vendor/example.js"]').length, 1);
    assert.throws(() => mountAppShell('<main></main>'), /Missing #app mount node\./);
    window.document.body.innerHTML = '<div id="app"><div data-startup-skeleton></div></div>';
    mountAppShell('<main id="shell"></main>');
    assert.ok(window.document.querySelector('#app #shell'));
    assert.ok(window.document.querySelector('#app [data-startup-skeleton]'), 'the start skeleton stays until the app dismisses it');
  } finally {
    globalThis.document = previousDocument;
    window.close();
  }
});
