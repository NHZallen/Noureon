import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// legacy-core.js pulls ~65 functions out of the transition bus with one big
//   const { ... } = transitionBusLifecycle;
// destructuring, but that statement sits hundreds of lines below code that already runs. Reading
// one of those names above the declaration is a temporal dead zone error, which crashed bootstrap
// in dev with "Cannot access 'applyCustomWallpaper' before initialization". The production bundle
// happened to hide it, so nothing caught it.
//
// Passing such a name lazily — applyUiTheme: (...args) => applyUiTheme(...args) — is fine, because
// the lookup happens at call time; that is this file's dependency-wiring idiom for lifecycles
// created before the transition bus. Only a direct read before the declaration is a defect.

const source = readFileSync(
  new URL('../src/app/runtime/legacy-core/legacy-core.js', import.meta.url),
  'utf8'
);

// Comments mention these names when explaining the hazard; only real code counts.
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const findDestructuringBlock = (lines) => {
  let start = null;
  for (const [index, line] of lines.entries()) {
    if (/^\s*const \{\s*$/.test(line)) start = index;
    if (start !== null && /^\s*\} = transitionBusLifecycle;/.test(line)) {
      return { start, end: index };
    }
  }
  return null;
};

test('legacy-core does not read transition bus bindings before they are declared', () => {
  const lines = source.split('\n');
  const block = findDestructuringBlock(lines);
  assert.ok(block, 'the transition bus destructuring block should exist');

  const declared = new Set();
  for (const line of lines.slice(block.start + 1, block.end)) {
    const match = /^\s*([A-Za-z_$][\w$]*)\s*,?\s*$/.exec(line);
    if (match) declared.add(match[1]);
  }
  assert.ok(declared.size > 40, `expected many bindings, found ${declared.size}`);

  const beforeDeclaration = stripComments(lines.slice(0, block.start).join('\n'));

  // Object shorthand (`{ name, ... }`) and bare references read the binding immediately.
  // A property whose value is a wrapper (`name: (...args) => name(...args)`) does not.
  const leaked = [...declared]
    .filter(name => new RegExp(`[,{\\s]${name}\\s*[,}]`).test(beforeDeclaration))
    .sort();

  assert.deepEqual(
    leaked,
    [],
    'these transition bus bindings are read before their declaration; pass them lazily instead'
  );
});

test('the cloud workspace live lifecycle is created after the transition bus destructuring', () => {
  // It takes applyCustomWallpaper / applyUiTheme / applyLanguage as plain references, which is
  // only safe below the destructuring block. Moving it back up reintroduces the dev-only TDZ
  // crash this file already shipped once.
  const destructureEnd = source.indexOf('} = transitionBusLifecycle;');
  const cloudCreation = source.indexOf('createCloudWorkspaceLiveLifecycle({');
  assert.ok(destructureEnd >= 0, 'the destructuring block should exist');
  assert.ok(cloudCreation >= 0, 'the cloud workspace live lifecycle should be created');
  assert.ok(
    cloudCreation > destructureEnd,
    'createCloudWorkspaceLiveLifecycle must stay below the transition bus destructuring'
  );
});
