import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildMessageRenderView } from '../src/app/legacy-runtime/features/message-markup-renderer.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const dependencies = {
  renderUserText: (text) => `USER:${text}`,
  renderMarkdownWithFormulas: (text) => `MODEL:${text}`,
  buildMediaAttachmentView: (mediaParts) => ({
    html: mediaParts.length
      ? `<div class="media-grid">${mediaParts.map((part) => part.name).join(',')}</div>`
      : '',
    previewMediaParts: [...mediaParts]
  }),
  formatTimestamp: () => '2026-06-24 10:30',
  copyTitle: 'Copy content'
};

test('builds the user message role, text markup, and bubble classes', () => {
  const view = buildMessageRenderView({
    message: {
      role: 'user',
      parts: [{ text: 'Hello' }]
    },
    ...dependencies
  });

  assert.equal(
    view.messageClassName,
    'message-item flex items-start gap-2 md:gap-4 justify-end user-message'
  );
  assert.equal(view.isUser, true);
  assert.deepEqual(view.previewMediaParts, []);
  assert.match(view.messageHTML, /message-stack message-stack-user/);
  assert.match(view.messageHTML, /message-content">\<div>USER:Hello<\/div>/);
  assert.doesNotMatch(view.messageHTML, /copy-content-btn/);
  assert.match(view.messageHTML, /data-message-action="copy"/);
  assert.match(view.messageHTML, /data-message-action="edit"/);
});

test('builds model markdown, timestamp, and exact action markup', () => {
  const view = buildMessageRenderView({
    message: {
      role: 'model',
      parts: [{ text: 'Answer' }],
      createdAt: '2026-06-24T10:30:00.000Z'
    },
    ...dependencies
  });

  assert.equal(
    view.messageClassName,
    'message-item flex items-start gap-2 md:gap-4 model-message'
  );
  assert.equal(view.isUser, false);
  assert.match(view.messageHTML, /message-stack message-stack-model/);
  assert.match(view.messageHTML, /pb-8 message-content">\<div>MODEL:Answer<\/div>/);
  assert.match(view.messageHTML, /class="copy-content-btn p-1 rounded-md/);
  assert.match(view.messageHTML, /title="Copy content"/);
  assert.match(view.messageHTML, /class="pointer-events-none"/);
  assert.match(view.messageHTML, />2026-06-24 10:30<\/span>/);
});

test('renders a sent quote above the user bubble without exposing hidden model context', () => {
  const view = buildMessageRenderView({
    message: {
      role: 'user',
      parts: [
        { text: 'Question', displayText: 'Question' },
        {
          text: 'Hidden request context',
          quoteContext: true,
          quoteReference: { text: 'Selected model output', sourceMessageIndex: 2 }
        }
      ]
    },
    ...dependencies
  });

  assert.match(view.messageHTML, /message-stack-user message-stack-has-quote/);
  assert.match(view.messageHTML, /class="sent-message-quote" data-quote-reference/);
  assert.match(view.messageHTML, /sent-message-quote-text">USER:Selected model output/);
  assert.doesNotMatch(view.messageHTML, /↳/);
  assert.match(view.messageHTML, /message-content">\<div>USER:Question<\/div>/);
  assert.doesNotMatch(view.messageHTML, /Hidden request context/);
  assert.ok(view.messageHTML.indexOf('sent-message-quote') < view.messageHTML.indexOf('message-bubble'));
});

test('keeps media grid data and text part ordering in the render view', () => {
  const image = { name: 'image.png', mimeType: 'image/png', data: 'abc' };
  const video = { name: 'clip.mp4', mimeType: 'video/mp4', data: 'def' };
  const view = buildMessageRenderView({
    message: {
      role: 'user',
      parts: [
        { text: 'First' },
        { inlineData: image },
        { text: 'Second' },
        { inlineData: video }
      ]
    },
    ...dependencies
  });

  assert.deepEqual(view.previewMediaParts, [image, video]);
  assert.match(view.messageHTML, /<div class="media-grid">image\.png,clip\.mp4<\/div>/);
  assert.match(view.messageHTML, /USER:First\nSecond/);
});

test('preserves loading, empty, and unknown-role rendering boundaries', () => {
  const loading = buildMessageRenderView({
    message: { role: 'model', parts: [{ text: '...' }] },
    ...dependencies
  });
  const empty = buildMessageRenderView({
    message: { role: 'user', parts: [] },
    ...dependencies
  });
  const unknown = buildMessageRenderView({
    message: { role: 'tool', parts: [{ text: 'Tool text' }] },
    ...dependencies
  });

  assert.match(loading.messageHTML, /<div class="typing-cursor">&nbsp;<\/div>/);
  assert.doesNotMatch(empty.messageHTML, /message-bubble/);
  assert.equal(unknown.isUser, false);
  assert.match(unknown.messageClassName, /model-message$/);
  assert.match(unknown.messageHTML, /MODEL:Tool text/);
});

test('message markup renderer source avoids runtime side-effect ownership', () => {
  const source = readSource('src/app/legacy-runtime/features/message-markup-renderer.js');

  for (const token of [
    'document',
    'window',
    'globalThis',
    'fetch',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'addEventListener',
    'requestAnimationFrame',
    'setTimeout',
    'streamApiCall',
    'DOMPurify',
    'katex',
    'package.json',
    'vite.config',
    'virtual:legacy-app-runtime'
  ]) {
    assert.equal(source.includes(token), false, token);
  }
});
