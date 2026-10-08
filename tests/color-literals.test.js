import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

// The colours of the interface are the names of src/styles/tokens.css (docs/superpowers/specs/2026-10-08-dark-mode-design.md): a style that writes
// a colour of its own looks wrong in one of the two themes. The colours still written out are counted per file and may only go down:
// when you replace some, run `UPDATE_COLOR_BASELINE=1 node --test tests/color-literals.test.js` to lower the number.

const root = new URL('../', import.meta.url).pathname;
const BASELINE = join(root, 'tests', 'color-literals-baseline.json');
// The files that define the colours, and the ones that are about colours by nature.
const EXEMPT = new Set(['src/styles/tokens.css', 'src/styles/dark-bridge.css', 'src/app/ui/files/design/deck-design-picker.css', 'src/styles/generated-image-editor.css']);

const cssFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return cssFiles(path);
  return path.endsWith('.css') ? [path] : [];
});

const countLiterals = (css) => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // A fallback inside var(--name, #fff) is not a colour of the style: the name decides.
  const withoutFallbacks = body.replace(/var\(--[a-z0-9-]+,\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\)/g, 'var(--x)');
  return (withoutFallbacks.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || []).length;
};

const current = () => Object.fromEntries(
  cssFiles(join(root, 'src'))
    .map((path) => [relative(root, path), countLiterals(readFileSync(path, 'utf8'))])
    .filter(([path]) => !EXEMPT.has(path))
    .sort(([a], [b]) => a.localeCompare(b))
);

test('stylesheets do not write more colours of their own than before', () => {
  const now = current();
  if (process.env.UPDATE_COLOR_BASELINE || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  for (const [path, count] of Object.entries(now)) {
    assert.ok(count <= (baseline[path] ?? 0), `${path}: ${count} colours written out (allowed ${baseline[path] ?? 0}). Use the names of src/styles/tokens.css (var(--text-primary), var(--modal-bg)...) instead.`);
  }
});
