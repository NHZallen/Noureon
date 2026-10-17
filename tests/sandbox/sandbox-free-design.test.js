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
  assert.match(free, /Make a file only when the user asks for one/);
  assert.match(free, /Never turn an ordinary request into a file on your own/);
  assert.match(free, /Writing \(stories, essays, letters, summaries, explanations, code\) is answered in the chat as text/);
  assert.match(free, /Do not run code for ordinary conversation, writing/);
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

const NOTES_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster';
const makeDeck = async ({ listed = false, notes = true } = {}) => {
  const zip = new JSZip();
  const list = listed ? '<p:notesMasterIdLst><p:notesMasterId r:id="rId8"/></p:notesMasterIdLst>' : '';
  zip.file('ppt/presentation.xml', `<?xml version='1.0'?><p:presentation xmlns:a="a" xmlns:r="r" xmlns:p="p"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${list}<p:sldIdLst><p:sldId id="256" r:id="rId7"/></p:sldIdLst></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<Relationships><Relationship Id="rId1" Type="x/slideMaster" Target="slideMasters/slideMaster1.xml"/>${notes ? `<Relationship Id="rId8" Type="${NOTES_RELATIONSHIP}" Target="notesMasters/notesMaster1.xml"/>` : ''}</Relationships>`);
  return zip.generateAsync({ type: 'uint8array' });
};

test('a PowerPoint file from Python gets its notes master listed, which the iPhone preview needs', async () => {
  const { listNotesMaster, embedOfficeFonts } = await import('../../src/app/ui/sandbox/office-fonts.js');
  const zip = await JSZip.loadAsync(await makeDeck());
  assert.equal(await listNotesMaster(zip), true);
  const xml = await zip.file('ppt/presentation.xml').async('string');
  assert.match(xml, /<\/p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId8"\/><\/p:notesMasterIdLst><p:sldIdLst>/, 'in the schema order, after the slide master list');
  assert.equal(await listNotesMaster(zip), false, 'done once');

  assert.equal(await embedOfficeFonts(await makeDeck({ listed: true }), 'pptx', { JSZip }), null, 'already listed: nothing to change');
  assert.equal(await embedOfficeFonts(await makeDeck({ notes: false }), 'pptx', { JSZip }), null, 'no notes master: nothing to change');
  assert.equal(await embedOfficeFonts(await makeDeck(), 'docx', { JSZip }), null, 'only PowerPoint files');

  // Without the font tools (not loaded) the repair is still made.
  const repaired = await embedOfficeFonts(await makeDeck(), 'pptx', { JSZip });
  assert.match(await (await JSZip.loadAsync(repaired)).file('ppt/presentation.xml').async('string'), /<p:notesMasterId r:id="rId8"\/>/);
});

test('a run keeps repairing its PowerPoint files when the font tools cannot be loaded', async () => {
  const run = { steps: [{ files: [{ name: 'deck.pptx', size: 1 }], outputs: [{ name: 'deck.pptx', bytes: await makeDeck() }] }] };
  await embedFontsInRunOutputs(run, { loadArchive: async () => JSZip, loadAssets: async () => { throw new Error('no fonts here'); }, loadEmbedding: async () => { throw new Error('no fonts here'); } });
  const xml = await (await JSZip.loadAsync(run.steps[0].outputs[0].bytes)).file('ppt/presentation.xml').async('string');
  assert.match(xml, /<p:notesMasterIdLst>/);
  assert.ok(run.steps[0].files[0].size > 1, 'the listed size follows');
});
