import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';

import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { generateFileBlob } from '../../src/app/ui/files/file-generators.js';
import { getFileAuthoringGuidance } from '../../src/app/ui/files/file-authoring-guidance.js';
import { enforceDocumentTemplate } from '../../src/app/ui/files/design/deck-template-enforcer.js';
import { buildDocumentTheme, DOCUMENT_DESIGN_KEYS, normalizeDocumentDesign } from '../../src/app/ui/files/design/document-design.js';
import { DOCUMENT_PRESET_IDS, DOCUMENT_PRESETS, getDocumentPresetText } from '../../src/app/ui/files/design/document-presets.js';
import { renderDocumentThumbnail } from '../../src/app/ui/files/design/document-thumbnail.js';
import { parseFrontMatter } from '../../src/app/ui/files/generators/document-model.js';
import { createFontSubsetter, embedFontsInDocument, obfuscateFont, prepareEmbeddedFamilies, readFontInfo } from '../../src/app/ui/files/generators/font-embedding.js';
import { FONT_FAMILIES, fontSource } from '../../src/app/ui/files/design/fonts.js';
import { generateDocxFile } from '../../src/app/ui/files/generators/docx-file.js';
import { prepareDocxPackage } from '../../src/app/ui/files/previews/docx-page-preview.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];
const FENCE = '`'.repeat(4);
const FONT_DIRECTORY = new URL('../../src/assets/fonts/', import.meta.url);
const SUBSETTER_WASM = new URL('../../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url);
const fontAssets = async () => {
  const subsetter = await createFontSubsetter(fs.readFileSync(SUBSETTER_WASM));
  return {
    loadFontFile: async (file) => new Uint8Array(fs.readFileSync(new URL(file, FONT_DIRECTORY))),
    loadSubsetter: async () => subsetter
  };
};

const SAMPLE = `## 一、摘要

本季營收達 **2,630 萬元**，年增 7.3%。

### 主要發現

- 企業客戶成長 18%

| 市場 | 營收 |
|:--|--:|
| 台灣 | 1,200 |

## 二、下一步

第四季集中資源。`;

const documentWith = (front, body = SAMPLE) => `---\ntitle: 第三季營運報告\nsubtitle: 亞太市場帶動成長\nauthor: Noureon\n${front}\n---\n\n${body}`;

async function generate(content, context = {}) {
  const descriptor = describeFileBlock({ name: '報告.docx', content, complete: true });
  const blob = await generateFileBlob(descriptor, { language: 'zh-TW', ...context });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const read = (path) => zip.file(path)?.async('string');
  return { blob, zip, read, document: await read('word/document.xml'), styles: await read('word/styles.xml') };
}

test('every Word template is a complete design with texts in five languages', () => {
  assert.equal(DOCUMENT_PRESET_IDS.length, 9);
  for (const id of DOCUMENT_PRESET_IDS) {
    const { params, reference } = DOCUMENT_PRESETS[id];
    assert.ok(reference, `${id} names the vendor design it follows`);
    assert.deepEqual(Object.keys(params).sort(), [...DOCUMENT_DESIGN_KEYS].sort(), id);
    assert.deepEqual({ ...normalizeDocumentDesign({ template: id }).design }, { ...params }, `${id} normalises to itself`);
    for (const language of LANGUAGES) {
      const text = getDocumentPresetText(id, language);
      assert.ok(text.name && text.feature && text.fit, `${id} ${language}`);
    }
  }
});

test('front matter names a design by template or parameters; none keeps the original look', () => {
  assert.equal(parseFrontMatter('---\ntitle: x\ntoc: true\n---\nBody').meta.design, null);
  const templated = parseFrontMatter('---\ntitle: x\ntemplate: Lines\naccent: "#123456"\n---\n').meta.design;
  assert.equal(templated.preset, 'lines');
  assert.equal(templated.design.accent, '#123456');
  assert.equal(templated.design.headings, 'rule', 'other keys come from the template');
  const adaptive = normalizeDocumentDesign({ fonts: 'serif', headings: 'underline', cover: 'fullpage', 'line-spacing': 'double', bodySize: 30, tables: 'nope' });
  assert.equal(adaptive.preset, null);
  assert.equal(adaptive.design.fonts, 'book');
  assert.equal(adaptive.design.headings, 'rule');
  assert.equal(adaptive.design.cover, 'page');
  assert.equal(adaptive.design.lineSpacing, 2);
  assert.equal(adaptive.design.bodySize, 14, 'numbers are clamped');
  assert.deepEqual(adaptive.issues.map((issue) => issue.key), ['tables']);
});

test('line spacing means the same height whatever the body font', () => {
  const design = (fonts) => ({ ...DOCUMENT_PRESETS.lines.params, fonts, lineSpacing: 1.5 });
  // Word's single line: Inter 1.2 em, Source Sans 3 1.4 em, Noto Sans TC 1.9 em.
  const inter = buildDocumentTheme(design('modern'), { content: 'English only', language: 'en' }).spacing.line;
  const chinese = buildDocumentTheme(design('modern'), { content: '中文內容', language: 'zh-TW' }).spacing.line;
  assert.equal(inter, 360);
  assert.ok(Math.abs(chinese * 1.9 - 1.5 * 1.2 * 240) <= 2, 'Chinese text is corrected for its taller single line');
  assert.equal(buildDocumentTheme({ ...DOCUMENT_PRESETS.standard.params }, { content: '中文', language: 'zh-TW' }).spacing.line, 276, 'installed fonts keep Word\'s own 1.15');
});

test('documents without a design are exactly as before', async () => {
  const { document, styles } = await generate('---\ntitle: 報告\n---\n\n## 一\n\n內容');
  assert.match(styles, /w:ascii="Calibri"/);
  assert.match(styles, /w:color w:val="17365D"/);
  assert.equal((document.match(/<w:sectPr/g) || []).length, 1, 'no cover section');
});

test('every template produces a valid document in its own fonts, colours and treatments', async () => {
  // Malformed XML throws, so a template that writes broken markup fails here.
  const parser = new DOMParser({ onError: (level, message) => { if (level !== 'warning') throw new Error(message); } });
  for (const id of DOCUMENT_PRESET_IDS) {
    const { document, styles, read } = await generate(documentWith(`template: ${id}`));
    for (const [name, xml] of [['document', document], ['styles', styles], ['numbering', await read('word/numbering.xml')]]) {
      assert.equal(parser.parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length, 0, `${id} ${name}.xml parses`);
    }
    const params = DOCUMENT_PRESETS[id].params;
    const pageCover = ['page', 'band', 'shapes', 'title'].includes(params.cover);
    assert.equal((document.match(/<w:sectPr/g) || []).length, pageCover ? 2 : 1, `${id} cover section`);
    if (pageCover) assert.match(document, /<w:pgNumType w:start="1"\/>/, `${id} numbers pages after the cover from 1`);
    if (params.fonts !== 'office') assert.doesNotMatch(styles, /Calibri/, `${id} uses its own fonts`);
  }
});

test('heading treatments follow the top level the document uses (## sections)', async () => {
  const lines = await generate(documentWith('template: lines'));
  // Heading2 is the top level here, so it gets the rule and the main size.
  const heading2 = /<w:style w:type="paragraph" w:styleId="Heading2">[\s\S]*?<\/w:style>/.exec(lines.styles)[0];
  assert.match(heading2, /<w:pBdr><w:bottom /);
  const academic = await generate(documentWith('template: academic'));
  const apaHeading = /<w:style w:type="paragraph" w:styleId="Heading2">[\s\S]*?<\/w:style>/.exec(academic.styles)[0];
  assert.match(apaHeading, /<w:jc w:val="center"\/>/, 'APA centres the top level');
  assert.match(academic.document, /<w:ind w:firstLine="720"\/>/, 'APA indents paragraphs');
  assert.match(await academic.read('word/header1.xml') || await academic.read('word/header2.xml'), /PAGE/, 'APA numbers pages at the top');
});

test('fonts are embedded as obfuscated subsets Word can load', async () => {
  const assets = await fontAssets();
  const content = documentWith('template: spearmint');
  const descriptor = describeFileBlock({ name: '報告.docx', content, complete: true });
  const blob = await generateDocxFile(descriptor, { language: 'zh-TW', fontAssets: assets });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const table = await zip.file('word/fontTable.xml').async('string');
  const relationships = await zip.file('word/_rels/fontTable.xml.rels').async('string');
  const settings = await zip.file('word/settings.xml').async('string');
  assert.match(table, /<w:font w:name="Inter"><w:charset w:val="00"\/>[\s\S]*?<w:embedRegular r:id="rIdFont\d+" w:fontKey="\{[0-9A-F-]{36}\}"\/><w:embedBold /);
  assert.match(table, /<w:font w:name="Noto Sans TC"><w:charset w:val="88"\/>/);
  const ids = [...table.matchAll(/r:id="([^"]+)" w:fontKey="\{([^}]+)\}"/g)];
  assert.ok(ids.length >= 4);
  for (const [, id, key] of ids) {
    const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(relationships)?.[1];
    assert.ok(target, `${id} has a relationship`);
    const restored = obfuscateFont(await zip.file(`word/${target}`).async('uint8array'), key);
    assert.equal(readFontInfo(restored).family.length > 0, true, `${target} restores to a TrueType font`);
  }
  assert.match(settings, /<w:displayBackgroundShape\/><w:embedTrueTypeFonts\/><w:saveSubsetFonts\/>/);
  assert.ok(blob.documentFonts.some((font) => font.typeface === 'Noto Sans TC' && font.eastAsian), 'the preview gets the same subsets');
  assert.equal(blob.documentLayout.cover, null);
  const band = await generateDocxFile(describeFileBlock({ name: 'b.docx', content: documentWith('template: technical'), complete: true }), { fontAssets: assets });
  assert.equal(band.documentLayout.cover.align, 'top');
});

test('embedding writes nothing for fonts Word already has or that forbid it', async () => {
  const zip = new JSZip();
  zip.file('word/fontTable.xml', '<?xml version="1.0"?><w:fonts xmlns:w="w" xmlns:r="r"/>');
  zip.file('word/_rels/fontTable.xml.rels', '<?xml version="1.0"?><Relationships xmlns="x"/>');
  zip.file('word/settings.xml', '<w:settings xmlns:w="w"></w:settings>');
  zip.file('[Content_Types].xml', '<Types xmlns="t"></Types>');
  const assets = await fontAssets();
  const families = await prepareEmbeddedFamilies([{ family: 'Inter', typeface: 'Inter', slot: 'regular', weight: 400, script: 'latin' }], {
    textByTypeface: new Map([['Inter', 'Hi']]), loadFontFile: assets.loadFontFile, subsetter: await assets.loadSubsetter(), fontSource, familyInfo: (family) => FONT_FAMILIES[family]
  });
  assert.deepEqual(await embedFontsInDocument(zip, families, { guid: () => '00000000-0000-0000-0000-000000000001' }), ['Inter']);
  assert.match(await zip.file('word/_rels/fontTable.xml.rels').async('string'), /<Relationship Id="rIdFont1" [^>]*Target="fonts\/font1.odttf"\/><\/Relationships>/, 'a self-closing list is opened');
  assert.match(await zip.file('[Content_Types].xml').async('string'), /Extension="odttf"/);
  assert.match(await zip.file('word/settings.xml').async('string'), /<w:settings xmlns:w="w"><w:embedTrueTypeFonts\/>/);
  assert.deepEqual(await embedFontsInDocument(new JSZip().file('word/fontTable.xml', '<w:fonts/>').file('word/settings.xml', '<w:settings/>').file('[Content_Types].xml', '<Types></Types>'), []), []);
});

test('a chosen Word template is enforced; only accent colours survive', async () => {
  const reply = `好的\n${FENCE}file 報告.docx\n---\ntitle: 報告\ntoc: true\nfonts: kai\ncover: band\naccent: "#2F6B4F"\n---\n\n## 一\n\n內容\n${FENCE}\n完成。`;
  const out = enforceDocumentTemplate(reply, 'academic');
  assert.match(out, /---\ntitle: 報告\ntoc: true\ntemplate: academic\naccent: #2F6B4F\n---\n\n## 一/);
  assert.doesNotMatch(out, /fonts: kai|cover: band/);
  assert.ok(out.endsWith('\n完成。'));
  assert.equal(enforceDocumentTemplate('沒有檔案', 'academic'), '沒有檔案');
  const plain = enforceDocumentTemplate(`${FENCE}file a.docx\n# 標題\n\n內容\n${FENCE}`, 'lines');
  assert.match(plain, /---\ntemplate: lines\n---\n# 標題/, 'a document without front matter gets one');

  const { finalizeAssistantResponse } = await import('../../src/app/legacy-runtime/features/assistant-response-finalization.js');
  const message = {};
  await finalizeAssistantResponse({
    fullResponse: reply,
    finalAiMessage: message,
    conversation: { messages: [], documentDesign: 'academic' },
    signal: { aborted: true },
    responseUsesCouncil: false,
    responseRenderedInRealtime: true,
    targetElement: { dataset: {}, closest: () => null },
    uiLanguage: 'zh-TW',
    persistAppData: async () => {},
    completeSingleModelView: async () => {},
    queueBackgroundTask: () => {}
  });
  assert.match(message.parts[0].text, /template: academic/);
});

test('Word guidance lists every document parameter, or names the chosen template', async () => {
  const adaptive = await getFileAuthoringGuidance();
  const wordPart = adaptive.slice(adaptive.indexOf('## Word documents'), adaptive.indexOf('## PowerPoint'));
  for (const key of DOCUMENT_DESIGN_KEYS) assert.match(wordPart, new RegExp(`- ${key}:`), key);
  const chosen = await getFileAuthoringGuidance({ documentDesign: 'monochrome' });
  const chosenPart = chosen.slice(chosen.indexOf('## Word documents'), chosen.indexOf('## PowerPoint'));
  assert.match(chosenPart, /the user chose the "monochrome" document template for Word and PDF/);
  assert.match(chosenPart, /"template: monochrome"/);
  assert.doesNotMatch(chosenPart, /- headings:/);
  assert.equal(await getFileAuthoringGuidance({ documentDesign: 'nope' }), adaptive);
});

test('each template draws a thumbnail of its first page', () => {
  const { document, cleanup } = createDom('<div></div>');
  try {
    for (const id of DOCUMENT_PRESET_IDS) {
      for (const language of ['zh-TW', 'en']) {
        const svg = renderDocumentThumbnail(document, DOCUMENT_PRESETS[id].params, {
          language, text: { title: language === 'en' ? 'Our year and what comes next' : '年度成果與下一步', subtitle: 's', kicker: 'k', heading: 'h', author: 'a' }
        });
        assert.equal(svg.getAttribute('viewBox'), '0 0 210 297', id);
        assert.ok(svg.querySelectorAll('text').length >= 3, `${id} shows its title and texts`);
      }
    }
  } finally {
    cleanup();
  }
});

test('the preview draws embedded fonts under their own names', async () => {
  const { document, cleanup } = createDom('');
  try {
    const { blob } = await generate(documentWith('template: lines'));
    const prepared = await prepareDocxPackage(await blob.arrayBuffer(), { window: { DOMParser, XMLSerializer }, document, fontAliases: new Map([['Inter', 'Noureon Doc 1 Inter']]) });
    const styles = await (await JSZip.loadAsync(prepared.data)).file('word/styles.xml').async('string');
    assert.match(styles, /w:ascii="Noureon Doc 1 Inter"/);
    assert.doesNotMatch(styles, /w:ascii="Inter"/);
  } finally {
    cleanup();
  }
});
