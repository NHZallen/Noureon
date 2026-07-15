import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createConversationViewRenderer } from '../src/app/legacy-runtime/features/conversation-view-renderer.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createRenderer = (document, overrides = {}) => {
  const bound = [];
  const generatedBound = [];
  const renderer = createConversationViewRenderer({
    document,
    renderUserText: (text) => `USER:${text}`,
    renderModelText: (text) => `MODEL:${text}`,
    renderMediaAttachmentGrid: (media) => `<grid>${media.length}</grid>`,
    bindMediaPreviewButtons: (root, media) => bound.push({ root, media }),
    bindGeneratedImageAssets: (root, assets) => generatedBound.push({ root, assets }),
    mediaMode: 'wrapped',
    wrapTextParts: false,
    ...overrides
  });
  return { renderer, bound, generatedBound };
};

test('renders and binds AI-generated images in archived and trash conversation previews', async () => {
  const { document, cleanup } = createDom('<div id="content"></div>');
  try {
    const { renderer, generatedBound } = createRenderer(document);
    const generatedImage = { id: 'generated-1', storageKey: 'generatedImage:user:generated-1', aspectRatio: '16:9' };

    renderer.renderConversationMessages({
      conversation: { messages: [{ role: 'model', parts: [{ generatedImage }] }] },
      contentContainer: document.querySelector('#content'),
      emptyHTML: '<p>Empty</p>'
    });
    await Promise.resolve();

    const card = document.querySelector('[data-generated-image-card="generated-1"]');
    assert.ok(card);
    assert.match(card.className, /has-known-aspect/);
    assert.equal(card.style.aspectRatio, '16 / 9');
    assert.ok(card.querySelector('[data-generated-image-preview="generated-1"]'));
    assert.ok(card.querySelector('[data-generated-image-id="generated-1"]'));
    assert.ok(card.querySelector('[data-generated-image-download="generated-1"]'));
    assert.deepEqual(generatedBound[0].assets, [generatedImage]);
  } finally {
    cleanup();
  }
});

test('renders user and model messages with media in source order', () => {
  const { document, cleanup } = createDom('<div id="content"></div>');
  try {
    const { renderer, bound } = createRenderer(document);
    const inlinePart = { inlineData: { name: 'photo.png' } };
    const conversation = {
      messages: [
        { role: 'user', parts: [{ text: 'Hi' }, inlinePart] },
        { role: 'model', parts: [{ text: 'Answer' }] }
      ]
    };

    renderer.renderConversationMessages({
      conversation,
      contentContainer: document.querySelector('#content'),
      emptyHTML: '<p>Empty</p>'
    });

    const messages = document.querySelectorAll('#content > div');
    assert.equal(messages.length, 2);
    assert.match(messages[0].className, /justify-end user-message/);
    assert.match(messages[0].innerHTML, /<grid>1<\/grid>/);
    assert.match(messages[0].innerHTML, /USER:Hi/);
    assert.match(messages[1].className, /model-message/);
    assert.match(messages[1].innerHTML, /MODEL:Answer/);
    assert.deepEqual(bound[0].media, [inlinePart]);
  } finally {
    cleanup();
  }
});

test('preserves archived inline-data unwrapping and per-part text wrappers', () => {
  const { document, cleanup } = createDom('<div id="content"></div>');
  try {
    const { renderer, bound } = createRenderer(document, {
      mediaMode: 'inlineData',
      wrapTextParts: true
    });
    const media = { name: 'archive.png', mimeType: 'image/png' };

    renderer.renderConversationMessages({
      conversation: {
        messages: [{ role: 'model', parts: [{ text: 'One' }, { text: 'Two' }, { inlineData: media }] }]
      },
      contentContainer: document.querySelector('#content'),
      emptyHTML: '<p>Empty</p>'
    });

    assert.match(document.querySelector('#content').innerHTML, /<div>MODEL:One<\/div><div>MODEL:Two<\/div>/);
    assert.deepEqual(bound[0].media, [media]);
  } finally {
    cleanup();
  }
});

test('preserves archived text-first handling when a part also carries inline media', () => {
  const { document, cleanup } = createDom('<div id="content"></div>');
  try {
    const { renderer, bound } = createRenderer(document, {
      mediaMode: 'inlineData',
      wrapTextParts: true
    });
    const conversation = {
      messages: [{
        role: 'user',
        parts: [{
          text: 'caption only',
          inlineData: { mimeType: 'image/png', data: 'ignored' }
        }]
      }]
    };

    renderer.renderConversationMessages({
      conversation,
      contentContainer: document.querySelector('#content'),
      emptyHTML: '<p>empty</p>'
    });

    assert.match(document.querySelector('#content').innerHTML, /USER:caption only/);
    assert.match(document.querySelector('#content').innerHTML, /<grid>0<\/grid>/);
    assert.deepEqual(bound[0].media, []);
  } finally {
    cleanup();
  }
});

test('archived user messages omit hidden quote context from visible text', () => {
  const { document, cleanup } = createDom('<div id="content"></div>');
  try {
    const { renderer } = createRenderer(document);
    renderer.renderConversationMessages({
      conversation: {
        messages: [{
          role: 'user',
          parts: [
            { text: 'Stored question', displayText: 'Visible question' },
            { text: 'Hidden quote context', quoteContext: true }
          ]
        }]
      },
      contentContainer: document.querySelector('#content'),
      emptyHTML: '<p>empty</p>'
    });

    assert.match(document.querySelector('#content').innerHTML, /USER:Visible question/);
    assert.doesNotMatch(document.querySelector('#content').innerHTML, /Hidden quote context/);
  } finally {
    cleanup();
  }
});

test('renders the supplied empty state and ignores a missing conversation', () => {
  const { document, cleanup } = createDom('<div id="content">stale</div>');
  try {
    const { renderer } = createRenderer(document);
    const container = document.querySelector('#content');

    assert.equal(renderer.renderConversationMessages({
      conversation: null,
      contentContainer: container,
      emptyHTML: '<p>Empty</p>'
    }), false);
    assert.equal(container.innerHTML, 'stale');

    assert.equal(renderer.renderConversationMessages({
      conversation: { messages: [] },
      contentContainer: container,
      emptyHTML: '<p>Empty</p>'
    }), true);
    assert.equal(container.innerHTML, '<p>Empty</p>');
  } finally {
    cleanup();
  }
});

test('anchors a rendered conversation through delayed image and video layout changes', () => {
  const { document, cleanup } = createDom('<div id="content"></div>');
  const scheduledFrames = [];
  let scrollHeight = 600;
  try {
    const { renderer } = createRenderer(document, {
      scheduleFrame: (callback) => scheduledFrames.push(callback),
      renderMediaAttachmentGrid: () => '<img src="delayed.png" alt="Delayed"><video src="delayed.mp4"></video>'
    });
    const container = document.querySelector('#content');
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 400 }
    });
    renderer.renderConversationMessages({
      conversation: { messages: [{ role: 'model', parts: [{ image_url: 'delayed.png' }] }] },
      contentContainer: container,
      emptyHTML: '<p>Empty</p>'
    });
    const image = container.querySelector('img');
    const video = container.querySelector('video');
    Object.defineProperty(image, 'complete', { configurable: true, value: false });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    container.scrollTop = 50;

    renderer.anchorToBottom(container);

    assert.equal(container.scrollTop, 50);
    scheduledFrames.shift()();
    assert.equal(container.scrollTop, 600);

    scrollHeight = 850;
    image.dispatchEvent(new document.defaultView.Event('load'));
    assert.equal(container.scrollTop, 850);

    scrollHeight = 1000;
    video.dispatchEvent(new document.defaultView.Event('loadedmetadata'));
    assert.equal(container.scrollTop, 1000);
  } finally {
    cleanup();
  }
});

test('stops archived bottom anchoring when the reader scrolls upward or the view rerenders', () => {
  const { document, cleanup } = createDom('<div id="content"></div>');
  const scheduledFrames = [];
  let scrollHeight = 700;
  try {
    const { renderer } = createRenderer(document, {
      scheduleFrame: (callback) => scheduledFrames.push(callback),
      renderMediaAttachmentGrid: () => '<img src="delayed.png" alt="Delayed">'
    });
    const container = document.querySelector('#content');
    const conversation = { messages: [{ role: 'model', parts: [{ image_url: 'delayed.png' }] }] };
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 400 }
    });
    renderer.renderConversationMessages({ conversation, contentContainer: container, emptyHTML: '<p>Empty</p>' });
    let image = container.querySelector('img');
    Object.defineProperty(image, 'complete', { configurable: true, value: false });
    renderer.anchorToBottom(container);
    scheduledFrames.shift()();

    container.scrollTop = 100;
    container.dispatchEvent(new document.defaultView.Event('scroll'));
    scrollHeight = 1100;
    image.dispatchEvent(new document.defaultView.Event('load'));
    assert.equal(container.scrollTop, 100);

    renderer.renderConversationMessages({ conversation, contentContainer: container, emptyHTML: '<p>Empty</p>' });
    image = container.querySelector('img');
    Object.defineProperty(image, 'complete', { configurable: true, value: false });
    renderer.anchorToBottom(container);
    renderer.renderConversationMessages({
      conversation: { messages: [{ role: 'model', parts: [{ text: 'Replacement' }] }] },
      contentContainer: container,
      emptyHTML: '<p>Empty</p>'
    });
    container.scrollTop = 250;
    scheduledFrames.shift()();
    assert.equal(container.scrollTop, 250);
  } finally {
    cleanup();
  }
});

test('conversation view renderer source avoids provider, storage schema, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/conversation-view-renderer.js');
  for (const token of [
    'fetch',
    'streamApiCall',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'package.json',
    'vite.config',
    'virtual:legacy-app-runtime'
  ]) {
    assert.equal(source.includes(token), false, token);
  }
});
