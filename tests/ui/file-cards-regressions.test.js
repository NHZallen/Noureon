import assert from 'node:assert/strict';
import test from 'node:test';

import { readSource } from '../helpers/source-guards.js';

test('file card colours follow the text colour so they stay legible', () => {
  const css = readSource('src/styles/file-cards.css');
  const cardRule = /\.ac-file-card \{[\s\S]*?\n\}/.exec(css)?.[0] || '';
  // A background built from --input-field-bg would put light text on a light card
  // when only the text variables change.
  assert.doesNotMatch(cardRule, /input-field-bg/);
  assert.match(cardRule, /background: color-mix\(in srgb, var\(--text-primary/);
  assert.match(css, /\.ac-file-action \.ac-file-action-icon \{[\s\S]*?color: inherit;/, 'overrides the global body svg colour');
  assert.doesNotMatch(css, /\.ac-file-preview \{[\s\S]*?--text-primary: #111827;/, 'the dialog follows the theme');
  assert.match(css, /\.ac-file-preview-pages > :not\(\.ac-file-preview-note\)[^{]*\{[^}]*color: #111827;/, 'the pages inside are paper: dark text on white');
});

test('file card styles ship with the lazily loaded chat runtime, not the startup stylesheet', () => {
  assert.doesNotMatch(readSource('src/styles/main.css'), /file-cards\.css/);
  assert.match(readSource('src/app/legacy-app.js'), /import '\.\.\/styles\/file-cards\.css';/);
});

test('Tailwind does not scan document generators, page previews or the design system for utility classes', () => {
  const config = readSource('tailwind.config.js');
  assert.match(config, /'!\.\/src\/app\/ui\/files\/generators\/\*\*'/);
  assert.match(config, /'!\.\/src\/app\/ui\/files\/previews\/\*\*'/);
  assert.match(config, /'!\.\/src\/app\/ui\/files\/design\/\*\*'/);
});

test('scanned file modules never negate a variable named block', () => {
  // Tailwind reads "!block" as an important utility and grows the startup
  // stylesheet, which is already at its size budget.
  for (const path of ['file-block-protocol.js', 'file-block-model.js', 'file-history-compaction.js', 'file-markdown-cards.js']) {
    assert.doesNotMatch(readSource(`src/app/ui/files/${path}`), /!block\b/, path);
  }
});

test('document generator and preview vendors are split out and never precached', () => {
  const vite = readSource('vite.config.js');
  assert.match(vite, /return 'vendor-docx';/);
  assert.match(vite, /return 'vendor-docx-preview';/);
  const worker = readSource('public/service-worker.js');
  const source = /ON_DEMAND_ASSET_PATTERN = \/(.+)\/i;/.exec(worker)?.[1];
  assert.ok(source, 'the worker declares its on-demand asset pattern');
  const onDemand = new RegExp(source, 'i');
  assert.ok(onDemand.test('assets/vendor-docx-Ab12.js'));
  assert.ok(onDemand.test('assets/vendor-docx-preview-Ab12.js'), 'the preview vendor is not precached');
  assert.match(vite, /return 'vendor-pptx';/);
  assert.ok(onDemand.test('assets/vendor-pptx-Ab12.js'));
  assert.ok(!onDemand.test('assets/vendor-markdown-Ab12.js'));
  assert.match(worker, /ON_DEMAND_ASSET_PATTERN\.test\(path\)\) continue;/);
});

test('generators, previews, the design system, the preview dialog and the guidance stay out of the eager file chunk', () => {
  const vite = readSource('vite.config.js');
  assert.match(vite, /return 'runtime-files';/);
  for (const lazy of ['/src/app/ui/files/generators/', '/src/app/ui/files/previews/', '/src/app/ui/files/design/', 'file-preview-dialog.js', 'file-authoring-guidance.js']) {
    assert.ok(vite.includes(lazy), `${lazy} must be excluded from runtime-files`);
  }
  const generators = readSource('src/app/ui/files/file-generators.js');
  assert.match(generators, /import\('\.\/generators\/text-file\.js'\)/);
  assert.match(generators, /import\('\.\/generators\/pptx-file\.js'\)/);
  // Font files and the subsetter are fetched only when a deck is generated.
  const assets = readSource('src/app/ui/files/generators/pptx-assets.js');
  assert.match(assets, /import\.meta\.glob\('[^']+\/assets\/fonts\/\*\.ttf', \{ query: '\?url'/);
  assert.match(assets, /harfbuzz-subset\.wasm\?url/);
  const interactions = readSource('src/app/ui/files/file-card-interactions.js');
  assert.match(interactions, /await import\('\.\/file-preview-dialog\.js'\)/);
  assert.doesNotMatch(interactions, /from '\.\/file-preview-dialog\.js'/);
  const streamApi = readSource('src/app/legacy-runtime/features/stream-api-call.js');
  assert.match(streamApi, /await import\('\.\.\/\.\.\/ui\/files\/file-authoring-guidance\.js'\)/);
});
