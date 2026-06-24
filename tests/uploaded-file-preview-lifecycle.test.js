import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createUploadedFilePreviewLifecycle } from '../src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createFixture = (files) => {
  const dom = createDom(`
    <div class="input-wrapper"></div>
    <div id="previews"></div>
  `);
  let currentFiles = [...files];
  const opened = [];
  const calls = [];
  const lifecycle = createUploadedFilePreviewLifecycle({
    document: dom.document,
    getFiles: () => currentFiles,
    setFiles: (nextFiles) => { currentFiles = nextFiles; },
    getContainer: () => dom.document.querySelector('#previews'),
    getInputWrapper: () => dom.document.querySelector('.input-wrapper'),
    openMediaPreview: (media) => opened.push(media),
    updateInputState: () => calls.push('updateInputState')
  });
  return {
    ...dom,
    lifecycle,
    opened,
    calls,
    getFiles: () => currentFiles
  };
};

test('renders image, video, and file previews with stable controls', () => {
  const fixture = createFixture([
    { id: 'image', name: 'photo.png', type: 'image/png', base64: 'data:image/png;base64,abc' },
    { id: 'video', name: 'clip.mp4', type: 'video/mp4', base64: 'data:video/mp4;base64,def' },
    { id: 'file', name: 'notes.pdf', type: 'application/pdf', base64: 'data:application/pdf;base64,ghi' }
  ]);
  try {
    fixture.lifecycle.renderFilePreviews();

    const previews = fixture.document.querySelectorAll('.file-preview-item');
    assert.equal(previews.length, 3);
    assert.match(previews[0].innerHTML, /<img src="data:image\/png;base64,abc"/);
    assert.match(previews[1].innerHTML, /<video src="data:video\/mp4;base64,def"/);
    assert.match(previews[1].innerHTML, /file-preview-play/);
    assert.match(previews[2].innerHTML, /class="w-8 h-8 text-gray-500"/);
    assert.equal(fixture.document.querySelectorAll('.file-preview-item > button').length, 3);
    assert.equal(fixture.document.querySelector('.input-wrapper').classList.contains('has-file-previews'), true);
    assert.equal(fixture.document.querySelector('#previews').classList.contains('has-files'), true);
    assert.deepEqual(fixture.calls, ['updateInputState']);
  } finally {
    fixture.cleanup();
  }
});

test('image and video preview clicks hand off normalized inline media', () => {
  const fixture = createFixture([
    { id: 'image', name: 'photo.png', type: 'image/png', base64: 'data:image/png;base64,abc' },
    { id: 'video', name: 'clip.mp4', type: 'video/mp4', base64: 'data:video/mp4;base64,def' }
  ]);
  try {
    fixture.lifecycle.renderFilePreviews();
    const previews = fixture.document.querySelectorAll('.file-preview-item');

    previews[0].click();
    previews[1].click();

    assert.deepEqual(fixture.opened, [
      { mimeType: 'image/png', data: 'abc', name: 'photo.png' },
      { mimeType: 'video/mp4', data: 'def', name: 'clip.mp4' }
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('remove controls stop propagation, update files, rerender, and handle missing ids', () => {
  const fixture = createFixture([
    { id: 'keep', name: 'keep.png', type: 'image/png', base64: 'data:image/png;base64,keep' },
    { id: 'remove', name: 'remove.png', type: 'image/png', base64: 'data:image/png;base64,remove' }
  ]);
  try {
    fixture.lifecycle.renderFilePreviews();
    fixture.document.querySelectorAll('.file-preview-item > button')[1].click();

    assert.deepEqual(fixture.getFiles().map((file) => file.id), ['keep']);
    assert.equal(fixture.document.querySelectorAll('.file-preview-item').length, 1);
    assert.deepEqual(fixture.opened, []);

    fixture.lifecycle.removeFile('missing');
    assert.deepEqual(fixture.getFiles().map((file) => file.id), ['keep']);
  } finally {
    fixture.cleanup();
  }
});

test('empty files clear preview state and still refresh input state', () => {
  const fixture = createFixture([]);
  try {
    fixture.document.querySelector('#previews').innerHTML = '<span>stale</span>';

    fixture.lifecycle.renderFilePreviews();

    assert.equal(fixture.document.querySelector('#previews').innerHTML, '');
    assert.equal(fixture.document.querySelector('.input-wrapper').classList.contains('has-file-previews'), false);
    assert.equal(fixture.document.querySelector('#previews').classList.contains('has-files'), false);
    assert.deepEqual(fixture.calls, ['updateInputState']);
  } finally {
    fixture.cleanup();
  }
});

test('uploaded file preview lifecycle source avoids provider, storage schema, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js');
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
