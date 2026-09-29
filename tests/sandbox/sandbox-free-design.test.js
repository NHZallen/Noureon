import assert from 'node:assert/strict';
import test from 'node:test';

import JSZip from 'jszip';

import { getSandboxGuidance } from '../../src/app/runtime/sandbox/sandbox-guidance.js';
import { SANDBOX_FONTS } from '../../src/app/runtime/sandbox/sandbox-fonts.js';
import { FONT_FAMILIES } from '../../src/app/ui/files/design/fonts.js';
import { embedFontsInRunOutputs, scanOfficeFonts } from '../../src/app/ui/sandbox/office-fonts.js';

test('Advanced mode designs Office files freely unless a template was chosen', () => {
  const free = getSandboxGuidance({ designs: { deck: 'auto', document: 'auto' } });
  assert.match(free, /full freedom over layout/);
  assert.match(free, /do not write them as ````file blocks/);
  assert.doesNotMatch(free, /noureon\.save_document/);
  assert.match(free, /noureon\.use_fonts/);
  assert.match(free, /\/fonts\/NotoSansTC-Bold\.ttf/);
  assert.match(free, /reportlab/);

  const deck = getSandboxGuidance({ designs: { deck: 'minimal', document: 'auto' } });
  assert.match(deck, /PowerPoint files: the user chose the "minimal" template[^\n]*noureon\.save_document\("簡報\.pptx"/);
  assert.doesNotMatch(deck, /Word and PDF files: the user chose/);
  const both = getSandboxGuidance({ designs: { deck: 'minimal', document: 'report' } });
  assert.match(both, /Word and PDF files: the user chose the "report" template/);
});

test('the sandbox fonts are app families, and each can be embedded in Office files', () => {
  for (const font of SANDBOX_FONTS) {
    assert.ok(FONT_FAMILIES[font.family]?.files, font.family);
  }
  assert.equal(SANDBOX_FONTS.length * 2, 12, 'regular and bold fit the twelve fonts the sandbox takes');
});

test('a Word or PowerPoint file is scanned for the embeddable fonts it names, its text and bold', async () => {
  const docx = new JSZip();
  docx.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Inter" w:eastAsia="noto sans tc"/><w:b/></w:rPr><w:t>營收 &amp; 成本</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Calibri"/></w:rPr><w:t xml:space="preserve"> Q1</w:t></w:r></w:p></w:body></w:document>');
  docx.file('word/styles.xml', '<w:styles><w:style><w:rPr><w:rFonts w:eastAsia="Microsoft JhengHei"/></w:rPr></w:style></w:styles>');
  docx.file('word/media/image1.xml', '<w:t>ignored</w:t>');
  const word = await scanOfficeFonts(docx, 'docx');
  assert.deepEqual(word.families.sort(), ['Inter', 'Noto Sans TC'], 'installed fonts are left to the computer');
  assert.equal(word.text, '營收 & 成本 Q1');
  assert.equal(word.bold, true);

  const pptx = new JSZip();
  pptx.file('ppt/slides/slide1.xml', '<p:sld><a:r><a:rPr lang="zh-TW"><a:latin typeface="Inter"/><a:ea typeface="Noto Serif TC"/></a:rPr><a:t>標題</a:t></a:r></p:sld>');
  pptx.file('ppt/theme/theme1.xml', '<a:theme><a:latin typeface="+mn-lt"/></a:theme>');
  const deck = await scanOfficeFonts(pptx, 'pptx');
  assert.deepEqual(deck.families.sort(), ['Inter', 'Noto Serif TC']);
  assert.equal(deck.text, '標題');
  assert.equal(deck.bold, false);
});

test('only freely made Word and PowerPoint files are embedded, and a failure keeps the file', async () => {
  const run = {
    steps: [{
      files: [{ name: 'a.docx', size: 1 }, { name: 'b.pptx', size: 1 }],
      outputs: [
        { name: 'a.docx', bytes: new Uint8Array([1]) },
        { name: 'b.pptx', bytes: new Uint8Array([2]) },
        { name: '.noureon/c.docx', bytes: new Uint8Array([3]) },
        { name: 'd.png', bytes: new Uint8Array([4]) }
      ]
    }]
  };
  const seen = [];
  const JSZipStub = {
    loadAsync: async (bytes) => {
      seen.push(bytes[0]);
      if (bytes[0] === 2) throw new Error('not a zip');
      return { files: {}, file: () => null };
    }
  };
  await embedFontsInRunOutputs(run, { loadArchive: async () => JSZipStub, loadAssets: async () => ({}), loadEmbedding: async () => ({}) });
  assert.deepEqual(seen, [1, 2], 'handed documents and pictures are skipped');
  assert.deepEqual([...run.steps[0].outputs[1].bytes], [2], 'the file is kept when embedding fails');
});
