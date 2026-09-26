import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractFileBlocks,
  findTrailingStreamingFileBlock,
  formatFileBlockSource,
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

test('a four-backtick file closed with three backticks is repaired once the reply is finished', () => {
  const source = [
    '我替你選了一個主題。',
    '',
    '````file 把日子過成一座花園.docx',
    '# 把日子過成一座花園',
    '',
    '而你一直走在其中。',
    '```',
    '',
    '希望你喜歡。'
  ].join('\n');

  const [block] = scanFileBlocks(source);
  assert.equal(block.complete, true);
  assert.equal(block.repaired, true);
  assert.equal(block.content, '# 把日子過成一座花園\n\n而你一直走在其中。');
  assert.equal(source.slice(block.end), '\n希望你喜歡。', 'the text after the file stays in the reply');
  assert.equal(
    formatFileBlockSource(source, block),
    '````file 把日子過成一座花園.docx\n# 把日子過成一座花園\n\n而你一直走在其中。\n````\n'
  );

  // Mid-stream the three backticks may still open an inner code block.
  const streaming = findTrailingStreamingFileBlock(source);
  assert.equal(streaming.block.complete, false);
});

test('the recovered closing fence skips inner code blocks, with or without a language', () => {
  const source = [
    '````file guide.md',
    '```bash',
    'npm install',
    '```',
    'Plain block:',
    '```',
    'raw',
    '```',
    'End.',
    '```',
    'After'
  ].join('\n');
  const [block] = scanFileBlocks(source);
  assert.equal(block.complete, true);
  assert.equal(block.content, '```bash\nnpm install\n```\nPlain block:\n```\nraw\n```\nEnd.');
  assert.equal(source.slice(block.end), 'After');
});

test('a truly cut-off file stays incomplete even when its inner fences are balanced', () => {
  const [block] = scanFileBlocks('````file guide.md\n```\nraw\n```\nThe next sentence was cut o');
  assert.equal(block.complete, false);
  assert.equal(block.repaired, false);
  assert.equal(block.content, '```\nraw\n```\nThe next sentence was cut o');
});

test('several files closed with three backticks, or not at all, are still separated', () => {
  const source = [
    '````file a.docx',
    'A body',
    '```',
    'Between',
    '````file b.docx',
    'B body',
    '````file c.txt',
    'C body',
    '```'
  ].join('\n');
  const { text, blocks } = extractFileBlocks(source);
  assert.deepEqual(blocks.map((block) => [block.name, block.content, block.complete]), [
    ['a.docx', 'A body', true],
    ['b.docx', 'B body', true],
    ['c.txt', 'C body', true]
  ]);
  assert.match(text, /NOURA_FILE_TOKEN_0_END\n\nBetween\n\n\nNOURA_FILE_TOKEN_1_END/);

  // The next file's opening line already proves the previous file ended.
  const streaming = findTrailingStreamingFileBlock('````file a.docx\nA body\n```\n````file b.docx\nB bo');
  assert.equal(streaming.block.name, 'b.docx');
  assert.equal(scanFileBlocks('````file a.docx\nA body\n```\n````file b.docx\nB bo', { streaming: true })[0].complete, true);
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
