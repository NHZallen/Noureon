import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSourceUrl, sourceUrlHost, sourceUrlIcon, sourceUrlTitle } from '../src/data/project-source-url.js';
import { normalizeSource, normalizeSources } from '../src/app/runtime/projects/project-source-model.js';
import { createLinkReader } from '../src/data/project-link-read.js';
import { createProjectFilesLoader } from '../src/data/project-files-tool.js';
import { createProjectFilesAccess } from '../src/app/runtime/projects/project-files-access.js';
import { setProjectFoldersReader } from '../src/app/runtime/projects/project-instructions.js';
import { setPageReader } from '../src/app/runtime/projects/page-reader-ref.js';

// A web address as a source of a project: kept as the address only, read by the model when it needs it (src/data/project-source-url.js).

test('an address is kept in its normal form: http or https, no user name, a scheme added when there is none; anything else is refused', () => {
  assert.equal(normalizeSourceUrl('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c');
  assert.equal(normalizeSourceUrl('  example.com/page '), 'https://example.com/page');
  assert.equal(normalizeSourceUrl('http://example.com'), 'http://example.com/');
  for (const bad of ['', 'javascript:alert(1)', 'ftp://example.com/file', 'https://user:pass@example.com/', 'not an address', 'localhost-without-dot', 'https://', `https://example.com/${'a'.repeat(2100)}`, 'data:text/html,hi', 'file:///etc/passwd']) assert.equal(normalizeSourceUrl(bad), '', bad);
  assert.equal(sourceUrlHost('https://www.example.com/x'), 'example.com');
  assert.equal(sourceUrlTitle('https://www.example.com/guide?page=2'), 'example.com/guide?page=2');
  assert.equal(sourceUrlTitle('https://example.com/'), 'example.com');
  assert.equal(sourceUrlIcon('https://example.com/deep/path?x=1'), 'https://example.com/favicon.ico');
  assert.equal(sourceUrlIcon('nonsense'), '');
});

test('a source that is an address is valid without a text or a file, keeps only its address, and a wrong one is not a source', () => {
  const source = normalizeSource({ id: 'u1', kind: 'url', url: 'example.com/a', title: 'Example', text: 'ignored text' });
  assert.equal(source.kind, 'url');
  assert.equal(source.url, 'https://example.com/a');
  assert.equal(normalizeSource({ id: 'u2', kind: 'url', url: 'javascript:alert(1)' }), null);
  assert.equal(normalizeSource({ id: 'u3', kind: 'text', text: 'hello', url: 'https://example.com' }).url, undefined, 'only a source of the kind url has an address');
  assert.equal(normalizeSources([{ id: 'u1', kind: 'url', url: 'https://example.com' }, { id: 'u1', kind: 'url', url: 'https://example.org' }]).length, 1);
});

test('the reader gives the text of the page, and says why when it cannot: no reader at all, or a page that gave nothing', async () => {
  const ok = createLinkReader({ getFetchPages: () => async (urls, signal, options) => ({ pages: [{ text: `page of ${urls[0]} (${options.maxChars})` }], failed: [] }) });
  assert.match(await ok({ url: 'https://example.com/' }), /page of https:\/\/example\.com\/ \(100000\)/);
  await assert.rejects(createLinkReader({ getFetchPages: () => null })({ url: 'https://example.com/' }), { code: 'noReader' });
  await assert.rejects(createLinkReader({ getFetchPages: () => async () => ({ pages: [], failed: [{ url: 'x', reason: 'noReader' }] }) })({ url: 'https://example.com/' }), { code: 'noReader' });
  await assert.rejects(createLinkReader({ getFetchPages: () => async () => ({ pages: [], failed: [{ url: 'x', reason: 'failed' }] }) })({ url: 'https://example.com/' }), { code: 'failed' });
});

const LINK = { id: 'u1', name: 'example.com/guide', url: 'https://example.com/guide', kind: 'link' };

test('the model reads a web page with read_project_file: fetched when asked, kept for the reply, a part at a time; it is not searched', async () => {
  let fetched = 0;
  const text = `The guide says the launch is in March. ${'More words. '.repeat(1500)}`;
  const loader = createProjectFilesLoader({ entries: [], linkEntries: [LINK], readLink: async () => { fetched += 1; return text; }, readText: async () => '' });
  assert.deepEqual(loader.tools.map((tool) => tool.name), ['read_project_file'], 'with only a web page there is nothing to search');
  assert.equal(fetched, 0, 'nothing is fetched before the model asks');
  const first = JSON.parse(await loader.run({ name: 'read_project_file', args: { file: 'example.com/guide' } }));
  assert.equal(first.url, LINK.url);
  assert.equal(first.start, 0);
  assert.equal(first.end, 8000);
  assert.equal(first.total, text.length);
  assert.equal(first.next, 8000);
  assert.match(first.text, /launch is in March/);
  const second = JSON.parse(await loader.run({ name: 'read_project_file', args: { file: LINK.url, start: first.next } }));
  assert.equal(second.start, 8000, 'the address names it too');
  assert.equal(fetched, 1, 'the page is fetched once for a reply');
  assert.deepEqual(loader.noteFor({ name: 'read_project_file' }), { name: 'read_project_file' });
});

test('a web page that cannot be read says why to the model: no key of a reading service, or a page that gave nothing', async () => {
  const noKey = createProjectFilesLoader({ entries: [], linkEntries: [LINK], readLink: async () => { throw Object.assign(new Error('x'), { code: 'noReader' }); }, readText: async () => '' });
  assert.match(await noKey.run({ name: 'read_project_file', args: { file: 'example.com/guide' } }), /no key of a reading service/);
  const blocked = createProjectFilesLoader({ entries: [], linkEntries: [LINK], readLink: async () => { throw Object.assign(new Error('x'), { code: 'failed' }); }, readText: async () => '' });
  assert.match(await blocked.run({ name: 'read_project_file', args: { file: 'example.com/guide' } }), /could not be read now/);
  const empty = createProjectFilesLoader({ entries: [], linkEntries: [LINK], readLink: async () => '  ', readText: async () => '' });
  assert.match(await empty.run({ name: 'read_project_file', args: { file: 'example.com/guide' } }), /could not be read now/);
  assert.match(await empty.run({ name: 'read_project_file', args: { file: 'nothing' } }), /There is no such file\. The files of the project: example\.com\/guide/);
});

test('with files and web pages together the search looks only in the files and says a web page is read, not searched', async () => {
  const loader = createProjectFilesLoader({ entries: [{ id: 'f1', name: 'plan.md', kind: 'file', size: 5 }], linkEntries: [LINK], readLink: async () => 'x', readText: async () => 'The plan: ship on Friday.' });
  assert.deepEqual(loader.tools.map((tool) => tool.name), ['search_project_files', 'read_project_file']);
  assert.match(await loader.run({ name: 'search_project_files', args: { query: 'ship', file: 'example.com/guide' } }), /web pages are not searched/);
  assert.match(await loader.run({ name: 'search_project_files', args: { query: 'ship Friday' } }), /ship on Friday/);
});

const FOLDER = { id: 'f1', name: 'Launch', sources: [{ id: 'u1', kind: 'url', title: 'example.com/guide', mime: '', size: 0, text: '', url: 'https://example.com/guide', addedAt: '' }] };

test('the files of a project that has only web addresses: the model is told them and given read_project_file; a reply made by the server is told the address', async () => {
  setProjectFoldersReader(() => [FOLDER]);
  let asked = null;
  setPageReader(async (urls, signal, options) => { asked = [urls, options.maxChars]; return { pages: [{ text: 'The page words.' }], failed: [] }; });
  try {
    const access = await createProjectFilesAccess({ conversation: { folderId: 'f1' } });
    assert.ok(access, 'a project of addresses has the tools');
    assert.deepEqual(access.entries, [], 'no file to search');
    assert.match(access.catalogText, /with the tools read_project_file/);
    assert.match(access.catalogText, /Web pages of the project[^\n]*\n- example\.com\/guide \(https:\/\/example\.com\/guide\)/);
    const loader = access.make('en');
    assert.deepEqual(loader.tools.map((tool) => tool.name), ['read_project_file']);
    assert.match(await loader.run({ name: 'read_project_file', args: { file: 'example.com/guide' } }), /The page words\./);
    assert.deepEqual(asked, [['https://example.com/guide'], 100000]);
    assert.deepEqual(access.snapshot().entries, [{ id: 'u1', name: 'example.com/guide', size: 0, url: 'https://example.com/guide' }]);
    assert.deepEqual(access.usedNames(), ['example.com/guide']);
  } finally { setProjectFoldersReader(null); setPageReader(null); }
});

test('without a reader of web pages on the page the model is told it cannot read one', async () => {
  setProjectFoldersReader(() => [FOLDER]);
  setPageReader(null);
  try {
    const loader = (await createProjectFilesAccess({ conversation: { folderId: 'f1' } })).make('en');
    assert.match(await loader.run({ name: 'read_project_file', args: { file: 'example.com/guide' } }), /no key of a reading service/);
  } finally { setProjectFoldersReader(null); }
});
