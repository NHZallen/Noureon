import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createMediaPreviewLifecycle } from '../src/app/legacy-runtime/features/media-preview-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const createLifecycle = (window, overrides = {}) => createMediaPreviewLifecycle({
  document: window.document,
  navigator: window.navigator,
  fetch: async () => ({ blob: async () => new window.Blob(['media']) }),
  File: window.File,
  escapeHTML,
  getInlineMediaSrc: (media) => `data:${media.mimeType || 'application/octet-stream'};base64,${media.data}`,
  getUiLanguage: () => 'en',
  logWarn: () => {},
  ...overrides
});

test('binds preview buttons and opens the media item selected by dataset index', () => {
  const { window, document, cleanup } = createDom(`
    <div id="root">
      <button class="message-media-thumb" data-media-index="1"></button>
    </div>
  `);
  try {
    const lifecycle = createLifecycle(window);
    const mediaParts = [
      { name: 'first.png', mimeType: 'image/png', data: 'first' },
      { name: 'second.png', mimeType: 'image/png', data: 'second' }
    ];

    lifecycle.bindMediaPreviewButtons(document.querySelector('#root'), mediaParts);
    document.querySelector('.message-media-thumb').click();

    const overlay = document.querySelector('.media-lightbox');
    assert.ok(overlay);
    assert.equal(overlay.classList.contains('media-lightbox-enter'), true);
    assert.equal(overlay.querySelector('img').getAttribute('src'), 'data:image/png;base64,second');
    assert.equal(overlay.querySelector('img').getAttribute('alt'), 'second.png');
  } finally {
    cleanup();
  }
});

test('opens video preview with download metadata and replaces an existing lightbox', () => {
  const { window, document, cleanup } = createDom('<div class="media-lightbox"></div>');
  try {
    const lifecycle = createLifecycle(window);
    const source = document.createElement('button');
    source.getBoundingClientRect = () => ({
      left: 20,
      top: 40,
      width: 80,
      height: 60,
      right: 100,
      bottom: 100
    });

    lifecycle.openMediaPreview({ name: 'clip.mp4', mimeType: 'video/mp4', data: 'video' }, source);

    const overlay = document.querySelector('.media-lightbox');
    assert.equal(document.querySelectorAll('.media-lightbox').length, 1);
    assert.equal(
      overlay.querySelector('video').getAttribute('src'),
      'data:video/mp4;base64,video'
    );
    assert.match(overlay.style.getPropertyValue('--media-enter-x'), /px$/);
    assert.match(overlay.style.getPropertyValue('--media-enter-y'), /px$/);
    assert.equal(overlay.querySelector('.media-lightbox-download').getAttribute('download'), 'clip.mp4');
    assert.equal(overlay.querySelector('.media-lightbox-close').getAttribute('aria-label'), 'Close preview');
  } finally {
    cleanup();
  }
});

test('close button and Escape remove the lightbox without leaving stale key handlers', () => {
  const { window, document, cleanup } = createDom();
  try {
    const lifecycle = createLifecycle(window);
    lifecycle.openMediaPreview({ name: 'first.png', mimeType: 'image/png', data: 'first' });
    document.querySelector('.media-lightbox-close').click();
    assert.equal(document.querySelector('.media-lightbox'), null);

    lifecycle.openMediaPreview({ name: 'second.png', mimeType: 'image/png', data: 'second' });
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(document.querySelector('.media-lightbox'), null);
  } finally {
    cleanup();
  }
});

test('closing a fullscreen media overlay exits fullscreen before removing it', () => {
  const { window, document, cleanup } = createDom();
  try {
    const lifecycle = createLifecycle(window);
    let exitFullscreenCalls = 0;

    lifecycle.openMediaPreview({ name: 'full.png', mimeType: 'image/png', data: 'full' });
    const overlay = document.querySelector('.media-lightbox');
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: overlay
    });
    document.exitFullscreen = () => {
      exitFullscreenCalls += 1;
      return Promise.resolve();
    };

    overlay.querySelector('.media-lightbox-close').click();

    assert.equal(exitFullscreenCalls, 1);
    assert.equal(document.querySelector('.media-lightbox'), null);
  } finally {
    cleanup();
  }
});

test('close removes the same Escape keydown handler that open registered', () => {
  const { window, document, cleanup } = createDom();
  const originalAddEventListener = document.addEventListener.bind(document);
  const originalRemoveEventListener = document.removeEventListener.bind(document);
  const addedKeydownHandlers = [];
  const removedKeydownHandlers = [];
  try {
    document.addEventListener = (type, handler, options) => {
      if (type === 'keydown') addedKeydownHandlers.push(handler);
      return originalAddEventListener(type, handler, options);
    };
    document.removeEventListener = (type, handler, options) => {
      if (type === 'keydown') removedKeydownHandlers.push(handler);
      return originalRemoveEventListener(type, handler, options);
    };
    const lifecycle = createLifecycle(window);

    lifecycle.openMediaPreview({ name: 'listener.png', mimeType: 'image/png', data: 'listener' });
    document.querySelector('.media-lightbox-close').click();

    assert.equal(addedKeydownHandlers.length, 1);
    assert.equal(removedKeydownHandlers.length, 1);
    assert.equal(removedKeydownHandlers[0], addedKeydownHandlers[0]);
  } finally {
    document.addEventListener = originalAddEventListener;
    document.removeEventListener = originalRemoveEventListener;
    cleanup();
  }
});

test('repeated binding preserves the current duplicate open-handler behavior', () => {
  const { window, document, cleanup } = createDom(`
    <div id="root">
      <button class="message-media-thumb" data-media-index="0"></button>
    </div>
  `);
  const originalAppendChild = document.body.appendChild.bind(document.body);
  let overlayAppendCount = 0;
  try {
    document.body.appendChild = (node) => {
      if (node.classList?.contains('media-lightbox')) overlayAppendCount += 1;
      return originalAppendChild(node);
    };
    const lifecycle = createLifecycle(window);
    const mediaParts = [{ name: 'repeat.png', mimeType: 'image/png', data: 'repeat' }];
    const root = document.querySelector('#root');

    lifecycle.bindMediaPreviewButtons(root, mediaParts);
    lifecycle.bindMediaPreviewButtons(root, mediaParts);
    root.querySelector('.message-media-thumb').click();

    assert.equal(overlayAppendCount, 2);
    assert.equal(document.querySelectorAll('.media-lightbox').length, 1);
  } finally {
    document.body.appendChild = originalAppendChild;
    cleanup();
  }
});

test('missing media and out-of-range preview indexes remain no-op boundaries', () => {
  const { window, document, cleanup } = createDom(`
    <div id="root">
      <button class="message-media-thumb" data-media-index="9"></button>
    </div>
  `);
  try {
    const lifecycle = createLifecycle(window);

    assert.equal(lifecycle.openMediaPreview(null), undefined);
    lifecycle.bindMediaPreviewButtons(document.querySelector('#root'), []);
    document.querySelector('.message-media-thumb').click();
    assert.equal(document.querySelector('.media-lightbox'), null);
  } finally {
    cleanup();
  }
});

test('share handoff fetches the media and invokes navigator share when supported', async () => {
  const { window, document, cleanup } = createDom();
  try {
    const shared = [];
    const fetched = [];
    const navigator = {
      share: async (payload) => shared.push(payload),
      canShare: () => true
    };
    const lifecycle = createLifecycle(window, {
      navigator,
      fetch: async (src) => {
        fetched.push(src);
        return { blob: async () => new window.Blob(['media']) };
      }
    });

    lifecycle.openMediaPreview({ name: 'share.png', mimeType: 'image/png', data: 'share' });
    document.querySelector('.media-lightbox-share').click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    assert.deepEqual(fetched, ['data:image/png;base64,share']);
    assert.equal(shared.length, 1);
    assert.equal(shared[0].title, 'share.png');
    assert.equal(shared[0].files[0].name, 'share.png');
  } finally {
    cleanup();
  }
});

test('media preview lifecycle source avoids provider, storage, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/media-preview-lifecycle.js');

  for (const token of [
    'streamApiCall',
    'TextDecoder',
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
