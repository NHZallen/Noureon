import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamingMarkdownFeature } from '../../src/app/legacy-runtime/features/streaming-markdown-renderer.js';
import { describeFileBlock, getGeneratedFileSize, registerFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { createFileBundleElement, createFileCardElement } from '../../src/app/ui/files/file-card-renderer.js';
import { installFileCardInteractions } from '../../src/app/ui/files/file-card-interactions.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const createRenderer = (document, target) => createStreamingMarkdownFeature({
  document,
  renderMarkdown: (text) => `<div class="md">${text}</div>`,
  renderMarkdownWithFormulas: (text) => `<div class="md">${text}</div>`,
  isChatNearBottom: () => false,
  getChatScrollTop: () => 0,
  keepChatPositionAfterRender: () => {},
  scheduleFrame: () => {},
  waitForFrame: async () => {},
  getUiLanguage: () => 'en',
  logError: () => {}
}).createStreamingMarkdownRenderer(target);

test('an unfinished file block streams as a pending card instead of raw content', () => {
  const { document, cleanup } = createDom('<div id="target"></div>');
  try {
    const target = document.getElementById('target');
    const renderer = createRenderer(document, target);
    renderer.appendText('Here you go:\n\n````file plan.md\n# Secret heading\n| a | b |\n| --- | --- |\n');

    const pending = target.querySelector('.ac-file-card-pending');
    assert.ok(pending);
    assert.equal(pending.querySelector('.ac-file-name').textContent, 'plan.md');
    assert.match(pending.textContent, /Writing file…/);
    assert.doesNotMatch(target.innerHTML, /Secret heading|streaming-table-pending/);
    assert.match(target.querySelector('.streaming-markdown-finalized').textContent, /Here you go:/);
  } finally {
    cleanup();
  }
});

const setupCard = (document, descriptorInput, language = 'en') => {
  const descriptor = registerFileBlock(describeFileBlock({ complete: true, ...descriptorInput }));
  const card = createFileCardElement(document, descriptor, { language });
  document.getElementById('list').appendChild(card);
  return { descriptor, card };
};

const createWindowStubs = (window) => {
  const created = [];
  const revoked = [];
  window.URL.createObjectURL = (blob) => {
    created.push(blob);
    return `blob:test/${created.length}`;
  };
  window.URL.revokeObjectURL = (url) => revoked.push(url);
  const clicks = [];
  window.HTMLAnchorElement.prototype.click = function click() {
    clicks.push({ href: this.href, download: this.download });
  };
  return { created, revoked, clicks };
};

test('clicking download generates once, triggers an anchor download and records the size', async () => {
  const { window, document, cleanup } = createDom('<div id="list"></div>');
  try {
    const stubs = createWindowStubs(window);
    let generated = 0;
    const handle = installFileCardInteractions({
      root: document,
      window,
      getUiLanguage: () => 'en',
      generate: async (descriptor) => {
        generated += 1;
        return new Blob([descriptor.content], { type: 'text/plain' });
      },
      logError: () => {}
    });
    const { descriptor, card } = setupCard(document, { name: 'notes.txt', content: 'hello world' });
    const button = card.querySelector('[data-file-action="download"]');

    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(generated, 1, 'the second click reuses the cached blob');
    assert.deepEqual(stubs.clicks.map((click) => click.download), ['notes.txt', 'notes.txt']);
    assert.equal(getGeneratedFileSize(descriptor.id), 11);
    assert.match(card.querySelector('.ac-file-meta').textContent, /11 B/);
    assert.equal(button.disabled, false);
    handle.dispose();
  } finally {
    cleanup();
  }
});

test('generation failures surface a notification and restore the button', async () => {
  const { window, document, cleanup } = createDom('<div id="list"></div>');
  try {
    createWindowStubs(window);
    const notifications = [];
    const handle = installFileCardInteractions({
      root: document,
      window,
      getUiLanguage: () => 'en',
      notify: (message, type) => notifications.push([message, type]),
      generate: async () => {
        throw new Error('bad spec');
      },
      logError: () => {}
    });
    const { card } = setupCard(document, { name: 'broken.txt', content: 'x' });
    const button = card.querySelector('[data-file-action="download"]');
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(notifications, [['Could not generate the file: bad spec', 'error']]);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-busy'), 'false');
    handle.dispose();
  } finally {
    cleanup();
  }
});

test('download-all zips every ready file with de-duplicated names', async () => {
  const { window, document, cleanup } = createDom('<div id="list"></div>');
  try {
    const stubs = createWindowStubs(window);
    const zipped = [];
    class FakeZip {
      file(name, blob) {
        zipped.push([name, blob.size]);
      }
      async generateAsync() {
        return new Blob(['zip'], { type: 'application/zip' });
      }
    }
    const handle = installFileCardInteractions({
      root: document,
      window,
      getUiLanguage: () => 'en',
      generate: async (descriptor) => new Blob([descriptor.content]),
      loadArchive: async () => FakeZip,
      logError: () => {}
    });
    const first = setupCard(document, { name: 'a.txt', content: '1' });
    const second = setupCard(document, { name: 'a.txt', content: '22' });
    const bundle = createFileBundleElement(document, [first.descriptor.id, second.descriptor.id], { language: 'en' });
    document.getElementById('list').appendChild(bundle);

    bundle.querySelector('button').click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.deepEqual(zipped, [['a.txt', 1], ['a (2).txt', 2]]);
    assert.match(stubs.clicks.at(-1).download, /^noureon-files-\d{8}-\d{4}\.zip$/);
    handle.dispose();
  } finally {
    cleanup();
  }
});

test('copy source copies the raw block content', async () => {
  const { window, document, cleanup } = createDom('<div id="list"></div>');
  try {
    const copied = [];
    const handle = installFileCardInteractions({
      root: document,
      window,
      getUiLanguage: () => 'en',
      copyText: async (text) => copied.push(text),
      notify: () => {},
      logError: () => {}
    });
    const { card } = setupCard(document, { name: 'draft.txt', content: 'partial', complete: false });
    card.querySelector('[data-file-action="copy"]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(copied, ['partial']);
    handle.dispose();
  } finally {
    cleanup();
  }
});

test('blocked files expose no download action even if one is forged', async () => {
  const { window, document, cleanup } = createDom('<div id="list"></div>');
  try {
    let generated = 0;
    const handle = installFileCardInteractions({
      root: document,
      window,
      generate: async () => {
        generated += 1;
        return new Blob(['x']);
      },
      logError: () => {}
    });
    const { descriptor, card } = setupCard(document, { name: 'evil.exe', content: 'MZ' });
    assert.equal(card.querySelector('[data-file-action="download"]'), null);
    const forged = document.createElement('button');
    forged.dataset.fileAction = 'download';
    forged.dataset.fileId = descriptor.id;
    card.appendChild(forged);
    forged.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(generated, 0);
    handle.dispose();
  } finally {
    cleanup();
  }
});
