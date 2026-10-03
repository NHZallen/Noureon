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

test('the container image holds what the server needs: its modules load from a copy made the way the Dockerfile makes it', async () => {
  const { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /^COPY server \.\/server$/m);
  assert.match(dockerfile, /^COPY src \.\/src$/m);
  const ignored = readFileSync(join(process.cwd(), '.dockerignore'), 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  assert.equal(ignored.includes('src'), false, 'the shared modules must not be left out of the image');
  assert.ok(ignored.includes('!src/assets/fonts'), 'the fonts embedded in files are in the image');
  assert.match(dockerfile, /npm install[^\n]*jszip@[\d.]+ harfbuzzjs@[\d.]+/, 'with the tools that embed them');
  assert.match(dockerfile, /npm install[^\n]*@resvg\/resvg-js@[\d.]+[^\n]*\|\| echo/, 'and, tolerated if they cannot be had, the tools that draw slides');
  const copy = mkdtempSync(join(tmpdir(), 'noureon-image-'));
  try {
    cpSync(join(process.cwd(), 'package.json'), join(copy, 'package.json'));
    cpSync(join(process.cwd(), 'server'), join(copy, 'server'), { recursive: true });
    cpSync(join(process.cwd(), 'src'), join(copy, 'src'), { recursive: true, filter: (from) => !from.includes(`${join('src', 'assets')}`) });
    // The packages the image installs (check:server makes sure they are all there): the copy borrows the project's.
    symlinkSync(join(process.cwd(), 'node_modules'), join(copy, 'node_modules'), 'dir');
    for (const name of readdirSync(join(copy, 'server')).filter((entry) => entry.endsWith('.js') && entry !== 'main.js')) {
      await import(pathToFileURL(join(copy, 'server', name)).href);
    }
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('the server never reads the workspace tables itself: the database lets it call the message functions only', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const folder = join(process.cwd(), 'server');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.js') && /\b(?:select|update|insert|delete)\(\s*['"]workspace_/.test(readFileSync(path, 'utf8'))) offenders.push(path);
    }
  };
  walk(folder);
  assert.deepEqual(offenders, [], 'go through a function of the database (supabase/migrations/20261003020000_add_server_run_functions.sql)');
});
