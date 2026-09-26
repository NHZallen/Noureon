import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractFileBlocks,
  findTrailingStreamingFileBlock,
  hashFileBlock,
  parseFileInfoString,
  scanFileBlocks
} from '../../src/app/ui/files/file-block-protocol.js';

test('a four-backtick file block keeps inner three-backtick code intact', () => {
  const source = [
    'Here is your guide.',
    '',
    '````file 安裝指南.md',
    '# 安裝',
    '```bash',
    'npm install',
    '```',
    'Done.',
    '````',
    '',
    'Enjoy.'
  ].join('\n');

  const [block] = scanFileBlocks(source);
  assert.equal(block.name, '安裝指南.md');
  assert.equal(block.complete, true);
  assert.equal(block.content, '# 安裝\n```bash\nnpm install\n```\nDone.');
});

test('a three-backtick outer fence survives inner fences that carry a language', () => {
  const source = [
    '```file report.md',
    'Intro',
    '```python',
    'print("hi")',
    '```',
    '```js',
    'x()',
    '```',
    'Outro',
    '```',
    'After the file'
  ].join('\n');

  const blocks = scanFileBlocks(source);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].content, 'Intro\n```python\nprint("hi")\n```\n```js\nx()\n```\nOutro');
  assert.equal(source.slice(blocks[0].end), 'After the file');
});

test('tilde fences and alternative info-string spellings are accepted', () => {
  assert.equal(scanFileBlocks('~~~file notes.txt\nhello\n~~~')[0].content, 'hello');
  assert.deepEqual(parseFileInfoString(':data.csv'), { name: 'data.csv', extensionHint: '' });
  assert.deepEqual(parseFileInfoString(' name="Q3 report.docx"'), { name: 'Q3 report.docx', extensionHint: '' });
  assert.deepEqual(parseFileInfoString(" filename='a b.txt'"), { name: 'a b.txt', extensionHint: '' });
  assert.deepEqual(parseFileInfoString(' 「季報.xlsx」'), { name: '季報.xlsx', extensionHint: '' });
  assert.deepEqual(parseFileInfoString(' csv'), { name: '', extensionHint: 'csv' });
});

test('a name given on the first body line is used when the info string is empty', () => {
  const [block] = scanFileBlocks('````file\nname: plan.md\n---\n# Plan\n````');
  assert.equal(block.name, 'plan.md');
  assert.equal(block.content, '# Plan');
});

test('a header line followed by real front matter keeps the front matter', () => {
  const [block] = scanFileBlocks('````file\nfilename: plan.md\n---\ntitle: Plan\n---\nBody\n````');
  assert.equal(block.name, 'plan.md');
  assert.equal(block.content, '---\ntitle: Plan\n---\nBody');
});

test('file fences inside ordinary code blocks are documentation, not files', () => {
  const source = [
    'Use this format:',
    '```markdown',
    '````file example.txt',
    'content',
    '````',
    '```'
  ].join('\n');
  assert.deepEqual(scanFileBlocks(source), []);
});

test('the word "file" must be the whole info keyword', () => {
  assert.deepEqual(scanFileBlocks('```files\nnot a file\n```'), []);
  assert.deepEqual(scanFileBlocks('```filename\nnot a file\n```'), []);
});

test('an unclosed block is reported as incomplete and runs to the end of the text', () => {
  const [block] = scanFileBlocks('Intro\n````file draft.txt\nline 1\nline 2');
  assert.equal(block.complete, false);
  assert.equal(block.content, 'line 1\nline 2');
});

test('extraction replaces each block with a standalone paragraph token', () => {
  const { text, blocks } = extractFileBlocks('A\n````file a.txt\n1\n````\nB\n````file b.txt\n2\n````\nC');
  assert.equal(blocks.length, 2);
  assert.equal(text, 'A\n\n\nNOURA_FILE_TOKEN_0_END\n\nB\n\n\nNOURA_FILE_TOKEN_1_END\n\nC');
});

test('text without file blocks passes through untouched', () => {
  const source = 'Just text\n```js\ncode()\n```';
  assert.deepEqual(extractFileBlocks(source), { text: source, blocks: [] });
});

test('CRLF sources are normalized inside the block content', () => {
  const [block] = scanFileBlocks('````file a.txt\r\none\r\ntwo\r\n````\r\n');
  assert.equal(block.content, 'one\ntwo');
});

test('streaming detection finds an unfinished block and a partially typed fence', () => {
  const unfinished = findTrailingStreamingFileBlock('Sure!\n\n````file plan.md\n# Pl');
  assert.equal(unfinished.prefix, 'Sure!\n\n');
  assert.equal(unfinished.block.name, 'plan.md');
  assert.equal(unfinished.block.content, '# Pl');

  const partial = findTrailingStreamingFileBlock('Sure!\n```fi');
  assert.equal(partial.partialOpening, true);
  assert.equal(partial.prefix, 'Sure!\n');

  assert.equal(findTrailingStreamingFileBlock('Sure!\n```'), null);
  assert.equal(findTrailingStreamingFileBlock('````file a.txt\nx\n````\nDone'), null);
});

test('block hashes are stable and sensitive to both name and content', () => {
  assert.equal(hashFileBlock('a.txt', 'x'), hashFileBlock('a.txt', 'x'));
  assert.notEqual(hashFileBlock('a.txt', 'x'), hashFileBlock('b.txt', 'x'));
  assert.notEqual(hashFileBlock('a.txt', 'x'), hashFileBlock('a.txt', 'y'));
});
