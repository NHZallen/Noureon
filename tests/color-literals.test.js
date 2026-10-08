import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

// The colours of the interface are the names of src/styles/tokens.css (docs/superpowers/specs/2026-10-08-dark-mode-design.md): a style that writes
// a colour of its own looks wrong in one of the two themes. So a stylesheet does not write colours at all: it uses var(--text-primary), var(--modal-bg),
// var(--shadow-md)... and a colour that is missing gets a name in tokens.css, with its light and its dark value.

const root = new URL('../', import.meta.url).pathname;
// The files that define the colours, and the ones that are about colours by nature.
const EXEMPT = new Set(['src/styles/tokens.css', 'src/styles/dark-bridge.css', 'src/app/ui/files/design/deck-design-picker.css', 'src/styles/generated-image-editor.css']);

const cssFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return cssFiles(path);
  return path.endsWith('.css') ? [path] : [];
});

const colorsWritten = (css) => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // A fallback inside var(--name, #fff) is not a colour of the style: the name decides. #add-file-btn is an id, not a colour.
  const withoutFallbacks = body.replace(/var\(--[a-z0-9-]+,\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\)/g, 'var(--x)');
  return withoutFallbacks.match(/#[0-9a-fA-F]{3,8}(?![\w-])|rgba?\(/g) || [];
};

test('stylesheets use the colour names of tokens.css and write no colour of their own', () => {
  const offenders = cssFiles(join(root, 'src'))
    .map((path) => [relative(root, path), colorsWritten(readFileSync(path, 'utf8')).length])
    .filter(([path, count]) => !EXEMPT.has(path) && count > 0);
  assert.deepEqual(offenders, [], 'Use the names of src/styles/tokens.css (var(--text-primary), var(--modal-bg)...) instead of writing a colour.');
});
