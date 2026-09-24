import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStreamingMarkdownFeature } from '../src/app/legacy-runtime/features/streaming-markdown-renderer.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createFeatureHarness = (document, overrides = {}) => {
  const scheduledFrames = [];
  const renderCalls = [];
  const feature = createStreamingMarkdownFeature({
    document,
    renderMarkdown: (text) => {
      renderCalls.push(['markdown', text]);
      return `<div class="markdown-output">${text}</div>`;
    },
    renderMarkdownWithFormulas: (text) => {
      renderCalls.push(['formulas', text]);
      return `<div class="formula-output">${text}</div>`;
    },
    isChatNearBottom: () => true,
    getChatScrollTop: () => 12,
    keepChatPositionAfterRender: (...args) => {
      renderCalls.push(['scroll', ...args]);
    },
    scheduleFrame: (callback) => {
      scheduledFrames.push(callback);
    },
    waitForFrame: async () => {
      scheduledFrames.shift()?.();
    },
    logError: () => {},
    ...overrides
  });

  return { feature, renderCalls, scheduledFrames };
};

test('renderer keeps non-newline text in the faded current line', () => {
  const { document, cleanup } = createDom('<div id="target" class="typing-cursor"></div>');

  try {
    const target = document.getElementById('target');
    const { feature } = createFeatureHarness(document);
    const renderer = feature.createStreamingMarkdownRenderer(target);

    renderer.appendText('Hi');

    assert.equal(target.classList.contains('typing-cursor'), false);
    assert.equal(target.classList.contains('is-streaming-response'), true);
    assert.equal(target.querySelector('.streaming-markdown-finalized').innerHTML, '');
    assert.equal(target.querySelector('.streaming-current-line').textContent, 'Hi');
    assert.deepEqual(
      [...target.querySelectorAll('.streaming-fade-char')].map((node) => node.style.animationDelay),
      ['0ms', '8ms']
    );
    assert.equal(renderer.getText(), 'Hi');
  } finally {
    cleanup();
  }
});

test('newline flush renders finalized text with formulas and leaves the tail pending', () => {
  const { document, cleanup } = createDom('<div id="target"></div>');

  try {
    const target = document.getElementById('target');
    const { feature, renderCalls } = createFeatureHarness(document);
    const renderer = feature.createStreamingMarkdownRenderer(target);

    renderer.appendText('Hello\nTail');

    assert.equal(
      target.querySelector('.streaming-markdown-finalized').innerHTML,
      '<div class="formula-output">Hello\n</div>'
    );
    assert.equal(target.querySelector('.streaming-current-line').textContent, 'Tail');
    assert.deepEqual(renderCalls[0], ['formulas', 'Hello\n']);
    assert.deepEqual(renderCalls.at(-1), ['scroll', true, 12]);
  } finally {
    cleanup();
  }
});

test('complete formulas render in the current line before the stream finishes', () => {
  const { document, cleanup } = createDom('<div id="target"></div>');

  try {
    const target = document.getElementById('target');
    const { feature, renderCalls } = createFeatureHarness(document);
    const renderer = feature.createStreamingMarkdownRenderer(target);

    renderer.appendText('Value: $x^2$');

    assert.equal(
      target.querySelector('.streaming-current-line').innerHTML,
      '<div class="formula-output">Value: $x^2$</div>'
    );
    assert.deepEqual(renderCalls[0], ['formulas', 'Value: $x^2$']);
    assert.equal(target.dataset.streamRendered, undefined);
  } finally {
    cleanup();
  }
});

test('chart streams show a localized pending state and render as soon as the payload is valid', () => {
  const { document, cleanup } = createDom('<div id="target"></div>');

  try {
    const target = document.getElementById('target');
    const renderChartMarkdown = (text) => {
      if (text.includes('"value":1') && text.trimEnd().endsWith('```')) {
        return '<figure class="ac-chart ac-chart-bar" data-chart-payload="bar-payload"><div>Chart ready</div></figure>';
      }
      if (!text.includes('```chart')) return `<p>${text}</p>`;
      return `<pre><code>${text}</code></pre>`;
    };
    const { feature } = createFeatureHarness(document, {
      renderMarkdown: renderChartMarkdown,
      renderMarkdownWithFormulas: renderChartMarkdown,
      getStreamingText: (key, fallback) => key === 'chartGenerating' ? 'Generando gráfico…' : fallback
    });
    const renderer = feature.createStreamingMarkdownRenderer(target);

    renderer.appendText('Intro\n```chart\n{\n');
    assert.equal(target.querySelector('.streaming-chart-pending')?.textContent, 'Generando gráfico…');
    assert.equal(target.querySelector('pre'), null);
    assert.equal(target.querySelector('code'), null);
    assert.doesNotMatch(target.textContent, /```|\{/);

    renderer.appendText('"type":"bar",\n"data":[{"label":"A","value":1}]\n}');
    const earlyChart = target.querySelector('.ac-chart[data-chart-payload]');
    assert.ok(earlyChart);
    assert.equal(earlyChart.textContent, 'Chart ready');
    assert.equal(target.querySelector('pre'), null);
    assert.equal(target.querySelector('code'), null);

    renderer.appendText('\n```');
    assert.equal(target.querySelector('.ac-chart[data-chart-payload]'), earlyChart);

    renderer.finish({ renderFormulas: true });
    assert.equal(target.querySelector('.ac-chart[data-chart-payload]'), earlyChart);
    assert.equal(target.querySelector('.streaming-current-line'), null);
  } finally {
    cleanup();
  }
});

test('growing tables stay behind one stable pending surface and completed tables keep DOM identity', () => {
  const { document, cleanup } = createDom('<div id="target"></div>');

  try {
    const target = document.getElementById('target');
    const renderTableMarkdown = (text) => {
      if (!text.includes('| --- | --- |')) return `<p>${text}</p>`;
      const suffix = text.includes('More') ? '<p>After</p><p>More</p>' : '<p>After</p>';
      return `<div class="table-scroll-container"><table><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div>${suffix}`;
    };
    const { feature } = createFeatureHarness(document, {
      renderMarkdown: renderTableMarkdown,
      renderMarkdownWithFormulas: renderTableMarkdown,
      getStreamingText: (key, fallback) => key === 'tableGenerating' ? '表格生成中…' : fallback
    });
    const renderer = feature.createStreamingMarkdownRenderer(target);

    renderer.appendText('Before\n| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    const pending = target.querySelector('.streaming-table-pending');
    assert.ok(pending);
    assert.equal(pending.textContent, '表格生成中…');
    renderer.appendText('| 3 | 4 |\n');
    assert.equal(target.querySelector('.streaming-table-pending'), pending);
    assert.equal(target.querySelector('table'), null);

    renderer.appendText('\nAfter\n');
    const stableTable = target.querySelector('.table-scroll-container');
    assert.ok(stableTable);
    renderer.appendText('More\n');
    assert.equal(target.querySelector('.table-scroll-container'), stableTable);
  } finally {
    cleanup();
  }
});

test('finish flushes pending text with formulas and completes the DOM lifecycle', () => {
  const { document, cleanup } = createDom('<div id="target"></div>');

  try {
    const target = document.getElementById('target');
    const { feature } = createFeatureHarness(document);
    const renderer = feature.createStreamingMarkdownRenderer(target);

    renderer.appendText('Formula $x$');
    const finalText = renderer.finish({ renderFormulas: true });

    assert.equal(finalText, 'Formula $x$');
    assert.equal(
      target.querySelector('.streaming-markdown-finalized').innerHTML,
      '<div class="formula-output">Formula $x$</div>'
    );
    assert.equal(target.querySelector('.streaming-current-line'), null);
    assert.equal(target.classList.contains('is-streaming-response'), false);
    assert.equal(target.dataset.streamRendered, 'true');
  } finally {
    cleanup();
  }
});

test('council comparison normalization and open detail state survive rerenders', () => {
  const { document, cleanup } = createDom('<div id="target"></div>');

  try {
    const target = document.getElementById('target');
    const { feature } = createFeatureHarness(document, {
      renderMarkdown: (text) => text,
      renderMarkdownWithFormulas: (text) => text
    });
    const renderer = feature.createStreamingMarkdownRenderer(target, {
      preserveCouncilDetails: true
    });

    renderer.appendText(
      '<details class="council-collapse"><summary>Consensus and Differences</summary>\nInside\n</details>\n| A | B |\n'
    );
    const details = target.querySelector('details.council-collapse');
    details.open = true;
    renderer.appendText('\nNext\n');

    assert.equal(target.querySelector('details.council-collapse').open, true);
    assert.match(
      target.querySelector('details.council-collapse').textContent,
      /\| A \| B \|/
    );
  } finally {
    cleanup();
  }
});

test('stream response queues chunks, renders in order, and finishes once', async () => {
  const { document, cleanup } = createDom('<div id="target"></div>');

  try {
    const target = document.getElementById('target');
    const { feature } = createFeatureHarness(document);
    const lifecycle = [];

    const finalText = await feature.streamMarkdownResponse(
      target,
      async (onChunk) => {
        lifecycle.push('stream-start');
        onChunk('Hello');
        onChunk('\nAstra');
        lifecycle.push('stream-end');
      },
      undefined,
      {
        placeholderHTML: '<span>Waiting</span>',
        onFirstChunk: () => lifecycle.push('first-chunk')
      }
    );

    assert.deepEqual(lifecycle, ['stream-start', 'first-chunk', 'stream-end']);
    assert.equal(finalText, 'Hello\nAstra');
    assert.equal(target.dataset.streamRendered, 'true');
    assert.equal(target.querySelector('.streaming-current-line'), null);
    assert.equal(
      target.querySelector('.streaming-markdown-finalized').innerHTML,
      '<div class="formula-output">Hello\nAstra</div>'
    );
  } finally {
    cleanup();
  }
});

test('empty and aborted streams finish without leaving pending render state', async () => {
  const { document, cleanup } = createDom('<div id="empty"></div><div id="aborted"></div>');

  try {
    const { feature } = createFeatureHarness(document);
    const emptyTarget = document.getElementById('empty');
    const abortedTarget = document.getElementById('aborted');
    const controller = new AbortController();
    controller.abort();

    const emptyText = await feature.streamMarkdownResponse(
      emptyTarget,
      async () => {},
      undefined,
      { placeholderHTML: '<span>Waiting</span>' }
    );
    const abortedText = await feature.streamMarkdownResponse(
      abortedTarget,
      async () => {
        throw new DOMException('Aborted', 'AbortError');
      },
      controller.signal,
      { placeholderHTML: '<span>Waiting</span>' }
    );

    assert.equal(emptyText, '');
    assert.equal(abortedText, '');
    for (const target of [emptyTarget, abortedTarget]) {
      assert.equal(target.innerHTML, '');
      assert.equal(target.classList.contains('is-streaming-response'), false);
      assert.equal(target.dataset.streamRendered, 'true');
    }
  } finally {
    cleanup();
  }
});

test('stopping a stream keeps the text already rendered', async () => {
  const { document, cleanup } = createDom('<div id="target"></div>');
  try {
    const target = document.getElementById('target');
    const controller = new AbortController();
    const { feature } = createFeatureHarness(document);

    const text = await feature.streamMarkdownResponse(
      target,
      async (onChunk) => {
        onChunk('Already written');
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      },
      controller.signal,
      { placeholderHTML: '<span>Waiting</span>' }
    );

    assert.equal(text, 'Already written');
    assert.match(target.textContent, /Already written/);
    assert.equal(target.dataset.streamRendered, 'true');
  } finally {
    cleanup();
  }
});

test('non-abort stream errors preserve rendered error output and rethrow', async () => {
  const { document, cleanup } = createDom('<div id="target"></div>');

  try {
    const target = document.getElementById('target');
    const { feature } = createFeatureHarness(document);

    await assert.rejects(
      () => feature.streamMarkdownResponse(
        target,
        async () => {
          throw new Error('provider failed');
        },
        undefined
      ),
      /provider failed/
    );

    assert.equal(target.classList.contains('is-streaming-response'), false);
    assert.match(target.innerHTML, /provider failed/);
  } finally {
    cleanup();
  }
});

test('streaming markdown renderer source avoids provider, storage, and runtime plugin coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/streaming-markdown-renderer.js');

  for (const forbidden of [
    'fetch(',
    'getApiKeyForProvider',
    'openrouter',
    'gemini',
    'nvidia',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
