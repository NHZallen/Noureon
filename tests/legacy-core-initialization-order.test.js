import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// legacy-core.js pulls the workspace features and the page features out with two big
//   const { ... } = workspaceFeatures;   const { ... } = createPageFeatures({ ... });
// destructurings, but they sit hundreds of lines below code that already runs. Reading one of
// those names above its declaration is a temporal dead zone error, which once crashed bootstrap
// in dev with "Cannot access 'applyBubbleColors' before initialization". The production bundle
// happened to hide it, so nothing caught it.
//
// Passing such a name lazily — applyUiTheme: (...args) => applyUiTheme(...args) — is fine, because
// the lookup happens at call time; that is this file's dependency-wiring idiom for lifecycles
// created before those features. Only a direct read before the declaration is a defect.

const source = readFileSync(
  new URL('../src/app/runtime/shell/shell.js', import.meta.url),
  'utf8'
);

// Comments mention these names when explaining the hazard; only real code counts.
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const findDestructuringBlock = (lines, endPattern) => {
  let start = null;
  for (const [index, line] of lines.entries()) {
    if (/^\s*const \{\s*$/.test(line)) start = index;
    if (start !== null && endPattern.test(line)) {
      return { start, end: index };
    }
  }
  return null;
};

// The names a block declares: `name,` or `property: name,`, several on a line.
const declaredNames = (lines) => new Set(lines.join(',').split(',')
  .map((entry) => entry.trim().split(':').pop().trim())
  .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name)));

const blocks = [
  ['workspace features', /^\s*\} = workspaceFeatures;/],
  ['page features', /^\s*\} = createPageFeatures\(\{/]
];

for (const [label, endPattern] of blocks) {
  test(`legacy-core does not read the ${label} before they are declared`, () => {
    const lines = source.split('\n');
    const block = findDestructuringBlock(lines, endPattern);
    assert.ok(block, `the ${label} destructuring block should exist`);

    const declared = declaredNames(lines.slice(block.start + 1, block.end));
    assert.ok(declared.size > 20, `expected many bindings, found ${declared.size}`);

    const beforeDeclaration = stripComments(lines.slice(0, block.start).join('\n'));

    // Object shorthand (`{ name, ... }`) and bare references read the binding immediately.
    // A property whose value is a wrapper (`name: (...args) => name(...args)`) does not.
    const leaked = [...declared]
      .filter(name => new RegExp(`[,{\\s]${name}\\s*[,}]`).test(beforeDeclaration))
      .sort();

    assert.deepEqual(leaked, [], `these ${label} are read before their declaration; pass them lazily instead`);
  });
}

test('the cloud workspace live lifecycle is created after the page features', () => {
  // It takes applyUiTheme / applyLanguage as plain references, which is only safe below the
  // destructuring of the page features. Moving it back up reintroduces the dev-only TDZ
  // crash this file already shipped once.
  const pageFeatures = source.indexOf('} = createPageFeatures({');
  const cloudCreation = source.indexOf('createCloudWorkspaceLiveLifecycle({');
  assert.ok(pageFeatures >= 0, 'the page features should be made');
  assert.ok(cloudCreation >= 0, 'the cloud workspace live lifecycle should be created');
  assert.ok(cloudCreation > pageFeatures, 'createCloudWorkspaceLiveLifecycle must stay below the page features');
});
