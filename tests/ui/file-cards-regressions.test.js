import assert from 'node:assert/strict';
import test from 'node:test';

import { readSource } from '../helpers/source-guards.js';

test('file card colours follow the text colour so dark wallpapers stay legible', () => {
  const css = readSource('src/styles/file-cards.css');
  const cardRule = /\.ac-file-card \{[\s\S]*?\n\}/.exec(css)?.[0] || '';
  // Dark wallpapers flip only the text variables; a background built from
  // --input-field-bg would put light text on a light card.
  assert.doesNotMatch(cardRule, /input-field-bg/);
  assert.match(cardRule, /background: color-mix\(in srgb, var\(--text-primary/);
  assert.match(css, /\.ac-file-action \.ac-file-action-icon \{[\s\S]*?color: inherit;/, 'overrides the global body svg colour');
  assert.match(css, /\.ac-file-preview \{[\s\S]*?--text-primary: #111827;/, 'the always-light dialog pins dark text');
});

test('file card styles ship with the lazily loaded chat runtime, not the startup stylesheet', () => {
  assert.doesNotMatch(readSource('src/styles/main.css'), /file-cards\.css/);
  assert.match(readSource('src/app/legacy-app.js'), /import '\.\.\/styles\/file-cards\.css';/);
});

test('Tailwind does not scan document generators for utility classes', () => {
  assert.match(readSource('tailwind.config.js'), /'!\.\/src\/app\/ui\/files\/generators\/\*\*'/);
});

test('scanned file modules never negate a variable named block', () => {
  // Tailwind reads "!block" as an important utility and grows the startup
  // stylesheet, which is already at its size budget.
  for (const path of ['file-block-protocol.js', 'file-block-model.js', 'file-history-compaction.js', 'file-markdown-cards.js']) {
    assert.doesNotMatch(readSource(`src/app/ui/files/${path}`), /!block\b/, path);
  }
});

test('document generator vendors are split out and never precached', () => {
  assert.match(readSource('vite.config.js'), /return 'vendor-docx';/);
  const worker = readSource('public/service-worker.js');
  assert.match(worker, /ON_DEMAND_ASSET_PATTERN = \/\(\?:\^\|\\\/\)vendor-\(\?:docx\|xlsx\|pptx\|pdf\)-/);
  assert.match(worker, /ON_DEMAND_ASSET_PATTERN\.test\(path\)\) continue;/);
});

test('generators, the preview dialog and the guidance stay out of the eager file chunk', () => {
  const vite = readSource('vite.config.js');
  assert.match(vite, /return 'runtime-files';/);
  for (const lazy of ['/src/app/ui/files/generators/', 'file-preview-dialog.js', 'file-authoring-guidance.js']) {
    assert.ok(vite.includes(lazy), `${lazy} must be excluded from runtime-files`);
  }
  const generators = readSource('src/app/ui/files/file-generators.js');
  assert.match(generators, /import\('\.\/generators\/text-file\.js'\)/);
  const interactions = readSource('src/app/ui/files/file-card-interactions.js');
  assert.match(interactions, /await import\('\.\/file-preview-dialog\.js'\)/);
  assert.doesNotMatch(interactions, /from '\.\/file-preview-dialog\.js'/);
  const streamApi = readSource('src/app/legacy-runtime/features/stream-api-call.js');
  assert.match(streamApi, /await import\('\.\.\/\.\.\/ui\/files\/file-authoring-guidance\.js'\)/);
});
