import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

// Like the stylesheets (tests/color-literals.test.js), the code of the interface does not write colours of its own: a colour in a script is
// either a name of src/styles/tokens.css (var(--text-primary), currentColor) or it belongs to one of the places below, where a colour is the
// data: what the person chooses, the colours of the documents we make, the series of a chart, the palette of a code theme.
// Anything else that needs a colour uses a name and lets the theme decide.

const root = new URL('../', import.meta.url).pathname;

const EXEMPT_DIRECTORIES = [
  // The files we make and their previews are paper: they look the same in both themes, and their colours are the design of the document.
  'src/app/ui/files/',
  'src/app/ui/sandbox/',
];
const EXEMPT_FILES = new Map([
  ['src/app/runtime/legacy-core/runtime-ui-colors.js', 'the colours a person chooses for folders, bubbles and the accent'],
  ['src/app/runtime/legacy-core/settings-history-menu-helper.js', 'the folder colours of the history menu (the same choices as runtime-ui-colors.js)'],
  ['src/app/legacy-runtime/data/folder-metadata.js', 'the text colours a person chooses for a folder'],
  ['src/utils/folder-colors.js', 'the grey a folder gets when its colour is unknown'],
  ['src/utils/accent-bubble.js', 'the bubble colours that go with each choice of the accent'],
  ['src/utils/color-contrast.js', 'picks black or white text for a colour a person chose'],
  ['src/app/runtime/legacy-core/legacy-core-utilities.js', 'hexToRgba: turns the colour a person chose into one with transparency'],
  ['src/app/runtime/kernel/config-store.js', 'the default accent of the settings'],
  ['src/app/runtime/kernel/config-normalization.js', 'the default accent of the settings'],
  ['src/app/runtime/features/theme-appearance-lifecycle.js', 'the default accent in the light and the dark theme'],
  ['src/app/runtime/features/color-scheme.js', 'the colour of the browser bar in the light and the dark theme'],
  ['src/app/ui/charts/chart-utils.js', 'the series of the charts in a reply'],
  ['src/app/legacy-runtime/features/model-usage-chart-lifecycle.js', 'the series of the usage chart'],
  ['src/app/runtime/legacy-core/core-tail-lifecycle.js', 'the series of the usage chart'],
  ['src/templates/fragments/02-shell.fragment.js', 'the default value of the colour picker of the accent'],
  ['src/app/ui/code/code-highlighter.js', 'the palettes of the code themes (the colours of a language in an editor, not of the interface)'],
  ['src/app/legacy-runtime/features/generated-image-interactions.js', 'the pen colours of the image editor'],
  ['src/app/bootstrap/vendor-bridge.js', 'a QR code is black on white so that a camera can read it'],
  ['src/app/ui/research/research-document.js', 'the accent of the PDF and the Word file of a research report'],
]);

const jsFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return jsFiles(path);
  return path.endsWith('.js') ? [path] : [];
});

const colorsWritten = (source) => {
  const body = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
    // var(--name, #fff): the name decides, the fallback is not a colour of the script. &#039; is an HTML entity.
    .replace(/var\(--[a-z0-9-]+,\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\)/g, 'var(--x)');
  return body.match(/(?<![&\w])#[0-9a-fA-F]{6}\b|(?<![&\w])#[0-9a-fA-F]{3}\b|\brgba?\(/g) || [];
};

test('scripts use the colour names of tokens.css and write no colour of their own', () => {
  const offenders = jsFiles(join(root, 'src'))
    .map((path) => [relative(root, path), colorsWritten(readFileSync(path, 'utf8')).length])
    .filter(([path, count]) => count > 0
      && !EXEMPT_FILES.has(path)
      && !EXEMPT_DIRECTORIES.some((directory) => path.startsWith(directory)));
  assert.deepEqual(offenders, [], 'Use a name of src/styles/tokens.css (var(--text-primary), currentColor...) instead of writing a colour.');
});

test('every exempt script still exists and still holds colours', () => {
  for (const path of EXEMPT_FILES.keys()) {
    assert.ok(colorsWritten(readFileSync(join(root, path), 'utf8')).length > 0, `${path} no longer writes a colour: remove it from the list.`);
  }
});
