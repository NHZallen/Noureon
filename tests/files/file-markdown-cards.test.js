import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import katex from 'katex';
import { marked } from 'marked';

import { createMarkdownRenderingHelpers } from '../../src/app/runtime/legacy-core/markdown-rendering-helpers.js';
import { getFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { getFileMarkdownRenderer } from '../../src/app/ui/files/file-markdown-cards.js';

function createHarness(language = 'zh-TW') {
  const window = new Window({ url: 'https://example.test/' });
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
    katex,
    getUiLanguage: () => language,
    logger: console
  });
  const render = (text) => {
    const container = window.document.createElement('div');
    container.innerHTML = helpers.renderMarkdownWithFormulas(text);
    return container;
  };
  return { window, helpers, render };
}

test('a file block renders as a card and its content never reaches the message body', () => {
  const harness = createHarness();
  try {
    const root = harness.render([
      '這是你的檔案：',
      '',
      '````file 安裝指南.md',
      '# 秘密標題',
      '```bash',
      'npm install $HOME',
      '```',
      '````',
      '',
      '有問題再告訴我。'
    ].join('\n'));

    const card = root.querySelector('.ac-file-card');
    assert.ok(card, 'card should render');
    assert.equal(card.querySelector('.ac-file-name').textContent, '安裝指南.md');
    assert.equal(card.dataset.fileState, 'ready');
    assert.equal(card.dataset.fileFamily, 'markdown');
    assert.match(card.querySelector('.ac-file-meta').textContent, /Markdown 文件 · 4 行/);
    assert.ok(card.querySelector('[data-file-action="download"]'));
    assert.ok(card.querySelector('[data-file-action="preview"]'));
    assert.doesNotMatch(root.innerHTML, /秘密標題|npm install|NOURA_FILE_TOKEN|katex/);
    assert.match(root.textContent, /這是你的檔案：[\s\S]*有問題再告訴我。/);
    assert.equal(getFileBlock(card.dataset.fileId).content, '# 秘密標題\n```bash\nnpm install $HOME\n```');
  } finally {
    harness.window.close();
  }
});

test('two ready files add a ZIP bundle action listing both ids', () => {
  const harness = createHarness('en');
  try {
    const root = harness.render('````file a.txt\none\n````\n\n````file b.csv\nx,y\n1,2\n````');
    const cards = [...root.querySelectorAll('.ac-file-card')];
    assert.equal(cards.length, 2);
    const bundle = root.querySelector('[data-file-action="download-all"]');
    assert.equal(bundle.textContent, 'Download all (ZIP)');
    assert.deepEqual(bundle.dataset.fileIds.split(','), cards.map((card) => card.dataset.fileId));
  } finally {
    harness.window.close();
  }
});

test('blocked, incomplete and unavailable files render explanatory states', () => {
  const harness = createHarness('en');
  try {
    const blocked = harness.render('````file setup.exe\nMZ\n````').querySelector('.ac-file-card');
    assert.equal(blocked.dataset.fileState, 'blocked');
    assert.equal(blocked.querySelector('[data-file-action="download"]'), null);
    assert.match(blocked.textContent, /\.exe files cannot be provided/);

    const incomplete = harness.render('````file notes.txt\nhalf a').querySelector('.ac-file-card');
    assert.equal(incomplete.dataset.fileState, 'incomplete');
    assert.ok(incomplete.querySelector('[data-file-action="download"]'), 'partial text stays downloadable');
    assert.ok(incomplete.querySelector('[data-file-action="copy"]'));

    const script = harness.render('````file deploy.sh\necho hi\n````').querySelector('.ac-file-card');
    assert.match(script.textContent, /executable script/);
  } finally {
    harness.window.close();
  }
});

test('sandbox links to a written file become in-app download links; unknown ones become text', () => {
  const harness = createHarness('en');
  try {
    const root = harness.render([
      '[Download the report](sandbox:/mnt/data/report.txt) and [this](sandbox:/mnt/data/missing.pdf).',
      '',
      '````file report.txt',
      'hello',
      '````'
    ].join('\n'));
    const links = [...root.querySelectorAll('a')];
    assert.equal(links.length, 1);
    assert.equal(links[0].dataset.fileAction, 'download');
    assert.equal(links[0].dataset.fileId, root.querySelector('.ac-file-card').dataset.fileId);
    assert.doesNotMatch(root.innerHTML, /sandbox:/);
  } finally {
    harness.window.close();
  }
});

test('file card markup escapes a hostile file name', () => {
  const harness = createHarness('en');
  try {
    const root = harness.render('````file <img src=x onerror=alert(1)>.txt\nx\n````');
    assert.equal(root.querySelector('img'), null);
    assert.match(root.querySelector('.ac-file-name').textContent, /_img src=x onerror=alert\(1\)_\.txt/);
  } finally {
    harness.window.close();
  }
});

test('the helpers register the chat renderer for file previews', () => {
  const harness = createHarness('en');
  try {
    assert.equal(typeof getFileMarkdownRenderer(), 'function');
    assert.match(getFileMarkdownRenderer()('**bold**'), /<strong>bold<\/strong>/);
  } finally {
    harness.window.close();
  }
});
