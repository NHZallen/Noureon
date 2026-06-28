import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { marked } from 'marked';

import { applyChartMarkdownPlaceholders } from '../../../src/app/ui/charts/chart-markdown-placeholders.js';
import { createMarkdownRenderingHelpers } from '../../../src/app/runtime/legacy-core/markdown-rendering-helpers.js';

const createWindow = () => new Window({ url: 'https://example.test/' });

const createDocumentFromMarkdown = (markdown) => {
  const window = createWindow();
  const document = window.document.implementation.createHTMLDocument('');
  document.body.innerHTML = marked.parse(markdown);
  return { document, window };
};

const createMarkdownHarness = (overrides = {}) => {
  const window = createWindow();
  class BrowserLikeDOMParser {
    parseFromString(html) {
      const parsedDocument = window.document.implementation.createHTMLDocument('');
      const bodyMatch = /^<body>([\s\S]*)<\/body>$/.exec(html);
      parsedDocument.body.innerHTML = bodyMatch ? bodyMatch[1] : html;
      return parsedDocument;
    }
  }
  const helpers = createMarkdownRenderingHelpers({
    marked,
    sanitizer: { sanitize: (html) => html },
    DOMParser: BrowserLikeDOMParser,
    katex: { renderToString: () => '' },
    getUiLanguage: () => 'en',
    getText: (key, fallback) => (key === 'chart' ? 'Chart' : fallback),
    logger: console,
    ...overrides
  });
  return { helpers, window };
};

test('valid chart fenced block becomes placeholder', () => {
  const { document, window } = createDocumentFromMarkdown(`\`\`\`chart
{
  "type": "bar",
  "title": "Sales",
  "data": [{ "label": "A", "value": 120 }]
}
\`\`\``);

  try {
    const result = applyChartMarkdownPlaceholders({
      document,
      root: document.body,
      chartLabel: 'Chart'
    });
    const placeholder = document.querySelector('.ac-chart-placeholder');

    assert.deepEqual(result, { converted: 1, skipped: 0 });
    assert.ok(placeholder);
    assert.equal(placeholder.dataset.chartType, 'bar');
    assert.equal(placeholder.textContent, 'Chart: Sales');
    assert.deepEqual(JSON.parse(decodeURIComponent(placeholder.dataset.chartPayload)), {
      type: 'bar',
      data: [{ label: 'A', value: 120 }],
      title: 'Sales'
    });
  } finally {
    window.close();
  }
});

test('valid json chart fenced block becomes placeholder', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const html = helpers.renderMarkdown(`\`\`\`json
{ "type": "donut", "title": "Share", "data": [{ "label": "A", "value": 1 }] }
\`\`\``);

    assert.match(html, /class="ac-chart-placeholder"/);
    assert.match(html, /data-chart-type="donut"/);
    assert.match(html, />Chart: Share<\/span>/);
  } finally {
    window.close();
  }
});

test('non-chart JSON code block remains normal code block', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const html = helpers.renderMarkdown(`\`\`\`json
{ "hello": "world" }
\`\`\``);

    assert.match(html, /<pre><code class="language-json">/);
    assert.match(html, /"hello": "world"/);
    assert.doesNotMatch(html, /ac-chart-placeholder/);
  } finally {
    window.close();
  }
});

test('malformed chart JSON does not crash markdown rendering', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const html = helpers.renderMarkdown(`Before

\`\`\`chart
{ "type": "bar",
\`\`\`

After`);

    assert.match(html, /Before/);
    assert.match(html, /After/);
    assert.match(html, /<pre><code class="language-chart">/);
    assert.doesNotMatch(html, /ac-chart-placeholder/);
  } finally {
    window.close();
  }
});

test('placeholder escapes title, description, and labels safely', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const html = helpers.renderMarkdown(`\`\`\`chart
{
  "type": "bar",
  "title": "<img src=x onerror=alert(1)>",
  "description": "<script>alert(2)</script>",
  "data": [{ "label": "<b>A</b>", "value": "120" }]
}
\`\`\``);
    const document = window.document.implementation.createHTMLDocument('');
    document.body.innerHTML = html;
    const placeholder = document.querySelector('.ac-chart-placeholder');
    const payload = JSON.parse(decodeURIComponent(placeholder.dataset.chartPayload));

    assert.ok(placeholder);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.equal(payload.title, '<img src=x onerror=alert(1)>');
    assert.equal(payload.description, '<script>alert(2)</script>');
    assert.equal(payload.data[0].label, '<b>A</b>');
  } finally {
    window.close();
  }
});
