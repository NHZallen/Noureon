import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createUploadedFilePreviewLifecycle } from '../src/app/runtime/features/uploaded-file-preview-lifecycle.js';

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
    assert.match(previews[1].innerHTML, /preload="auto"[^>]*data-video-thumbnail/);
    assert.equal(previews[1].classList.contains('file-preview-video'), true);
    assert.match(previews[1].innerHTML, /file-preview-play/);
    // A file is a card: the picture of its page (the icon of its kind until it is drawn), the kind icon and the name.
    assert.match(previews[2].querySelector('.ac-attach-name').textContent, /^notes\.pdf$/);
    assert.equal(previews[2].dataset.fileFamily, 'pdf');
    assert.ok(previews[2].querySelector('.ac-attach-thumb .ac-kind-pdf'), 'the icon of its kind stands in while the page is drawn');
    assert.match(previews[2].title, /notes\.pdf · PDF 文件（PDF）/);
    assert.equal(fixture.document.querySelectorAll('.file-preview-item > button').length, 3);
    assert.equal(fixture.document.querySelectorAll('.file-preview-remove > svg').length, 3);
    assert.equal(fixture.document.querySelector('.file-preview-remove').textContent, '');
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
  const source = readSource('src/app/runtime/features/uploaded-file-preview-lifecycle.js');
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

test('a card names the file and its kind, a program\'s source and a big file get no picture, and a card that has a preview opens it', () => {
  const big = { id: 'big', name: 'deck.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 20 * 1024 * 1024, base64: 'data:application/octet-stream;base64,AAAA' };
  const source = { id: 'src', name: 'main.py', type: 'text/x-python', size: 10, base64: 'data:text/plain;base64,cHJpbnQoMSk=' };
  const doc = { id: 'doc', name: '1-test-doc.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 100, base64: 'data:application/octet-stream;base64,AAAA' };
  const fixture = createFixture([big, source, doc]);
  try {
    fixture.lifecycle.renderFilePreviews();
    const [bigCard, sourceCard, docCard] = fixture.document.querySelectorAll('.ac-attach-card');
    assert.equal(bigCard.querySelector('.ac-attach-thumb').dataset.state, 'icon', 'over 15 MB: no picture is made');
    assert.equal(sourceCard.querySelector('.ac-attach-thumb').dataset.state, 'icon', 'a program\'s source has no picture');
    assert.equal(sourceCard.dataset.openable, 'false');
    assert.equal(sourceCard.getAttribute('role'), null);
    assert.equal(docCard.dataset.openable, 'true');
    assert.equal(docCard.getAttribute('role'), 'button');
    assert.equal(docCard.querySelector('.ac-attach-thumb').dataset.state, 'loading');
    assert.match(docCard.title, /1-test-doc\.docx · Word 文件（DOCX）/);
    // The cross takes the file away and draws the row again.
    sourceCard.querySelector('.file-preview-remove').click();
    assert.deepEqual(fixture.getFiles().map((file) => file.id), ['big', 'doc']);
    assert.equal(fixture.document.querySelectorAll('.ac-attach-card').length, 2);
  } finally {
    fixture.cleanup();
  }
});

test('taking one file away leaves the other cards as they are, and a new file is added at its place', () => {
  const fixture = createFixture([
    { id: 'a', name: 'a.png', type: 'image/png', base64: 'data:image/png;base64,abc' },
    { id: 'b', name: 'b.png', type: 'image/png', base64: 'data:image/png;base64,abc' },
    { id: 'c', name: 'c.pdf', type: 'application/pdf', base64: 'data:application/pdf;base64,ghi' }
  ]);
  try {
    fixture.lifecycle.renderFilePreviews();
    const [first, second, third] = [...fixture.document.querySelectorAll('.file-preview-item')];
    fixture.lifecycle.removeFile('b');
    const after = [...fixture.document.querySelectorAll('.file-preview-item')];
    assert.equal(after.length, 2);
    assert.equal(after[0], first, 'the first card is the same element, not drawn again');
    assert.equal(after[1], third);
    assert.equal(second.isConnected, false);
  } finally {
    fixture.cleanup();
  }
});
