import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import * as sandbox from '../../public/sandbox/protocol.js';
import * as app from '../../src/app/runtime/sandbox/sandbox-protocol.js';
import { ARCHIVE_EXTENSIONS, isBlockedFileExtension } from '../../src/app/ui/files/file-type-registry.js';
import { SANDBOX_DEV_CSP } from '../../vite.config.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const withoutFrameAncestors = (csp) => csp.replace(/frame-ancestors [^;]+;/, '');

test('the app and the sandbox agree on the protocol', () => {
  assert.equal(app.PROTOCOL_VERSION, sandbox.PROTOCOL_VERSION);
  assert.equal(app.PRODUCTION_SANDBOX_ORIGIN, sandbox.PRODUCTION_SANDBOX_ORIGIN);
  assert.deepEqual(app.PRODUCTION_APP_ORIGINS, sandbox.PRODUCTION_APP_ORIGINS);
  assert.deepEqual(app.MESSAGE_TYPES, sandbox.MESSAGE_TYPES);
  assert.equal(app.SANDBOX_LIMITS.runTimeoutMs, sandbox.LIMITS.runTimeoutMs);
  assert.equal(app.SANDBOX_LIMITS.inputTotalBytes, sandbox.LIMITS.inputTotalBytes);
  // The service worker is a classic script with its own copies.
  const worker = read('public/sandbox/sw.js');
  assert.match(worker, new RegExp(`const PYODIDE_VERSION = '${sandbox.PYODIDE_VERSION.replaceAll('.', '\\.')}';`));
  assert.ok(worker.includes(`const WHEEL_ORIGIN_PLACEHOLDER = '${sandbox.WHEEL_ORIGIN_PLACEHOLDER}';`));
  assert.ok(worker.includes('const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;'));
});

test('the app finds its sandbox on another origin, and the sandbox only answers its app', () => {
  const at = (href) => new URL(href);
  assert.equal(app.resolveSandboxOrigin(at('https://noureon.com/chat')), 'https://run.noureon.com');
  assert.equal(app.resolveSandboxOrigin(at('https://www.noureon.com/')), 'https://run.noureon.com');
  assert.equal(app.resolveSandboxOrigin(at('http://localhost:5173/')), 'http://127.0.0.1:5173');
  assert.equal(app.resolveSandboxOrigin(at('http://127.0.0.1:4173/')), 'http://localhost:4173');
  assert.equal(app.resolveSandboxOrigin(at('https://noureon.vercel.app/')), null);
  assert.equal(app.resolveSandboxOrigin(at('http://192.168.1.5:5173/')), null);
  assert.equal(app.resolveSandboxOrigin(at('https://noureon.com/'), 'http://x.test:9/'), 'http://x.test:9');

  assert.equal(sandbox.isAllowedSandboxOrigin('https://run.noureon.com'), true);
  assert.equal(sandbox.isAllowedSandboxOrigin('http://127.0.0.1:5173'), true);
  assert.equal(sandbox.isAllowedSandboxOrigin('https://noureon.com'), false);
  assert.equal(sandbox.isAllowedSandboxOrigin('https://evil.example'), false);

  assert.equal(sandbox.isAllowedAppOrigin('https://noureon.com', 'https://run.noureon.com'), true);
  assert.equal(sandbox.isAllowedAppOrigin('https://www.noureon.com', 'https://run.noureon.com'), true);
  assert.equal(sandbox.isAllowedAppOrigin('https://evil.example', 'https://run.noureon.com'), false);
  assert.equal(sandbox.isAllowedAppOrigin('https://run.noureon.com', 'https://run.noureon.com'), false);
  assert.equal(sandbox.isAllowedAppOrigin('http://localhost:5173', 'https://run.noureon.com'), false);
  assert.equal(sandbox.isAllowedAppOrigin('http://localhost:5173', 'http://127.0.0.1:5173'), true);
  assert.equal(sandbox.isAllowedAppOrigin('http://localhost:4173', 'http://127.0.0.1:5173'), false);
  assert.equal(sandbox.isAllowedAppOrigin('http://127.0.0.1:5173', 'http://127.0.0.1:5173'), false);
});

test('the worker may only fetch the pinned Pyodide files and the sandbox files', () => {
  const origin = 'https://run.noureon.com';
  assert.equal(sandbox.isAllowedFetchUrl(`${sandbox.PYODIDE_CDN}numpy.whl`, origin), true);
  assert.equal(sandbox.isAllowedFetchUrl(`${sandbox.PYODIDE_CDN}numpy.whl?data=secret`, origin), false);
  assert.equal(sandbox.isAllowedFetchUrl('https://cdn.jsdelivr.net/pyodide/v0.1.0/full/x.whl', origin), false);
  assert.equal(sandbox.isAllowedFetchUrl('https://cdn.jsdelivr.net/npm/anything', origin), false);
  assert.equal(sandbox.isAllowedFetchUrl(`${origin}/sandbox/wheels/a.whl`, origin), true);
  assert.equal(sandbox.isAllowedFetchUrl(`${origin}/api/nvidia-chat`, origin), false);
  assert.equal(sandbox.isAllowedFetchUrl('https://noureon.com/sandbox/x', origin), false);
  assert.equal(sandbox.isAllowedFetchUrl('https://example.com/', origin), false);
  assert.equal(sandbox.isAllowedFetchUrl('not a url', origin), false);
});

test('blocked outputs are the Standard mode list without archives', () => {
  for (const extension of sandbox.BLOCKED_OUTPUT_EXTENSIONS) {
    assert.equal(isBlockedFileExtension(extension), true, extension);
  }
  for (const extension of ARCHIVE_EXTENSIONS) {
    assert.equal(sandbox.isBlockedOutputName(`a.${extension}`), false, extension);
  }
  assert.equal(sandbox.isBlockedOutputName('report.XLSM'), true);
  assert.equal(sandbox.isBlockedOutputName('setup.exe'), true);
  assert.equal(sandbox.isBlockedOutputName('script.js'), false);
  assert.equal(sandbox.isBlockedOutputName('data.csv'), false);
});

test('the sandbox host gets its own enforced CSP, and the app host cannot serve the sandbox', () => {
  const sandboxRule = vercel.headers.find((rule) => rule.has?.some((condition) => condition.value === 'run.noureon.com'));
  const appRule = vercel.headers.find((rule) => rule.missing?.some((condition) => condition.value === 'run.noureon.com'));
  assert.ok(sandboxRule && appRule);
  const enforced = sandboxRule.headers.find((header) => header.key === 'Content-Security-Policy')?.value;
  assert.ok(enforced, 'enforced, not report-only');
  assert.match(enforced, /frame-ancestors https:\/\/noureon\.com https:\/\/www\.noureon\.com;/);
  assert.doesNotMatch(enforced, /[\s;]'unsafe-(?:eval|inline)'/);
  assert.equal(withoutFrameAncestors(enforced), withoutFrameAncestors(SANDBOX_DEV_CSP), 'development uses the same policy');
  assert.ok(enforced.includes(`connect-src 'self' ${sandbox.PYODIDE_CDN};`));
  assert.ok(!sandboxRule.headers.some((header) => header.key === 'X-Frame-Options'));

  const appCsp = appRule.headers.find((header) => header.key.startsWith('Content-Security-Policy'))?.value;
  assert.match(appCsp, /frame-src [^;]*https:\/\/run\.noureon\.com/);

  const toSandbox = vercel.redirects.find((rule) => rule.source === '/sandbox/:path*');
  assert.equal(toSandbox.destination, 'https://run.noureon.com/sandbox/:path*');
  assert.equal(toSandbox.missing[0].value, 'run.noureon.com');
  const offSandbox = vercel.redirects.find((rule) => rule.has?.[0]?.value === 'run.noureon.com');
  assert.equal(offSandbox.destination, 'https://noureon.com/');
  assert.ok(new RegExp(`^${offSandbox.source}$`).test('/'));
  assert.ok(new RegExp(`^${offSandbox.source}$`).test('/assets/index.js'));
  assert.ok(!new RegExp(`^${offSandbox.source}$`).test('/sandbox/index.html'));
});

test('the committed lock file lists our wheels with matching files and hashes', () => {
  const lock = JSON.parse(read('public/sandbox/pyodide/pyodide-lock.json'));
  const integrity = JSON.parse(read('public/sandbox/pyodide/integrity.json'));
  assert.equal(integrity.version, sandbox.PYODIDE_VERSION);
  assert.deepEqual(Object.keys(integrity.core).sort(), ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip']);
  const ours = Object.values(lock.packages).filter((entry) => entry.file_name.startsWith(sandbox.WHEEL_ORIGIN_PLACEHOLDER));
  assert.deepEqual(ours.map((entry) => entry.name).sort(), [
    'defusedxml', 'et-xmlfile', 'fpdf2', 'openpyxl', 'pypdf', 'python-docx', 'python-pptx', 'xlsxwriter'
  ]);
  for (const entry of ours) {
    const path = entry.file_name.replace(`${sandbox.WHEEL_ORIGIN_PLACEHOLDER}/`, 'public/');
    assert.ok(existsSync(new URL(`../../${path}`, import.meta.url)), path);
    const hash = createHash('sha256').update(readFileSync(new URL(`../../${path}`, import.meta.url))).digest('hex');
    assert.equal(hash, entry.sha256, path);
    for (const dependency of entry.depends) assert.ok(lock.packages[dependency], `${entry.name} → ${dependency}`);
  }
  assert.deepEqual(lock.packages['python-docx'].imports, ['docx']);
  assert.deepEqual(lock.packages['python-pptx'].imports, ['pptx']);
  assert.deepEqual(lock.packages.fpdf2.imports, ['fpdf']);
  assert.doesNotMatch(read('public/sandbox/pyodide/pyodide.mjs'), /sourceMappingURL/);
});
