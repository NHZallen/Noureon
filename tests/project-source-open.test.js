import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSourceOpener, sourceAsFile } from '../src/app/ui/projects/project-source-open.js';

// A source of a project is looked at and had as a file: the file it is (a text is its words, a file is read, a web address has none), the preview, the download and what is said when it cannot be read.

const PROJECT = { id: 'p1' };
const FILE = { id: 's-file', kind: 'file', title: 'plan.pdf', file: { name: 'plan.pdf', mimeType: 'application/pdf', hash: 'a'.repeat(64) } };
const TEXT = { id: 's-text', kind: 'text', title: 'Brief: "blue"', text: 'The brief says blue. 中文' };

test('a text source is a file of its words, a research is a markdown file, a file is read with its own name and type, a web address has no file', async () => {
  const text = await sourceAsFile({ project: PROJECT, source: TEXT, loadFile: async () => null });
  assert.equal(text.name, 'Brief blue.txt', 'the marks a file name may not have are taken out');
  assert.equal(text.type, 'text/plain');
  assert.equal(Buffer.from(text.base64.split(',')[1], 'base64').toString('utf8'), 'The brief says blue. 中文');
  const research = await sourceAsFile({ project: PROJECT, source: { ...TEXT, origin: 'research', title: 'Report' }, loadFile: async () => null });
  assert.deepEqual([research.name, research.type], ['Report.md', 'text/markdown']);
  const asked = [];
  const file = await sourceAsFile({ project: PROJECT, source: FILE, loadFile: async (args) => { asked.push(args.source.id); return { mimeType: 'application/pdf', data: 'QUJD' }; } });
  assert.deepEqual([file.name, file.type, file.base64, asked], ['plan.pdf', 'application/pdf', 'data:application/pdf;base64,QUJD', ['s-file']]);
  assert.equal(await sourceAsFile({ project: PROJECT, source: { id: 'u', kind: 'url', url: 'https://example.com' }, loadFile: async () => ({ data: 'x' }) }), null);
  assert.equal(await sourceAsFile({ project: PROJECT, source: FILE, loadFile: async () => null }), null, 'a file that cannot be read');
  // a file whose original cannot be had but whose text was read: its text is what there is
  const legacy = await sourceAsFile({ project: PROJECT, source: { ...FILE, title: 'report.docx', text: 'The words.', file: undefined }, loadFile: async () => null });
  assert.deepEqual([legacy.name, legacy.type, Buffer.from(legacy.base64.split(',')[1], 'base64').toString()], ['report.txt', 'text/plain', 'The words.']);
  const fallback = await sourceAsFile({ project: PROJECT, source: { ...FILE, text: 'The words.' }, loadFile: async () => null });
  assert.equal(fallback.name, 'plan.txt');
});

function setup({ loaded = { mimeType: 'text/plain', data: Buffer.from('hello').toString('base64') } } = {}) {
  const window = new Window();
  const { document } = window;
  const notes = [];
  const opened = [];
  const delivered = [];
  window.open = (url) => opened.push(url);
  window.URL.createObjectURL = () => 'blob:x';
  window.URL.revokeObjectURL = () => {};
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function click() { delivered.push([this.download, this.href]); };
  const reads = [];
  const opener = createSourceOpener({
    document, window, language: 'en', text: (key) => key, notify: (message, type) => notes.push([message, type]),
    loadFile: async ({ source }) => { reads.push(source.id); return loaded; }, openMedia: (media) => opened.push(media.name)
  });
  return { window, document, opener, notes, opened, delivered, reads, restore: () => { window.HTMLAnchorElement.prototype.click = originalClick; } };
}

test('a web address opens as a link and has no download; a file that cannot be read says so', async () => {
  const t = setup({ loaded: null });
  assert.equal(await t.opener.preview(PROJECT, { id: 'u', kind: 'url', url: 'https://example.com/a' }), true);
  assert.deepEqual(t.opened, ['https://example.com/a']);
  assert.equal(await t.opener.preview(PROJECT, { id: 'u', kind: 'url', url: 'javascript:alert(1)' }), true);
  assert.deepEqual(t.opened, ['https://example.com/a'], 'only a web address is opened');
  assert.equal(await t.opener.download(PROJECT, { id: 'u', kind: 'url', url: 'https://example.com/a' }), false);
  assert.equal(await t.opener.download(PROJECT, FILE), false);
  assert.deepEqual(t.notes, [['pjSourceOpenFailed', 'error']]);
  await t.window.happyDOM.abort();
});

test('a picture goes to the viewer of pictures; a file is had under its own name; what was read is kept for the next tap', async () => {
  const t = setup({ loaded: { mimeType: 'image/png', data: 'AAAA' } });
  await t.opener.preview(PROJECT, { id: 'img', kind: 'image', title: 'photo.png', file: { name: 'photo.png', mimeType: 'image/png', hash: 'b'.repeat(64) } });
  assert.deepEqual(t.opened, ['photo.png']);
  await t.opener.download(PROJECT, { id: 'img', kind: 'image', title: 'photo.png', file: { name: 'photo.png', mimeType: 'image/png', hash: 'b'.repeat(64) } });
  assert.deepEqual(t.reads, ['img'], 'it was read once for both');
  assert.equal(t.delivered.length, 1);
  assert.equal(t.delivered[0][0], 'photo.png');
  t.restore();
  await t.window.happyDOM.abort();
});

test('a text source is had as a .txt file', async () => {
  const t = setup();
  assert.equal(await t.opener.download(PROJECT, TEXT), true);
  assert.equal(t.delivered[0][0], 'Brief blue.txt');
  t.restore();
  await t.window.happyDOM.abort();
});

test('the viewer of pictures that a source opens in is in the language of the page: its words come from the page’s table, not from English', async () => {
  const { openProjectMedia } = await import('../src/app/runtime/projects/project-media-viewer.js');
  const window = new Window();
  const table = { save: '儲存', share: '分享', closePreview: '關閉預覽' };
  openProjectMedia({ document: window.document, language: 'zh-TW', media: { mimeType: 'image/png', data: 'AAAA', name: 'photo.png' }, getText: (key, fallback) => table[key] || fallback });
  const box = window.document.querySelector('.media-lightbox');
  assert.match(box.textContent, /儲存/);
  assert.equal(box.querySelector('.media-lightbox-close').getAttribute('aria-label'), '關閉預覽');
  assert.doesNotMatch(box.textContent, /Save/);
  await window.happyDOM.abort();
});
