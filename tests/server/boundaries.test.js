import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import { checkServer, checkServerSource } from '../../scripts/check-server-boundaries.mjs';

const file = join(process.cwd(), 'server', 'example.js');

test('the real server has no browser code and imports nothing it should not', () => {
  assert.deepEqual(checkServer(), []);
});

test('a browser global is caught, but words in comments and strings are not', () => {
  assert.equal(checkServerSource(file, "const width = window.innerWidth;\n").length, 1);
  assert.equal(checkServerSource(file, "document.createElement('div');\n").length, 1);
  assert.equal(checkServerSource(file, "localStorage.setItem('a', 'b');\n").length, 1);
  assert.deepEqual(checkServerSource(file, "// the window is not touched here\n/* document.body */\nconst text = 'window.location and document.cookie';\n"), []);
  assert.deepEqual(checkServerSource(file, "const documentation = 1; const windowed = 2;\n"), []);
});

test('a module of the app may be imported only when it is on the list', () => {
  const source = "import { thing } from '../src/app/some/module.js';\n";
  assert.equal(checkServerSource(file, source, []).length, 1);
  assert.deepEqual(checkServerSource(file, source, ['src/app/some/module.js']), []);
  assert.equal(checkServerSource(file, "import x from '/src/app/ui/a.js';\n", []).length, 1, 'an absolute path too');
  assert.equal(checkServerSource(file, "const m = await import('../src/app/b.js');\n", []).length, 1, 'and a dynamic import');
  assert.equal(checkServerSource(file, "import x from '../scripts/tool.js';\n", []).length, 1, 'but not outside the server folder either');
  assert.deepEqual(checkServerSource(file, "import { createServer } from 'node:http';\nimport { a } from './auth.js';\nimport z from 'a-package';\n", []), []);
});
