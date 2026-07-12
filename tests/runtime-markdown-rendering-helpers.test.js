import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import katex from 'katex';
import { marked } from 'marked';
import { projectFile, readSource } from './helpers/source-guards.js';

const helperPath = 'src/app/runtime/legacy-core/markdown-rendering-helpers.js';
const helperUrl = new URL(`../${helperPath}`, import.meta.url);
const helperExists = existsSync(helperUrl);
const helperModule = helperExists ? await import(helperUrl.href) : {};
const { createMarkdownRenderingHelpers } = helperModule;
const helperSource = helperExists ? readSource(helperPath) : '';
const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');

function createHarness(overrides = {}) {
  const window = new Window({ url: 'https://example.test/' });
  class BrowserLikeDOMParser {
    parseFromString(html) {
      const parsedDocument = window.document.implementation.createHTMLDocument('');
      const bodyMatch = /^<body>([\s\S]*)<\/body>$/.exec(html);
      parsedDocument.body.innerHTML = bodyMatch ? bodyMatch[1] : html;
      return parsedDocument;
    }
  }
  const sanitizer = {
    sanitize(html) {
      const container = window.document.createElement('div');
      container.innerHTML = html;
      container.querySelectorAll('script').forEach((script) => script.remove());
      container.querySelectorAll('*').forEach((element) => {
        for (const attribute of [...element.attributes]) {
          if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
        }
      });
      return container.innerHTML;
    }
  };
  assert.equal(typeof createMarkdownRenderingHelpers, 'function', 'markdown rendering helper factory should be exported');
  const helpers = createMarkdownRenderingHelpers({
    marked,
    sanitizer,
    DOMParser: BrowserLikeDOMParser,
    katex,
    getUiLanguage: () => 'en',
    logger: console,
    ...overrides
  });
  return { helpers, sanitizer, window };
}

test('renders plain text, basic markdown, and code without changing markdown semantics', () => {
  const harness = createHarness();
  try {
    assert.match(harness.helpers.renderMarkdown('Plain text'), /<p>Plain text<\/p>/);
    assert.match(harness.helpers.renderMarkdown('**Bold**'), /<strong>Bold<\/strong>/);
    assert.match(harness.helpers.renderMarkdown('```html\n<script>alert(1)<\/script>\n```'), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  } finally {
    harness.window.close();
  }
});

test('preserves thinking labels and wraps rendered tables once', () => {
  const harness = createHarness();
  try {
    const thinking = harness.helpers.renderMarkdown('<think>  inspect this  </think>');
    assert.match(thinking, /<details class="thinking-collapse"><summary>Model thinking process<\/summary>/);
    assert.match(thinking, /inspect this/);

    const table = harness.helpers.renderMarkdown('| A | B |\n| - | - |\n| 1 | 2 |');
    assert.equal((table.match(/class="table-scroll-container"/g) || []).length, 1);
    assert.match(table, /<div class="table-scroll-container"><table>/);
  } finally {
    harness.window.close();
  }
});

test('renders numeric ranges without turning adjacent ranges into strikethrough', () => {
  const harness = createHarness();
  const html = harness.helpers.renderMarkdown('200~300 個，150~200 個，~~刪除~~');

  assert.match(html, /200–300 個，150–200 個/);
  assert.doesNotMatch(html, /<del>300 個，150<\/del>/);
  assert.match(html, /<del>刪除<\/del>/);
});

test('chat prose restores ordered and unordered list markers after the CSS reset', () => {
  const chatStyles = readSource('src/styles/chat.css');

  assert.match(chatStyles, /\.prose ol\s*\{\s*list-style-type:\s*decimal;/);
  assert.match(chatStyles, /\.prose ul\s*\{\s*list-style-type:\s*disc;/);
});

test('keeps the sanitizer handoff between markdown parsing and DOM rendering', () => {
  const calls = [];
  const harness = createHarness({
    marked: { parse: (text) => { calls.push(['parse', text]); return '<p>dirty</p><script>bad()</script>'; } },
    sanitizer: { sanitize: (html) => { calls.push(['sanitize', html]); return '<p>clean</p>'; } }
  });
  try {
    assert.equal(harness.helpers.renderMarkdown('source'), '<p>clean</p>');
    assert.deepEqual(calls, [
      ['parse', 'source'],
      ['sanitize', '<p>dirty</p><script>bad()</script>']
    ]);
  } finally {
    harness.window.close();
  }
});

test('sanitizes unsafe HTML before returning rendered output', () => {
  const harness = createHarness();
  try {
    const html = harness.helpers.renderMarkdown('<img src="x" onerror="alert(1)"><script>alert(2)</script>');
    assert.match(html, /<img src="x">/);
    assert.doesNotMatch(html, /onerror|<script|alert\(2\)/);
  } finally {
    harness.window.close();
  }
});

test('renders block and inline formulas through KaTeX with current display modes', () => {
  const harness = createHarness();
  try {
    const block = harness.helpers.renderMarkdownWithFormulas('$$x^2$$');
    const inline = harness.helpers.renderMarkdownWithFormulas('Value: $x^2$');
    assert.match(block, /class="katex-display"/);
    assert.match(block, /class="katex"/);
    assert.doesNotMatch(block, /\$\$x\^2\$\$/);
    assert.match(inline, /class="katex"/);
    assert.doesNotMatch(inline, /\$x\^2\$/);
  } finally {
    harness.window.close();
  }
});

test('preserves formula decoding, options, logging, and block or inline error fallbacks', () => {
  const calls = [];
  const errors = [];
  const harness = createHarness({
    marked: { parse: (text) => text },
    sanitizer: { sanitize: (html) => html },
    katex: {
      renderToString: (formula, options) => {
        calls.push([formula, options]);
        if (formula === 'block-error' || formula === 'inline-error') throw new Error(formula);
        return `<katex data-display="${options.displayMode}">${formula}</katex>`;
      }
    },
    logger: { error: (...args) => errors.push(args) }
  });
  try {
    const success = harness.helpers.renderMarkdownWithFormulas('<p>$$a &lt; b$$</p> and $c &lt; d$');
    assert.match(success, /<katex data-display="true">a < b<\/katex>/);
    assert.match(success, /<katex data-display="false">c < d<\/katex>/);
    assert.deepEqual(calls.map(([formula, options]) => [formula, options.displayMode, options.throwOnError]), [
      ['a < b', true, false],
      ['c < d', false, false]
    ]);

    const blockError = harness.helpers.renderMarkdownWithFormulas('<p>$$block-error$$</p>');
    const inlineError = harness.helpers.renderMarkdownWithFormulas('$inline-error$');
    assert.equal(blockError, '<p style="color: red;">[數學公式渲染錯誤: block-error]</p>');
    assert.equal(inlineError, '<span style="color: red;">[公式錯誤: inline-error]</span>');
    assert.equal(errors.length, 2);
    assert.equal(errors[0][0], 'KaTeX block rendering error:');
    assert.equal(errors[1][0], 'KaTeX inline rendering error:');
  } finally {
    harness.window.close();
  }
});

test('markdown helper remains a rendering-only boundary after extraction', () => {
  assert.equal(existsSync(projectFile(helperPath)), true);
  assert.match(helperSource, /export\s+function\s+createMarkdownRenderingHelpers\s*\(/);
  assert.match(
    legacyCoreSource,
    /import\s+\{\s*createMarkdownRenderingHelpers\s*\}\s+from\s+['"]\/src\/app\/runtime\/legacy-core\/markdown-rendering-helpers\.js['"]/
  );
  assert.match(legacyCoreSource, /createMarkdownRenderingHelpers\(\{/);
  assert.doesNotMatch(legacyCoreSource, /const\s+renderMarkdown\s*=\s*\(text\)\s*=>\s*\{/);
  assert.doesNotMatch(legacyCoreSource, /function\s+renderMarkdownWithFormulas\s*\(text\)\s*\{/);
  assert.doesNotMatch(
    helperSource,
    /legacyRuntimeContext|registerLazyBinding|resolveBinding|resolveOptionalBinding|saveAppData|saveConfig|fetch\(|apiKeys|provider|streamApiCall|handleFormSubmit|updateInputState/
  );
  assert.doesNotMatch(
    helperSource,
    /^import\s+[\s\S]*?from\s+['"][^'"]*(?:runtime-entry|app-bootstrap|settings|input|submit|provider|sidebar)[^'"]*['"]/m
  );
});
