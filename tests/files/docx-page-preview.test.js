import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';

import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { openFilePreview } from '../../src/app/ui/files/file-preview-dialog.js';
import { generateFileBlob } from '../../src/app/ui/files/file-generators.js';
import { prepareDocxPackage, rewriteLineHeights, splitInlineContent } from '../../src/app/ui/files/previews/docx-page-preview.js';
import { convertOmmlToMathml } from '../../src/app/ui/files/previews/omml-to-mathml.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const PAGE = '\uE000PAGE\uE001';
const TOTAL = '\uE000NUMPAGES\uE001';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
// The XML DOM parses package parts; happy-dom supplies the HTML document the
// MathML is built in, exactly as the browser splits the two.
const xmlWindow = { DOMParser, XMLSerializer };

const toMarkup = (node) => node.outerHTML.replace(/ xmlns="[^"]+"/g, '');

const convert = (omml, options = {}) => {
  const { document, cleanup } = createDom();
  try {
    const xml = new DOMParser().parseFromString(`<m:oMath xmlns:m="${M}" xmlns:w="${W}">${omml}</m:oMath>`, 'application/xml');
    return toMarkup(convertOmmlToMathml(xml.documentElement, { document, ...options }));
  } finally {
    cleanup();
  }
};

const run = (text, style = '') => `<m:r>${style ? `<m:rPr><m:sty m:val="${style}"/></m:rPr>` : ''}<m:t>${text}</m:t></m:r>`;

test('equations docx-preview cannot draw are converted to complete MathML', () => {
  // x_i^2: a combined sub/superscript, dropped entirely by docx-preview.
  assert.equal(
    convert(`<m:sSubSup><m:e>${run('x')}</m:e><m:sub>${run('i')}</m:sub><m:sup>${run('2')}</m:sup></m:sSubSup>`),
    '<math><msubsup><mi>x</mi><mi>i</mi><mn>2</mn></msubsup></math>'
  );
  // \hat{y}: an accent, also dropped by docx-preview.
  assert.equal(
    convert(`<m:acc><m:accPr><m:chr m:val="\u0302"/></m:accPr><m:e>${run('y')}</m:e></m:acc>`),
    '<math><mover accent="true"><mi>y</mi><mo stretchy="true">^</mo></mover></math>'
  );
  // Brackets without m:dPr, which make docx-preview throw.
  assert.equal(
    convert(`<m:d><m:e>${run('a')}</m:e></m:d>`),
    '<math><mrow><mo fence="true" stretchy="true">(</mo><mi>a</mi><mo fence="true" stretchy="true">)</mo></mrow></math>'
  );
});

test('operators, function names, fractions and large operators follow Word typesetting', () => {
  assert.equal(
    convert(`${run('sin ', 'p')}${run('x-1')}`),
    '<math><mrow><mi mathvariant="normal">sin</mi><mspace width="0.1667em"></mspace><mi>x</mi><mo>\u2212</mo><mn>1</mn></mrow></math>'
  );
  assert.match(convert(`<m:f><m:num>${run('a')}</m:num><m:den>${run('b')}</m:den></m:f>`), /<mfrac><mi>a<\/mi><mi>b<\/mi><\/mfrac>/);
  const sum = convert(`<m:nary><m:naryPr><m:chr m:val="\u2211"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub>${run('i')}</m:sub><m:sup>${run('n')}</m:sup><m:e>${run('x')}</m:e></m:nary>`);
  assert.match(sum, /<munderover><mo largeop="true" movablelimits="false">\u2211<\/mo><mi>i<\/mi><mi>n<\/mi><\/munderover>/);
  assert.match(convert(`<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${run('x')}</m:e></m:rad>`), /<msqrt><mi>x<\/mi><\/msqrt>/);
  assert.match(convert(`<m:m><m:mr><m:e>${run('a')}</m:e><m:e>${run('b')}</m:e></m:mr></m:m>`), /<mtable><mtr><mtd><mi>a<\/mi><\/mtd><mtd><mi>b<\/mi><\/mtd><\/mtr><\/mtable>/);
  assert.match(convert(run('\u4E2D\u6587')), /<mtext>\u4E2D\u6587<\/mtext>/, 'CJK text stays text');
  assert.match(convert(`<m:unknownThing>${run('z')}</m:unknownThing>`), /<mi>z<\/mi>/, 'unknown containers keep their content');
  assert.match(convert(run('x'), { display: true }), /^<math display="block">/);
});

const generateDocx = async (content) => {
  const descriptor = describeFileBlock({ name: 'report.docx', content, complete: true });
  return generateFileBlob(descriptor, { language: 'en' });
};

test('a generated document is prepared for preview: equations, page fields and header rows', async () => {
  const blob = await generateDocx([
    '---',
    'footer: Confidential',
    '---',
    'Growth is $x_i^2$ and',
    '',
    '$$\\hat{y} = \\frac{a}{b}$$',
    '',
    '| Region | Revenue |',
    '| --- | ---: |',
    '| North | 1 |'
  ].join('\n'));
  const { document, cleanup } = createDom();
  try {
    const prepared = await prepareDocxPackage(await blob.arrayBuffer(), { window: xmlWindow, document });
    assert.equal(prepared.equations.length, 2);
    const display = prepared.equations.find((equation) => equation.getAttribute('display') === 'block');
    const inline = prepared.equations.find((equation) => equation !== display);
    assert.match(toMarkup(inline), /<msubsup>/);
    assert.match(toMarkup(display), /<mover accent="true">[\s\S]*<mfrac>/);
    assert.deepEqual(prepared.headerRows, [1], 'the table repeats its first row');

    const zip = await JSZip.loadAsync(prepared.data);
    const body = await zip.file('word/document.xml').async('string');
    assert.doesNotMatch(body, /<m:oMath/, 'no OMML is left for docx-preview to trip over');
    assert.ok(body.includes('\uE000MATH0\uE001') && body.includes('\uE000MATH1\uE001'));
    const footerName = Object.keys(zip.files).find((name) => /^word\/footer\d*\.xml$/.test(name));
    const footer = await zip.file(footerName).async('string');
    assert.ok(footer.includes(PAGE) && footer.includes(TOTAL), 'page fields become placeholders');
    assert.doesNotMatch(footer, /fldChar|instrText/);
    assert.match(footer, /<w:rPr>[\s\S]*<\/w:rPr><w:t xml:space="preserve">\uE000PAGE\uE001<\/w:t>/, 'the field keeps its formatting');
  } finally {
    cleanup();
  }
});

test('page fields spanning several runs and simple fields are both replaced; other fields keep their result', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>
    <w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>9</w:t></w:r></w:fldSimple></w:p>
    <w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>DATE</w:instrText><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2026-09-26</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
  </w:body></w:document>`);
  const { document, cleanup } = createDom();
  try {
    const prepared = await prepareDocxPackage(await zip.generateAsync({ type: 'arraybuffer' }), { window: xmlWindow, document });
    const body = await (await JSZip.loadAsync(prepared.data)).file('word/document.xml').async('string');
    const text = [...new DOMParser().parseFromString(body, 'application/xml').getElementsByTagNameNS(W, 't')].map((node) => node.textContent);
    assert.deepEqual(text, [PAGE, ' of ', TOTAL, '2026-09-26']);
    assert.match(body, /DATE/, 'a date field is left for its cached result');
  } finally {
    cleanup();
  }
});

test('line spacing without a rule is read as Word does: a multiple of the font height', async () => {
  const zip = new JSZip();
  zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles xmlns:w="${W}"><w:docDefaults><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="300"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:styleId="Exact"><w:pPr><w:spacing w:line="240" w:lineRule="exact"/></w:pPr></w:style></w:styles>`);
  const { document, cleanup } = createDom();
  try {
    const prepared = await prepareDocxPackage(await zip.generateAsync({ type: 'arraybuffer' }), { window: xmlWindow, document });
    const styles = await (await JSZip.loadAsync(prepared.data)).file('word/styles.xml').async('string');
    assert.match(styles, /w:line="300" w:lineRule="auto"/);
    assert.match(styles, /w:line="240" w:lineRule="exact"/, 'an explicit rule is kept');
  } finally {
    cleanup();
  }
  assert.equal(
    rewriteLineHeights('.a { line-height: 1.25; color: red } .b { line-height: 15pt; }'),
    '.a { --noureon-line: 1.25; color: red } .b { line-height: 15pt; --noureon-line: none; }'
  );
});

test('a paragraph splits between lines without losing text or its inline formatting', () => {
  const { document, cleanup } = createDom('<p id="p" class="doc-num-1-0"><span class="run"><b id="bookmark">bold text</b> and more</span><span>tail</span></p>');
  try {
    const paragraph = document.getElementById('p');
    const bold = paragraph.querySelector('b').firstChild;
    const continuation = splitInlineContent(paragraph, bold, 5);
    assert.equal(paragraph.innerHTML, '<span class="run"><b id="bookmark">bold </b></span>');
    assert.equal(continuation.innerHTML, '<span class="run"><b>text</b> and more</span><span>tail</span>');
    assert.equal(paragraph.textContent + continuation.textContent, 'bold text and moretail');
  } finally {
    cleanup();
  }
});

const wordDescriptor = { id: 'doc1', name: 'report.docx', extension: 'docx', family: 'word', state: 'ready', content: '# Title\n\nBody text' };

const openWordPreview = (document, window, overrides = {}) => openFilePreview({
  document,
  window,
  descriptor: wordDescriptor,
  language: 'en',
  loadBlob: async () => new window.Blob(['docx']),
  ...overrides
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('Word files open in page view and can switch to their source', async () => {
  const { document, window, cleanup } = createDom();
  try {
    let disposed = 0;
    const dialog = openWordPreview(document, window, {
      pageRenderers: {
        word: async () => async (blob, host) => {
          host.textContent = `pages for ${await blob.text()}`;
          return { pageCount: 3, dispose: () => { disposed += 1; } };
        }
      }
    });
    const views = [...dialog.querySelectorAll('[data-preview-view]')];
    assert.deepEqual(views.map((button) => button.textContent), ['Page view', 'Source']);
    assert.equal(views[0].getAttribute('aria-pressed'), 'true');
    assert.match(dialog.querySelector('.ac-file-preview-status').textContent, /Preparing preview/);

    await flush();
    await flush();
    assert.equal(dialog.querySelector('.ac-file-preview-canvas').textContent, 'pages for docx');
    assert.equal(dialog.querySelector('.ac-file-preview-page-info').textContent, '3 pages');
    assert.equal(dialog.querySelector('.ac-file-preview-status'), null);
    assert.match(dialog.querySelector('.ac-file-preview-pages .ac-file-preview-note').textContent, /fonts on this device/);

    views[1].click();
    assert.equal(dialog.querySelector('.ac-file-preview-pages').hidden, true);
    assert.match(dialog.querySelector('.ac-file-preview-source').textContent, /# Title\n\nBody text/);
    assert.equal(views[1].getAttribute('aria-pressed'), 'true');

    dialog.querySelector('.ac-file-preview-close').click();
    assert.equal(disposed, 1, 'closing releases the rendered pages');
  } finally {
    cleanup();
  }
});

test('a failed page view explains why and falls back to the document text', async () => {
  const { document, window, cleanup } = createDom();
  try {
    const dialog = openWordPreview(document, window, {
      renderMarkdown: (text) => `<p class="md">${text.replace(/^# /, '')}</p>`,
      pageRenderers: { word: async () => async () => { throw new Error('broken table'); } }
    });
    await flush();
    await flush();
    const pane = dialog.querySelector('.ac-file-preview-pages');
    assert.match(pane.querySelector('.ac-file-preview-note').textContent, /could not be shown \(broken table\)/);
    assert.match(pane.querySelector('.md').textContent, /Title/);
  } finally {
    cleanup();
  }
});

test('files without a page renderer, or not ready, keep the single text preview', () => {
  const { document, window, cleanup } = createDom();
  try {
    const markdown = openFilePreview({
      document,
      window,
      descriptor: { ...wordDescriptor, id: 'md1', name: 'notes.md', extension: 'md', family: 'markdown' },
      language: 'en',
      loadBlob: async () => new window.Blob(['x'])
    });
    assert.equal(markdown.querySelector('.ac-file-preview-toolbar'), null);
    markdown.querySelector('.ac-file-preview-close').click();

    const incomplete = openWordPreview(document, window, { descriptor: { ...wordDescriptor, state: 'incomplete' } });
    assert.equal(incomplete.querySelector('.ac-file-preview-toolbar'), null);
  } finally {
    cleanup();
  }
});
