import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildMessageRenderView } from '../src/app/runtime/messages/message-markup-renderer.js';

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

test('renders sent composer functions inline while excluding council metadata', () => {
  const view = buildMessageRenderView({
    message: {
      role: 'user',
      parts: [{
        text: '看看天氣',
        displayText: '🌐 網頁搜尋 看看天氣',
        displaySegments: [
          { type: 'mode', indicatorId: 'search-indicator', label: '網頁搜尋' },
          { type: 'text', text: ' 看看天氣' },
          { type: 'mode', indicatorId: 'model-council-indicator', label: '理事會' }
        ]
      }]
    },
    ...dependencies
  });

  assert.match(view.messageHTML, /class="sent-composer-mode" data-composer-mode="search-indicator"/);
  assert.match(view.messageHTML, /class="sent-composer-mode-icon" src="\/assets\/composer-tools\/web-search\.png"/);
  assert.match(view.messageHTML, /網頁搜尋/);
  assert.match(view.messageHTML, /USER: 看看天氣/);
  assert.doesNotMatch(view.messageHTML, /理事會/);
});

test('renders expandable history references without exposing source UUIDs', () => {
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const view = buildMessageRenderView({
    message: {
      role: 'model',
      parts: [{ text: 'Answer' }],
      createdAt: '2026-06-24T10:30:00.000Z'
    },
    historySources: [{
      id: sourceId,
      title: 'Earlier project discussion',
      updatedAtLabel: '2026-06-23 09:00',
      available: true
    }, { available: false }],
    historySourceTexts: {
      referenceLabel: 'Referenced {count} prior conversations',
      updatedLabel: 'Updated',
      unavailableLabel: 'Conversation unavailable'
    },
    ...dependencies
  });

  assert.match(view.messageHTML, /<details class="history-source-references">/);
  assert.match(view.messageHTML, /Referenced 2 prior conversations/);
  assert.match(view.messageHTML, /data-history-source-index="0"/);
  assert.match(view.messageHTML, /Earlier project discussion/);
  assert.match(view.messageHTML, /Conversation unavailable/);
  assert.doesNotMatch(view.messageHTML, new RegExp(sourceId));
});

test('a reply the automatic visual check asked for is marked before its bubble, and an ordinary one is not', () => {
  const checked = buildMessageRenderView({
    message: { role: 'model', parts: [{ text: 'Redone' }], createdAt: '2026-06-24T10:30:00.000Z', metadata: { visionCheck: { issues: [] } } },
    historySourceTexts: { autoCheckLabel: 'Redone after an <automatic> visual check' },
    ...dependencies
  });
  assert.match(checked.messageHTML, /<div class="auto-check-note">Redone after an &lt;automatic&gt; visual check<\/div>/);
  assert.ok(checked.messageHTML.indexOf('auto-check-note') < checked.messageHTML.indexOf('message-bubble'));
  const ordinary = buildMessageRenderView({
    message: { role: 'model', parts: [{ text: 'Answer' }], createdAt: '2026-06-24T10:30:00.000Z' },
    historySourceTexts: { autoCheckLabel: 'Redone after an automatic visual check' },
    ...dependencies
  });
  assert.doesNotMatch(ordinary.messageHTML, /auto-check-note/);
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
  assert.match(view.messageHTML, /class="sent-message-quote-icon"[^>]*>[\s\S]*<svg[^>]*stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(view.messageHTML, /M6 4v4\.5A4\.5 4\.5 0 0 0 10\.5 13H18/);
  assert.doesNotMatch(view.messageHTML, /↳/);
  assert.match(view.messageHTML, /sent-message-quote-text">USER:Selected model output/);
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
  const source = readSource('src/app/runtime/messages/message-markup-renderer.js');

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

test('a reply of words and pictures (a text model drew them itself) has the pictures and the footer; pictures alone have none', () => {
  const picture = { generatedImage: { id: 'img-1', storageKey: 'k', mediaType: 'image/png', size: 10, aspectRatio: '1:1' } };
  const mixed = buildMessageRenderView({
    message: { role: 'model', parts: [{ text: 'Here it is' }, picture], createdAt: '2026-06-24T10:30:00.000Z' },
    ...dependencies
  });
  assert.match(mixed.messageHTML, /data-generated-image-card="img-1"/);
  assert.match(mixed.messageHTML, /MODEL:Here it is/);
  assert.match(mixed.messageHTML, /copy-content-btn/);
  assert.equal(mixed.generatedImageAssets.length, 1);
  const alone = buildMessageRenderView({
    message: { role: 'model', parts: [picture], createdAt: '2026-06-24T10:30:00.000Z' },
    ...dependencies
  });
  assert.doesNotMatch(alone.messageHTML, /copy-content-btn/);
});

test('a text reply with pictures in it is drawn again whole once it is finished, so the pictures show at once', async () => {
  const { finalizeAssistantResponse } = await import('../src/app/runtime/reply/assistant-response-finalization.js');
  const run = async (extraParts, options = {}) => {
    const shown = [];
    await finalizeAssistantResponse({
      fullResponse: 'Here it is.',
      extraParts,
      finalAiMessage: { role: 'model', parts: [] },
      conversation: { messages: [] },
      signal: new AbortController().signal,
      responseUsesCouncil: false,
      targetElement: null,
      uiLanguage: 'en',
      persistAppData: async () => {},
      completeSingleModelView: async () => {},
      queueBackgroundTask: () => {},
      showMessageWithPictures: ({ finalAiMessage }) => shown.push(finalAiMessage.parts.length),
      ...options
    });
    return shown;
  };
  assert.deepEqual(await run([{ generatedImage: { id: 'a' } }]), [2]);
  assert.deepEqual(await run([{ sandboxFile: { id: 'q', name: 'q.csv', data: 'YQ==' } }]), [], 'files are cards in the text: nothing to draw again');
  assert.deepEqual(await run([]), []);
});

test('a reply that reads words, picture, words is drawn in that order, numbers count across the whole message, the footer is on the last bubble', () => {
  const picture = (id) => ({ generatedImage: { id, storageKey: id, mediaType: 'image/png', size: 1, aspectRatio: '1:1' } });
  const view = buildMessageRenderView({
    message: { role: 'model', parts: [{ text: 'I will draw it.' }, picture('a'), { text: 'Here it is.' }, picture('b'), picture('c'), { text: 'Anything else?' }], createdAt: '2026-06-24T10:30:00.000Z' },
    ...dependencies
  });
  const html = view.messageHTML;
  const at = (needle) => html.indexOf(needle);
  assert.ok(at('MODEL:I will draw it.') < at('data-generated-image-card="a"'));
  assert.ok(at('data-generated-image-card="a"') < at('MODEL:Here it is.'));
  assert.ok(at('MODEL:Here it is.') < at('data-generated-image-card="b"'));
  assert.ok(at('data-generated-image-card="c"') < at('MODEL:Anything else?'));
  assert.equal((html.match(/class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative"/g) || []).length, 3);
  assert.equal((html.match(/copy-content-btn/g) || []).length, 1, 'one footer');
  assert.ok(at('copy-content-btn') > at('MODEL:Anything else?'));
  assert.deepEqual([...html.matchAll(/class="picture-number" aria-hidden="true">(\d+)</g)].map((match) => match[1]), ['1', '2', '3']);
  assert.equal(view.generatedImageAssets.length, 3);
  assert.match(html, /reply-with-pictures/);
});

test('the finished message puts the pictures a text model drew among the words, where the server had them', async () => {
  const { finalizeAssistantResponse } = await import('../src/app/runtime/reply/assistant-response-finalization.js');
  const { formatSandboxRunBlock } = await import('../src/app/ui/sandbox/sandbox-run-block.js');
  const record = formatSandboxRunBlock({ status: 'done', steps: [], elapsedMs: 3000 });
  const finalAiMessage = { role: 'model', parts: [] };
  const file = { sandboxFile: { id: 'q', name: 'q.csv', data: 'YQ==' } };
  await finalizeAssistantResponse({
    fullResponse: `${record}I will draw it.Here it is.`,
    extraParts: [{ generatedImage: { id: 'a' } }, file],
    pictureOffsets: [15],
    finalAiMessage,
    conversation: { messages: [] },
    signal: new AbortController().signal,
    responseUsesCouncil: false,
    targetElement: null,
    uiLanguage: 'en',
    persistAppData: async () => {},
    completeSingleModelView: async () => {},
    queueBackgroundTask: () => {}
  });
  assert.deepEqual(finalAiMessage.parts.map((part) => (part.generatedImage ? 'picture' : part.sandboxFile ? 'file' : part.text.replace(record, '[record]'))), ['[record]I will draw it.', 'picture', 'Here it is.', 'file']);
});
