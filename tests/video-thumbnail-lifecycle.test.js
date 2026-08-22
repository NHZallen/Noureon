import assert from 'node:assert/strict';
import test from 'node:test';

import {
  prepareVideoThumbnail,
  prepareVideoThumbnails
} from '../src/app/legacy-runtime/features/video-thumbnail-lifecycle.js';

const createVideo = () => {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
  const canvas = {
    width: 0,
    height: 0,
    drawn: null,
    getContext: () => ({
      drawImage: (...args) => { canvas.drawn = args; }
    }),
    toDataURL: () => 'data:image/jpeg;base64,poster'
  };
  const video = {
    classList: { add: (name) => classes.add(name) },
    currentTime: 0,
    dataset: {},
    duration: 12,
    muted: false,
    ownerDocument: { createElement: () => canvas },
    playsInline: false,
    poster: '',
    preload: 'metadata',
    readyState: 0,
    videoHeight: 1080,
    videoWidth: 1920,
    addEventListener(name, listener) {
      const values = listeners.get(name) || [];
      values.push(listener);
      listeners.set(name, values);
    },
    removeEventListener(name, listener) {
      listeners.set(name, (listeners.get(name) || []).filter(value => value !== listener));
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    }
  };
  return {
    canvas,
    classes,
    listeners,
    video,
    dispatch(name) {
      for (const listener of [...(listeners.get(name) || [])]) listener({ target: video, type: name });
    }
  };
};

test('video thumbnails seek to an early frame and capture a bounded poster', () => {
  const fixture = createVideo();

  prepareVideoThumbnail(fixture.video);

  assert.equal(fixture.video.preload, 'auto');
  assert.equal(fixture.video.muted, true);
  assert.equal(fixture.video.playsInline, true);
  assert.equal(fixture.video.dataset.videoThumbnailPrepared, 'true');

  fixture.video.readyState = 1;
  fixture.dispatch('loadedmetadata');
  assert.equal(fixture.video.currentTime, 0.1);

  fixture.video.readyState = 2;
  fixture.dispatch('loadeddata');
  assert.equal(fixture.video.poster, '');

  fixture.dispatch('seeked');

  assert.equal(fixture.canvas.width, 480);
  assert.equal(fixture.canvas.height, 270);
  assert.equal(fixture.canvas.drawn[0], fixture.video);
  assert.equal(fixture.video.poster, 'data:image/jpeg;base64,poster');
  assert.equal(fixture.classes.has('video-thumbnail-ready'), true);
  assert.ok([...fixture.listeners.values()].every(values => values.length === 0));
});

test('video thumbnail preparation is idempotent and supports a rendered root', () => {
  const first = createVideo();
  const second = createVideo();
  const root = {
    querySelectorAll: (selector) => selector === 'video[data-video-thumbnail]'
      ? [first.video, second.video]
      : []
  };

  prepareVideoThumbnails(root);
  prepareVideoThumbnail(first.video);

  assert.equal(first.listeners.get('loadedmetadata').length, 1);
  assert.equal(second.listeners.get('loadedmetadata').length, 1);
});
