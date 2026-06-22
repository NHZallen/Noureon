import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('outlined settings and trash actions use the shared white outline button style', () => {
  const shell03 = readSource('src/templates/fragments/03-shell.fragment.js');
  const shell04 = readSource('src/templates/fragments/04-shell.fragment.js');
  const runtime04 = readSource('src/app/legacy-runtime/fragments/04-runtime.fragment.js');

  for (const id of ['upload-wallpaper-btn', 'restore-wallpaper-btn', 'export-data-btn', 'import-data-btn', 'open-archived-modal-btn']) {
    assert.match(shell03, new RegExp(`id=\\\\"${id}\\\\"[^"]*class=\\\\"[^"]*btn-outline-white`));
  }

  for (const id of ['trash-batch-select-btn', 'empty-trash-btn']) {
    assert.match(shell04, new RegExp(`id=\\\\"${id}\\\\"[^"]*class=\\\\"[^"]*btn-outline-white`));
  }

  for (const className of ['trash-item-view-btn', 'trash-item-restore-btn', 'trash-item-delete-btn']) {
    assert.match(runtime04, new RegExp(`${className}[^\\n]+btn-outline-white`));
  }
});

test('attachment menu keeps search and learning items neutral instead of blue active text', () => {
  const css = readSource('src/styles/main.css');

  assert.match(css, /#attachment-menu\s+\.menu-item\.is-active/);
  assert.match(css, /#attachment-menu\s+\.menu-item\.is-active[^{]*\{[^}]*color:\s*#111827\s*!important;/s);
  assert.match(css, /#file-options-popover\s+#web-search-popover-btn,\s*#file-options-popover\s+#learning-mode-btn[^{]*\{[^}]*color:\s*#111827\s*!important;/s);
});

test('settings navigation starts below the modal header divider on desktop', () => {
  const css = readSource('src/styles/main.css');

  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*margin-top:\s*4\.5rem(?:\s*!important)?;/s);
  assert.match(css, /#settings-modal\s+\.settings-sidebar\s*\{[^}]*height:\s*calc\(100%\s*-\s*4\.5rem\)(?:\s*!important)?;/s);
});

test('folder color rendering supports saved css color values without falling back', () => {
  const runtime01 = readSource('src/app/legacy-runtime/fragments/01-runtime.fragment.js');
  const runtime02 = readSource('src/app/legacy-runtime/fragments/02-runtime.fragment.js');
  const runtime00 = readSource('src/app/legacy-runtime/fragments/00-runtime.fragment.js');
  const css = readSource('src/styles/main.css');

  assert.match(runtime00, /resolveFolderColor/);
  assert.match(runtime01, /resolveFolderColor\(folder\.color,\s*FOLDER_COLORS,\s*FOLDER_COLORS\.gray\)/);
  assert.match(runtime01, /--folder-icon-color:\s*\$\{iconColor\}/);
  assert.match(runtime02, /normalizeFolderColorSelection\(selectedColor,\s*FOLDER_COLORS\)/);
  assert.match(css, /\.folder-icon\s*\{[^}]*color:\s*var\(--folder-icon-color,\s*inherit\)\s*!important;/s);
});
