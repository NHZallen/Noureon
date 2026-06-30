import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
      messageRole: 'assistant',
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

test('valid json chart fenced block becomes rendered chart', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const html = helpers.renderMarkdown(`\`\`\`json
{ "type": "donut", "title": "Share", "data": [{ "label": "A", "value": 1 }] }
\`\`\``);

    assert.match(html, /class="ac-chart ac-chart-donut"/);
    assert.match(html, /data-chart-type="donut"/);
    assert.match(html, /class="ac-chart-svg ac-chart-svg-donut"/);
    assert.match(html, />Share<\/div>/);
  } finally {
    window.close();
  }
});

test('ECharts javascript option fenced block becomes rendered chart', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const html = helpers.renderMarkdown(`\`\`\`javascript
option = {
  title: { text: '2024年各產品線銷售額對比' },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ['消費電子','智能家居'] },
  yAxis: { type: 'value', name: '銷售額（萬元）' },
  series: [{ type: 'bar', data: [3200,1800] }]
};
\`\`\``);

    assert.match(html, /class="ac-chart ac-chart-bar"/);
    assert.match(html, /data-chart-type="bar"/);
    assert.doesNotMatch(html, /language-javascript/);
    assert.match(html, /2024年各產品線銷售額對比/);
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

test('user chart fence remains a normal code block and is not converted', () => {
  const { document, window } = createDocumentFromMarkdown(`\`\`\`chart
{ "type": "bar", "data": [{ "label": "A", "value": 120 }] }
\`\`\``);

  try {
    const result = applyChartMarkdownPlaceholders({
      document,
      root: document.body,
      messageRole: 'user',
      chartLabel: 'Chart'
    });

    assert.deepEqual(result, { converted: 0, skipped: 0 });
    assert.ok(document.querySelector('pre > code.language-chart'));
    assert.equal(document.querySelector('.ac-chart-placeholder'), null);
  } finally {
    window.close();
  }
});

test('Mermaid code block remains a normal code block', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const html = helpers.renderMarkdown(`\`\`\`mermaid
graph TD
  A --> B
\`\`\``);

    assert.match(html, /<pre><code class="language-mermaid">/);
    assert.doesNotMatch(html, /ac-chart(?:-placeholder)?/);
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
  const { document, window } = createDocumentFromMarkdown(`\`\`\`chart
{
  "type": "bar",
  "title": "<img src=x onerror=alert(1)>",
  "description": "<script>alert(2)</script>",
  "data": [{ "label": "<b>A</b>", "value": "120" }]
}
\`\`\``);

  try {
    applyChartMarkdownPlaceholders({
      document,
      root: document.body,
      messageRole: 'assistant',
      chartLabel: 'Chart'
    });
    const html = document.body.innerHTML;
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

test('rendered chart escapes title, description, and labels safely', () => {
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

    assert.match(html, /class="ac-chart ac-chart-bar"/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  } finally {
    window.close();
  }
});

test('sample chart markdown renders all twelve fixture chart types for manual QA', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const sample = readFileSync(join(process.cwd(), 'tests/ui/charts/fixtures/sample-message-charts.md'), 'utf8');
    const html = helpers.renderMarkdown(sample);

    assert.equal((html.match(/class="ac-chart ac-chart-/g) || []).length, 12);
    assert.match(html, /data-chart-type="scatter"/);
    assert.match(html, /data-chart-type="bar"/);
    assert.match(html, /data-chart-type="line"/);
    assert.match(html, /data-chart-type="donut"/);
    assert.match(html, /data-chart-type="heatmap"/);
    assert.match(html, /data-chart-type="treemap"/);
    assert.match(html, /data-chart-type="radar"/);
    assert.match(html, /data-chart-type="funnel"/);
    assert.match(html, /data-chart-type="waterfall"/);
    assert.match(html, /data-chart-type="sankey"/);
    assert.match(html, /data-chart-type="boxplot"/);
    assert.match(html, /data-chart-type="gantt"/);
    assert.match(html, /class="ac-chart-legend"/);
  } finally {
    window.close();
  }
});

test('nested model-generated chart payloads render instead of remaining code blocks', () => {
  const { helpers, window } = createMarkdownHarness();

  try {
    const html = helpers.renderMarkdown(`\`\`\`chart
{
  "type": "bar",
  "data": {
    "labels": ["A", "B"],
    "datasets": [{ "label": "Sales", "data": [100, 200] }]
  }
}
\`\`\`

\`\`\`chart
{
  "type": "sankey",
  "data": {
    "nodes": [{ "id": "a", "label": "A" }, { "id": "b", "label": "B" }],
    "links": [{ "source": "a", "target": "b", "value": 10 }]
  }
}
\`\`\``);

    assert.equal((html.match(/class="ac-chart ac-chart-/g) || []).length, 2);
    assert.match(html, /data-chart-type="bar"/);
    assert.match(html, /data-chart-type="sankey"/);
    assert.doesNotMatch(html, /<code class="language-chart">/);
  } finally {
    window.close();
  }
});
