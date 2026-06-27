import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { projectFile, readSource } from './helpers/source-guards.js';

const helperPath = 'src/app/runtime/legacy-core/legacy-core-utilities.js';
const helperUrl = new URL(`../${helperPath}`, import.meta.url);
const helperExists = existsSync(helperUrl);
const helperModule = helperExists ? await import(helperUrl.href) : {};
const {
  createTrustedHtmlSanitizer,
  escapeHTML,
  getErrorMessage,
  hexToRgba,
  readErrorBody,
  renderUserText
} = helperModule;
const helperSource = helperExists ? readSource(helperPath) : '';
const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');

test('escapeHTML preserves the legacy escaping and coercion contract', () => {
  assert.equal(typeof escapeHTML, 'function');
  assert.equal(escapeHTML('<div class="x">Tom & Jerry\'s</div>'), '&lt;div class=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/div&gt;');
  assert.equal(escapeHTML(), '');
  assert.equal(escapeHTML(''), '');
  assert.equal(escapeHTML(null), 'null');
  assert.equal(escapeHTML(42), '42');
});

test('renderUserText escapes markup before converting newlines', () => {
  assert.equal(typeof renderUserText, 'function');
  assert.equal(renderUserText('<b>one</b>\ntwo & three'), '&lt;b&gt;one&lt;/b&gt;<br>two &amp; three');
  assert.equal(renderUserText(), '');
  assert.equal(renderUserText(null), 'null');
});

test('trusted HTML sanitizer uses the injected sanitizer and preserves fallback escaping', () => {
  assert.equal(typeof createTrustedHtmlSanitizer, 'function');
  const calls = [];
  const sanitizeTrustedHTML = createTrustedHtmlSanitizer({
    sanitizer: {
      sanitize(value) {
        calls.push(value);
        return `SAFE:${value}`;
      }
    }
  });
  const fallbackSanitizer = createTrustedHtmlSanitizer({ sanitizer: null });

  assert.equal(sanitizeTrustedHTML('<strong>safe</strong>'), 'SAFE:<strong>safe</strong>');
  assert.equal(sanitizeTrustedHTML(null), 'SAFE:null');
  assert.deepEqual(calls, ['<strong>safe</strong>', 'null']);
  assert.equal(fallbackSanitizer('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(fallbackSanitizer(), '');
});

test('readErrorBody parses JSON and preserves text/status fallbacks', async () => {
  assert.equal(typeof readErrorBody, 'function');
  assert.deepEqual(
    await readErrorBody({ text: async () => '{"error":{"message":"bad"}}', statusText: 'Bad Request' }),
    { error: { message: 'bad' } }
  );
  assert.deepEqual(
    await readErrorBody({ text: async () => 'plain failure', statusText: 'Bad Request' }),
    { error: { message: 'plain failure' } }
  );
  assert.deepEqual(
    await readErrorBody({ text: async () => '', statusText: 'Bad Request' }),
    { error: { message: 'Bad Request' } }
  );
  await assert.rejects(
    () => readErrorBody({ text: async () => { throw new Error('read failed'); } }),
    /read failed/
  );
});

test('getErrorMessage preserves nested, top-level, custom, and default fallbacks', () => {
  assert.equal(typeof getErrorMessage, 'function');
  assert.equal(getErrorMessage({ error: { message: 'nested' }, message: 'top' }), 'nested');
  assert.equal(getErrorMessage({ message: 'top' }), 'top');
  assert.equal(getErrorMessage({}, 'HTTP 500'), 'HTTP 500');
  assert.equal(getErrorMessage(null), 'API 請求失敗');
  assert.equal(getErrorMessage({ error: { message: '' }, message: '' }, 'fallback'), 'fallback');
});

test('hexToRgba preserves valid, invalid, missing, and alpha behavior', () => {
  assert.equal(typeof hexToRgba, 'function');
  assert.equal(hexToRgba('#ffffff'), 'rgba(255, 255, 255, 1)');
  assert.equal(hexToRgba('0a10FF', 0.4), 'rgba(10, 16, 255, 0.4)');
  assert.equal(hexToRgba('#abc', 0.5), 'rgba(255, 255, 255, 0.5)');
  assert.equal(hexToRgba('not-a-color'), 'rgba(255, 255, 255, 1)');
  assert.equal(hexToRgba(null, 0), 'rgba(255, 255, 255, 0)');
});

test('legacy core imports pure utilities without retaining their full inline bodies', () => {
  assert.equal(existsSync(projectFile(helperPath)), true);
  assert.match(
    legacyCoreSource,
    /from\s+['"]\/src\/app\/runtime\/legacy-core\/legacy-core-utilities\.js['"]/
  );
  assert.match(legacyCoreSource, /createTrustedHtmlSanitizer\(\{\s*sanitizer:\s*DOMPurify\s*\}\)/);
  for (const name of ['escapeHTML', 'renderUserText', 'readErrorBody', 'getErrorMessage', 'hexToRgba']) {
    assert.doesNotMatch(
      legacyCoreSource,
      new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*(?:\\{|\\()`)
    );
  }

  assert.doesNotMatch(
    helperSource,
    /legacyRuntimeContext|registerLazyBinding|resolveBinding|resolveOptionalBinding|\bdocument\b|\bwindow\b|globalThis/
  );
  assert.doesNotMatch(
    helperSource,
    /^import\s+[\s\S]*?from\s+['"][^'"]*(?:runtime-entry|app-bootstrap|startup-lifecycle|sidebar|settings|input|submit|provider)[^'"]*['"]/m
  );
});
