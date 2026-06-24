import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createConversationViewRenderer } from '../src/app/legacy-runtime/features/conversation-view-renderer.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createRenderer = (document, overrides = {}) => {
  const bound = [];
  const renderer = createConversationViewRenderer({
    document,
    renderUserText: (text) => `USER:${text}`,
    renderModelText: (text) => `MODEL:${text}`,
    renderMediaAttachmentGrid: (media) => `<grid>${media.length}</grid>`,
    bindMediaPreviewButtons: (root, media) => bound.push({ root, media }),
    mediaMode: 'wrapped',
    wrapTextParts: false,
    ...overrides
  });
  return { renderer, bound };
};

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
