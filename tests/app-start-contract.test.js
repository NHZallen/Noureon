import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';

// The contracts of the page's start that are not about how the code is split: the ids the app shell must have, the order the CSS files
// are layered in, KaTeX before its mhchem extension, and the order the shell starts the page in. (Kept from
// tests/structure-regressions.test.js by NOU-74; what each start step does is tested on the real lifecycles in
// runtime-startup-lifecycle.test.js and runtime-app-bootstrap-lifecycle.test.js.)

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const assertInOrder = (source, markers, context) => {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.ok(next > cursor, `${context}: ${marker} should come next`);
    cursor = next;
  }
};

// legacy-core.js is the composition root and cannot be imported in a test, so the order of startPage() is read from it: the sign-in
// listeners are bound before the workspace loads (a quick submit is not lost), the language switcher and the rest come after.
test('the shell starts the page with the sign-in listeners, then the workspace, the language switcher and the rest', () => {
  const source = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const startPage = source.slice(source.indexOf('export function startPage'));
  assertInOrder(startPage, [
    'startupLifecycle.bindAuthStartupListeners()',
    'startupLifecycle.initializeApp()',
    'startupLifecycle.bindLoginLanguageSwitcher()',
    'startupLifecycle.runStartupPostlude()'
  ], 'startPage');
});

test('the app shell has the elements the page needs', async () => {
  const { default: appShell } = await import(projectFile('src/templates/app-shell.js'));
  const { document, cleanup } = createDom(appShell);
  try {
    for (const id of [
      'auth-container', 'app-container', 'sidebar', 'message-list', 'chat-form', 'message-input', 'settings-btn', 'settings-modal',
      'model-switcher-container', 'file-options-popover', 'search-modal', 'trash-section', 'p2p-share-modal'
    ]) {
      assert.ok(document.getElementById(id), `app shell should include #${id}`);
    }
  } finally {
    cleanup();
  }
});

// KaTeX is its own file (imported as a URL, not bundled into the start), and mhchem, which extends it, is loaded only after it.
test('main loads KaTeX as its own script before mhchem', () => {
  const mainSource = readSource('src/main.js');
  assert.match(readSource('src/app/vendors/katex-vendor.js'), /import\s+\w+\s+from\s+'katex\/dist\/katex\.min\.js\?url';/);
  assert.doesNotMatch(mainSource, /from\s+'katex\/dist\/katex\.min\.js'/);
  assertInOrder(mainSource, ['await loadKatex()', "loadVendorScript('/vendor/mhchem.min.js')"], 'main bootstrap');
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
    'generated-image-set.css',
    'modals.css',
    'personalization.css',
    'input-polish.css',
    'quote-inquiry.css',
    'model-council.css',
    'settings.css',
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
  const dialogOnly = ['settings-cards.css', 'update-log.css', 'charts.css', 'settings-mobile.css', 'settings-api-keys.css',
    'settings-output-translator.css', 'settings-theme-bubble.css', 'settings-desktop.css', 'settings-danger.css', 'permissions.css',
    'conversation-search.css'];
  const dialogImports = [...readSource('src/styles/settings-dialog.css').matchAll(/@import\s+['"]\.\/(.+?)['"];/g)].map((match) => match[1]);
  assert.deepEqual(dialogImports.filter((name) => !imports.includes(name)), dialogOnly);
  assert.deepEqual(dialogImports.filter((name) => imports.includes(name)), imports.slice(imports.indexOf('input-polish.css')));
  for (const name of dialogOnly) assert.ok(statSync(projectFile(`src/styles/${name}`)).size > 0, `${name} should not be empty`);
  // The other sheets load with the part that opens them, not with the page.
  for (const [file, sheet] of [
    ['src/app/runtime/legacy-core/settings-modal-lifecycle.js', 'settings-dialog.css'],
    ['src/app/runtime/features/conversation-search-modal.js', 'conversation-search.css'],
    ['src/app/runtime/features/latest-update-notice.js', 'update-log.css'],
    ['src/app/ui/charts/chart-styles.js', 'charts.css'],
    ['src/app/legacy-runtime/features/generated-image-interactions.js', 'generated-image-editor.css']
  ]) {
    assert.ok(readSource(file).includes(`import('../../../styles/${sheet}')`), `${file} should load ${sheet} when it opens`);
  }
  assert.ok(readSource('src/app/ui/cli/cli-store.css').includes("@import '../../../styles/permissions.css';"));
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
