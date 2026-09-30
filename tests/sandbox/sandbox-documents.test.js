import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import JSZip from 'jszip';
import { loadPyodide } from 'pyodide';

import { prepareFolders, runCode } from '../../public/sandbox/runtime.js';
import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { scanFileBlocks } from '../../src/app/ui/files/file-block-protocol.js';
import { buildDocumentModel } from '../../src/app/ui/files/generators/document-model.js';
import { generateDocxFile } from '../../src/app/ui/files/generators/docx-file.js';
import { createFontSubsetter } from '../../src/app/ui/files/generators/font-embedding.js';
import { composePdf } from '../../src/app/ui/files/generators/pdf-file.js';
import { createSandboxFileParts, referencedAssetNames, sandboxDocumentBlocks, sandboxDocumentNames, withoutDuplicatedFileBlocks, withoutEmptyDocumentBlocks } from '../../src/app/ui/sandbox/sandbox-files.js';

// A 1 × 1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const bytes = (text) => new TextEncoder().encode(text);

const FONT_DIRECTORY = new URL('../../src/assets/fonts/', import.meta.url);
const SUBSETTER_WASM = new URL('../../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url);
let assetsPromise = null;
const fontAssets = () => {
  assetsPromise ||= createFontSubsetter(fs.readFileSync(SUBSETTER_WASM)).then((subsetter) => ({
    loadFontFile: async (file) => new Uint8Array(fs.readFileSync(new URL(file, FONT_DIRECTORY))),
    loadSubsetter: async () => subsetter
  }));
  return assetsPromise;
};

test('Python hands documents to the design system with noureon.save_document', async () => {
  const pyodide = await loadPyodide();
  prepareFolders(pyodide);
  const globals = pyodide.globals.get('dict')();
  const ok = await runCode(pyodide, [
    'import noureon',
    'noureon.save_document("報告.docx", "# 營收\\n\\n合計 **302**")',
    'noureon.save_document("/tmp/../簡報.pptx", {"slides": [{"layout": "title", "title": "第一季", "value": 1.5}]})'
  ].join('\n'), globals);
  assert.equal(ok.error, null);
  assert.match(ok.stdout.text, /報告\.docx: handed to Noureon's design system\./);
  assert.equal(pyodide.FS.readFile('/output/.noureon/報告.docx', { encoding: 'utf8' }), '# 營收\n\n合計 **302**');
  assert.deepEqual(JSON.parse(pyodide.FS.readFile('/output/.noureon/簡報.pptx', { encoding: 'utf8' })), { slides: [{ layout: 'title', title: '第一季', value: 1.5 }] });
  const refused = await runCode(pyodide, 'import noureon\nnoureon.save_document("a.exe", "x")', globals);
  assert.match(refused.error, /ValueError: save_document makes \.docx, \.pptx, \.xlsx or \.pdf files/);
});

test('handed documents become file blocks after the answer, not saved files', () => {
  const content = '# 報告\n\n```chart\n{"type":"bar"}\n```\n\n````\nnested\n````';
  const run = {
    status: 'done',
    steps: [{
      code: 'x',
      files: [{ name: '.noureon/報告.docx', size: 1 }, { name: 'trend.png', size: 1 }],
      outputs: [
        { name: '.noureon/報告.docx', bytes: bytes('old') },
        { name: '.noureon/報告.docx', bytes: bytes(content) },
        { name: '.noureon/notes.txt', bytes: bytes('ignored') },
        { name: 'trend.png', bytes: bytes('png') }
      ]
    }]
  };
  const text = sandboxDocumentBlocks(run);
  const [block] = scanFileBlocks(text);
  assert.equal(scanFileBlocks(text).length, 1, 'only design-system formats');
  assert.equal(block.name, '報告.docx');
  assert.equal(block.content, content, 'a fence longer than any inside');
  assert.ok(text.startsWith('`````file 報告.docx\n'));
  const parts = createSandboxFileParts(run, { createId: () => 'id-1' });
  assert.deepEqual(parts.map((part) => part.sandboxFile.name), ['trend.png'], 'the handed document is not also a saved file');
});

test('a file block the model also wrote under the name of a design-system document is taken out, so no second, empty card shows', () => {
  const run = {
    status: 'done',
    steps: [{
      code: 'x',
      files: [{ name: '.noureon/簡報.pptx', size: 1 }, { name: '.noureon/notes.txt', size: 1 }],
      outputs: [{ name: '.noureon/簡報.pptx', bytes: bytes('{"slides":[]}') }, { name: '.noureon/簡報.pptx', bytes: bytes('{"slides":[1]}') }, { name: '.noureon/notes.txt', bytes: bytes('x') }]
    }]
  };
  assert.deepEqual(sandboxDocumentNames(run), ['簡報.pptx'], 'each once, only design-system formats');
  const answer = ['十二頁都做好了。', '', '````file 簡報.pptx', '````', '', '要調整嗎？'].join('\n');
  const cleaned = withoutDuplicatedFileBlocks(answer, sandboxDocumentNames(run));
  assert.doesNotMatch(cleaned, /簡報\.pptx|````/);
  assert.match(cleaned, /十二頁都做好了/);
  assert.match(cleaned, /要調整嗎/);
  assert.deepEqual(sandboxDocumentNames({ steps: [] }), []);
  assert.deepEqual(sandboxDocumentNames(null), []);
});

test('an office file block with nothing in it is dropped, whatever its name, and real ones stay', () => {
  const answer = ['好了。', '', '````file 空的.pptx', '', '````', '', '````file 有內容.docx', '# 報告', '````', '', '````file notes.txt', '', '````', '', '完成。'].join('\n');
  const cleaned = withoutEmptyDocumentBlocks(answer);
  assert.doesNotMatch(cleaned, /空的\.pptx/);
  assert.match(cleaned, /有內容\.docx/, 'a block with content stays');
  assert.match(cleaned, /notes\.txt/, 'only office formats are judged this way');
  assert.match(cleaned, /好了。/);
  assert.match(cleaned, /完成。/);
  assert.equal(withoutEmptyDocumentBlocks('沒有檔案。'), '沒有檔案。');
  assert.equal(withoutEmptyDocumentBlocks(''), '');
});

test('pictures a document refers to are found, whether written plainly or URL-encoded', () => {
  assert.deepEqual([...referencedAssetNames(['![趨勢](asset:趨勢.png) and {"image": "asset:photo.jpg"}', '![x](asset:%E5%9C%96.png)'])], ['趨勢.png', 'photo.jpg', '圖.png']);
});

test('a paragraph that is only an asset or upload picture becomes a picture block', () => {
  const { blocks } = buildDocumentModel('![各區營收](asset:各區營收.png)\n\n![](upload:2)\n\n![web](https://example.com/a.png)\n\nText ![inline](asset:a.png) here.');
  assert.deepEqual(blocks[0], { type: 'image', source: { kind: 'asset', name: '各區營收.png' }, alt: '各區營收' });
  assert.deepEqual(blocks[1], { type: 'image', source: { kind: 'upload', index: 2 }, alt: '' });
  assert.equal(blocks[2].type, 'paragraph', 'web images are not fetched');
  assert.equal(blocks[3].type, 'paragraph');
});

test('Word and PDF files embed resolved pictures, and fall back to the description', async () => {
  const content = '# 報告\n\n![各區營收](asset:chart.png)\n\n![遺失的圖](asset:missing.png)';
  const resolveImage = async (source) => (source.name === 'chart.png' ? { data: PNG, pixels: { width: 600, height: 300 } } : null);
  const docx = await generateDocxFile(describeFileBlock({ name: 'r.docx', content, complete: true }), { language: 'zh-TW', resolveImage, fontAssets: await fontAssets() });
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir);
  assert.equal(media.length, 1, 'one picture embedded');
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /descr="各區營收"/);
  assert.match(xml, /遺失的圖/, 'the missing picture leaves its description');

  const { definition } = await composePdf(describeFileBlock({ name: 'r.pdf', content, complete: true }), { language: 'zh-TW', resolveImage, fontAssets: await fontAssets() });
  const nodes = JSON.stringify(definition.content);
  assert.match(nodes, /"image":"data:image\/png;base64,/);
  assert.match(nodes, /遺失的圖/);
});
