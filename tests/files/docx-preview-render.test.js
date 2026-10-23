import assert from 'node:assert/strict';
import test from 'node:test';

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';

import { describeFileBlock } from '../../src/app/ui/files/file-block-model.js';
import { generateFileBlob } from '../../src/app/ui/files/file-generators.js';
import { renderDocxPreview } from '../../src/app/ui/files/previews/docx-page-preview.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

// renderDocxPreview with the Word-to-HTML step (docx-preview) replaced by a script that writes what that library would, with the layout (heights
// and offsets, which happy-dom does not compute) given by hand. The real library, real fonts and real layout run in Chromium
// (tests/browser/docx-preview.e2e.js). Here: what the preview does to whatever the library hands over.

const TOKEN = (name) => `${name}`;

const minimalDocx = async (documentXml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>') => {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return Object.assign(new Blob([bytes]), {});
};

// A page the way the library draws it: section > header, article, footer; sized by its inline style.
const page = ({ blocks = '', header = '', footer = '', height = 1000, padding = 50 } = {}) => `<section class="noureon-docx" style="min-height:${height}px;padding-top:${padding}px;padding-bottom:${padding}px">${header ? `<header>${header}</header>` : ''}<article>${blocks}</article>${footer ? `<footer>${footer}</footer>` : ''}</section>`;

// Gives elements of the page their layout: [selector, height] for each. An element's top is where the elements before it in its parent end, so it
// follows the element when it is moved to another page.
const layOut = (root, boxes) => {
  const heights = new Map();
  for (const [selector, height] of boxes) {
    const element = root.querySelector(selector);
    assert.ok(element, `no ${selector} to lay out`);
    heights.set(element, height);
    Object.defineProperties(element, {
      offsetHeight: { value: height, configurable: true },
      offsetTop: { configurable: true, get() { let top = 0; for (let node = this.previousElementSibling; node; node = node.previousElementSibling) top += heights.get(node) || 0; return top; } }
    });
  }
};

const setup = () => {
  const dom = createDom();
  const { document, window } = dom;
  const faces = new Set();
  const added = [];
  document.fonts = { ready: Promise.resolve(), add: (face) => { added.push(face); faces.add(face); }, delete: (face) => faces.delete(face) };
  const observers = [];
  const scope = {
    DOMParser, XMLSerializer,
    getComputedStyle: (element) => window.getComputedStyle(element),
    FontFace: class { constructor(name, bytes, options) { this.name = name; this.options = options; } async load() { if (this.name.includes('Broken')) throw new Error('bad font'); } },
    ResizeObserver: class { constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); } observe(element) { this.target = element; } disconnect() { this.disconnected = true; } },
    CSS: { escape: (value) => value }
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { ...dom, scope, host, faces, added, observers };
};

const render = async (env, { html, styles = '', layout, blob, equations } = {}) => {
  const calls = [];
  const renderDocx = async (data, body, styleRoot, options) => {
    calls.push({ data, options });
    body.innerHTML = `<div class="noureon-docx-wrapper">${html}</div>`;
    styleRoot.innerHTML = styles;
    layout?.(body);
    equations?.(body);
  };
  const result = await renderDocxPreview(blob || await minimalDocx(), env.host, { window: env.scope, document: env.document, renderDocx });
  return { result, calls, shadow: env.host.shadowRoot };
};

test('what the library hands over is made safe: no script, no remote resource, no way out of the page', async () => {
  const env = setup();
  try {
    const { shadow } = await render(env, {
      html: page({ blocks: [
        '<p id="p1"><script>alert(1)</script>text <a href="javascript:alert(1)">js</a> <a href="https://example.com/a">web</a> <a href="mailto:a@b.c">mail</a> <a href="#bm1">jump</a> <a href="data:text/html,x">data</a></p>',
        '<p onclick="alert(1)" style="background:url(https://evil.test/x.png);color:red">styled</p>',
        '<p style="background:url(data:image/png;base64,AAAA)">kept</p>',
        '<img src="https://evil.test/x.png" srcset="https://evil.test/x.png 2x"><img src="data:image/png;base64,AAAA"><img src="blob:https://noureon.test/1">',
        '<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"><link rel="stylesheet" href="https://evil.test/x.css"><meta http-equiv="refresh" content="0"><base href="https://evil.test/">',
        '<form action="https://evil.test"><input name="p" type="password"><button formaction="https://evil.test">go</button><textarea></textarea><select></select></form>',
        '<svg><image xlink:href="https://evil.test/x.svg"></image><image xlink:href="data:image/png;base64,AAAA"></image></svg>'
      ].join('') }),
      styles: '<style>.a{background:url(https://evil.test/x.png)} .b{background:url(data:image/png;base64,AAAA)} .c{background:url(#frag)}</style><div id="notstyle">x</div><script>alert(1)</script>'
    });
    const root = shadow;
    assert.equal(root.querySelectorAll('script, iframe, object, embed, link, meta, base, form, input, button, textarea, select').length, 0);
    const links = Object.fromEntries([...root.querySelectorAll('a')].map((link) => [link.textContent, link]));
    assert.equal(links.js.hasAttribute('href'), false, 'a javascript address is dropped');
    assert.equal(links.data.hasAttribute('href'), false, 'a data address is dropped');
    assert.equal(links.web.getAttribute('href'), 'https://example.com/a');
    assert.equal(links.web.target, '_blank');
    assert.match(links.web.rel, /noopener/);
    assert.equal(links.mail.getAttribute('href'), 'mailto:a@b.c');
    assert.equal(links.jump.hasAttribute('href'), false, 'a link inside the document does not navigate the page');
    assert.equal(links.jump.dataset.previewTarget, 'bm1');
    assert.equal(links.jump.getAttribute('role'), 'link');
    assert.equal(root.querySelector('[onclick]'), null);
    const styled = [...root.querySelectorAll('p')].find((p) => p.textContent === 'styled');
    assert.doesNotMatch(styled.getAttribute('style'), /evil\.test/);
    assert.match(styled.getAttribute('style'), /color:\s*red/);
    assert.match([...root.querySelectorAll('p')].find((p) => p.textContent === 'kept').getAttribute('style'), /data:image\/png/);
    const images = [...root.querySelectorAll('img')];
    assert.equal(images.filter((image) => image.hasAttribute('src')).length, 2, 'only data: and blob: pictures stay');
    assert.equal(images.some((image) => image.hasAttribute('srcset')), false);
    const svgImages = [...root.querySelectorAll('image')];
    assert.deepEqual(svgImages.map((image) => image.hasAttribute('xlink:href')), [false, true]);
    const styleText = [...root.querySelectorAll('style')].map((style) => style.textContent).join('\n');
    assert.doesNotMatch(styleText, /evil\.test/);
    assert.match(styleText, /data:image\/png/);
    assert.match(styleText, /#frag/);
    assert.equal(root.querySelector('#notstyle'), null, 'the style holder keeps only styles');
  } finally {
    env.cleanup();
  }
});

test('the library is called with the settings the preview depends on', async () => {
  const env = setup();
  try {
    const { calls } = await render(env, { html: page({ blocks: '<p>x</p>' }) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.className, 'noureon-docx');
    assert.equal(calls[0].options.breakPages, true);
    assert.equal(calls[0].options.experimental, false);
    assert.equal(calls[0].options.ignoreFonts, false);
    assert.equal(calls[0].options.useBase64URL, true);
    assert.ok(calls[0].data instanceof ArrayBuffer);
  } finally {
    env.cleanup();
  }
});

test('page numbers: PAGE and NUMPAGES become the number of the page and the count; a cover page has none and is not counted', async () => {
  const env = setup();
  try {
    const footer = `Page ${TOKEN('PAGE')} of ${TOKEN('NUMPAGES')} (${TOKEN('SECTIONPAGES')})`;
    const { result, shadow } = await render(env, { html: page({ blocks: '<p>a</p>', footer }) + page({ blocks: '<p>b</p>', footer }) + page({ blocks: '<p>c</p>', footer }) });
    assert.equal(result.pageCount, 3);
    assert.deepEqual([...shadow.querySelectorAll('footer')].map((node) => node.textContent), ['Page 1 of 3 (3)', 'Page 2 of 3 (3)', 'Page 3 of 3 (3)']);
  } finally {
    env.cleanup();
  }
  const covered = setup();
  try {
    const footer = `${TOKEN('PAGE')}/${TOKEN('NUMPAGES')}/${TOKEN('SECTIONPAGES')}`;
    const blob = await minimalDocx();
    Object.defineProperty(blob, 'documentLayout', { value: { cover: { align: 'center' } } });
    const { shadow } = await render(covered, { blob, html: page({ blocks: '<p>cover</p>', footer }) + page({ blocks: '<p>b</p>', footer }) + page({ blocks: '<p>c</p>', footer }) });
    assert.deepEqual([...shadow.querySelectorAll('footer')].map((node) => node.textContent), ['0/3/2', '1/3/2', '2/3/2']);
    const cover = shadow.querySelector('section.noureon-docx');
    assert.equal(cover.style.display, 'flex');
    assert.equal(cover.querySelector('article').style.justifyContent, 'center');
  } finally {
    covered.cleanup();
  }
});

test('a cover page can also be aligned to the bottom, and top leaves it alone', async () => {
  for (const [align, expected] of [['bottom', 'flex-end'], ['top', '']]) {
    const env = setup();
    try {
      const blob = await minimalDocx();
      Object.defineProperty(blob, 'documentLayout', { value: { cover: { align } } });
      const { shadow } = await render(env, { blob, html: page({ blocks: '<p>cover</p>' }) });
      assert.equal(shadow.querySelector('article').style.justifyContent, expected);
    } finally {
      env.cleanup();
    }
  }
});

test('pages: content that does not fit moves to a new page after the last block that does, and a heading stays with what follows it', async () => {
  const env = setup();
  try {
    const { result, shadow } = await render(env, {
      html: page({ blocks: '<p id="a">A</p><p id="b">B</p><h1 class="docx-heading1" id="h">H</h1><p id="c">C</p>', footer: `${TOKEN('PAGE')}/${TOKEN('NUMPAGES')}` }),
      layout: (body) => layOut(body, [['#a', 400], ['#b', 400], ['#h', 100], ['#c', 300]])
    });
    // 1000 - 2*50 padding = 900 available (the footer has no height here).
    assert.equal(result.pageCount, 2);
    const pages = [...shadow.querySelectorAll('section.noureon-docx')];
    assert.deepEqual(pages.map((node) => [...node.querySelectorAll('article > *')].map((child) => child.textContent)), [['A', 'B'], ['H', 'C']], 'the heading moved with the paragraph after it');
    assert.deepEqual(pages.map((node) => node.querySelector('footer').textContent), ['1/2', '2/2']);
  } finally {
    env.cleanup();
  }
});

test('pages: one block taller than a page stays where it is; a page that fits is left alone; a page without room is not split', async () => {
  const tall = setup();
  try {
    const { result } = await render(tall, { html: page({ blocks: '<p id="a">A</p>' }), layout: (body) => layOut(body, [['#a', 5000]]) });
    assert.equal(result.pageCount, 1);
  } finally {
    tall.cleanup();
  }
  const fits = setup();
  try {
    const { result } = await render(fits, { html: page({ blocks: '<p id="a">A</p><p id="b">B</p>' }), layout: (body) => layOut(body, [['#a', 100], ['#b', 100]]) });
    assert.equal(result.pageCount, 1);
  } finally {
    fits.cleanup();
  }
  const cramped = setup();
  try {
    const { result } = await render(cramped, { html: page({ blocks: '<p id="a">A</p><p id="b">B</p>', height: 100, padding: 60 }), layout: (body) => layOut(body, [['#a', 100], ['#b', 100]]) });
    assert.equal(result.pageCount, 1, 'no room at all means nothing to split by');
  } finally {
    cramped.cleanup();
  }
  const bare = setup();
  try {
    const { result } = await render(bare, { html: '<section class="noureon-docx" style="min-height:1000px"><p>no article</p></section><section class="noureon-docx"><article><p id="a">A</p></article></section>', layout: () => {} });
    assert.equal(result.pageCount, 2, 'a page without an article or without a height is left as it is');
  } finally {
    bare.cleanup();
  }
});

test('a header and a footer take room from the page and are copied to the pages made from it', async () => {
  const env = setup();
  try {
    const { result, shadow } = await render(env, {
      html: page({ header: '<p id="hd">Header</p>', footer: '<p id="ft">Footer</p>', blocks: '<p id="a">A</p><p id="b">B</p>' }),
      layout: (body) => {
        layOut(body, [['#hd', 100], ['#ft', 100], ['#a', 300], ['#b', 300]]);
        Object.defineProperties(body.querySelector('header'), { offsetHeight: { value: 100 } });
        Object.defineProperties(body.querySelector('footer'), { offsetHeight: { value: 100 } });
      }
    });
    // 1000 - 100 padding - 100 header - 100 footer = 700; B ends at 600, so everything fits.
    assert.equal(result.pageCount, 1);
    const tight = setup();
    try {
      const second = await render(tight, {
        html: page({ header: '<p>Header</p>', footer: '<p>Footer</p>', blocks: '<p id="a">A</p><p id="b">B</p>' }),
        layout: (body) => {
          layOut(body, [['#a', 400], ['#b', 400]]);
          Object.defineProperty(body.querySelector('header'), 'offsetHeight', { value: 150 });
          Object.defineProperty(body.querySelector('footer'), 'offsetHeight', { value: 150 });
        }
      });
      assert.equal(second.result.pageCount, 2);
      const pages = [...second.shadow.querySelectorAll('section.noureon-docx')];
      assert.deepEqual(pages.map((node) => node.querySelector('header')?.textContent), ['Header', 'Header']);
      assert.deepEqual(pages.map((node) => node.querySelector('footer')?.textContent), ['Footer', 'Footer']);
    } finally {
      tight.cleanup();
    }
    assert.ok(shadow);
  } finally {
    env.cleanup();
  }
});

test('a table that runs past the page continues on the next with its header rows repeated; rows past the header go with it', async () => {
  const env = setup();
  try {
    const rows = ['<tr id="r0"><th>Head</th></tr>', '<tr id="r1"><td>one</td></tr>', '<tr id="r2"><td>two</td></tr>', '<tr id="r3"><td>three</td></tr>', '<tr id="r4"><td>four</td></tr>'].join('');
    const { result, shadow } = await render(env, {
      html: page({ blocks: `<table id="t"><colgroup><col></colgroup><tbody>${rows}</tbody></table>` }),
      layout: (body) => {
        layOut(body, [['#t', 1500], ['#r0', 300], ['#r1', 300], ['#r2', 300], ['#r3', 300], ['#r4', 300]]);
        body.querySelector('#t').dataset.previewHeaderRows = '1';
      }
    });
    // 900 available: rows 0 to 2 fit; rows 3 and 4 continue on the next page under a copy of the header.
    assert.equal(result.pageCount, 2);
    const tables = [...shadow.querySelectorAll('table')];
    assert.equal(tables.length, 2);
    assert.deepEqual([...tables[0].rows].map((row) => row.textContent), ['Head', 'one', 'two']);
    assert.deepEqual([...tables[1].rows].map((row) => row.textContent), ['Head', 'three', 'four']);
    assert.equal(tables[1].querySelectorAll('col').length, 1, 'the column widths come along');
  } finally {
    env.cleanup();
  }
});

test('a table of which nothing past the header rows fits moves as a whole', async () => {
  const env = setup();
  try {
    const { result, shadow } = await render(env, {
      html: page({ blocks: '<p id="p">before</p><table id="t"><tbody><tr id="r0"><th>Head</th></tr><tr id="r1"><td>one</td></tr></tbody></table>' }),
      layout: (body) => {
        layOut(body, [['#p', 850], ['#t', 400], ['#r0', 200], ['#r1', 200]]);
        body.querySelector('#t').dataset.previewHeaderRows = '1';
      }
    });
    assert.equal(result.pageCount, 2);
    const pages = [...shadow.querySelectorAll('section.noureon-docx')];
    assert.equal(pages[0].querySelectorAll('table').length, 0);
    assert.equal(pages[1].querySelectorAll('table').length, 1);
  } finally {
    env.cleanup();
  }
});

test('equations: the placeholders the package preparation left become MathML in place', async () => {
  const env = setup();
  try {
    const blob = await generateFileBlob(describeFileBlock({ name: 'e.docx', content: 'Growth is $x_i^2$ and\n\n$$\\hat{y}$$\n', complete: true }), { language: 'en' });
    const { shadow } = await render(env, {
      blob,
      html: page({ blocks: `<p id="a">Growth is ${TOKEN('MATH0')} and</p><p id="b">${TOKEN('MATH1')}</p><p id="c">${TOKEN('MATH9')} none</p>` })
    });
    assert.equal(shadow.querySelectorAll('math').length >= 1, true);
    assert.equal(shadow.textContent.includes(''), false, 'no placeholder is left in the page');
  } finally {
    env.cleanup();
  }
});

test('a link inside the document jumps to its place, by the Enter key too; other clicks do nothing', async () => {
  const env = setup();
  try {
    const { shadow } = await render(env, { html: page({ blocks: '<p><a href="#bm">jump</a> <span>plain</span></p><p id="bm">target</p><p><a name="by-name"></a></p><p><a href="#by-name">jump2</a></p>' }) });
    const scrolled = [];
    shadow.querySelectorAll('p, a').forEach((element) => { element.scrollIntoView = () => scrolled.push(element.id || element.getAttribute('name')); });
    const link = [...shadow.querySelectorAll('a')].find((anchor) => anchor.textContent === 'jump');
    link.dispatchEvent(new env.window.Event('click', { bubbles: true, composed: true, cancelable: true }));
    assert.deepEqual(scrolled, ['bm']);
    shadow.querySelector('span').dispatchEvent(new env.window.Event('click', { bubbles: true, composed: true }));
    assert.equal(scrolled.length, 1);
    const second = [...shadow.querySelectorAll('a')].find((anchor) => anchor.textContent === 'jump2');
    const key = Object.assign(new env.window.Event('keydown', { bubbles: true, composed: true, cancelable: true }), { key: 'Enter' });
    second.dispatchEvent(key);
    assert.deepEqual(scrolled, ['bm', 'by-name']);
    second.dispatchEvent(Object.assign(new env.window.Event('keydown', { bubbles: true, composed: true }), { key: 'a' }));
    assert.equal(scrolled.length, 2);
  } finally {
    env.cleanup();
  }
});

test('the pages shrink to fit the width of where they are shown, follow it when it changes, and let go when disposed', async () => {
  const env = setup();
  try {
    Object.defineProperty(env.host, 'clientWidth', { value: 400, configurable: true });
    const { result, shadow } = await render(env, {
      html: page({ blocks: '<p>x</p>' }),
      layout: (body) => Object.defineProperty(body.querySelector('.noureon-docx-wrapper'), 'offsetWidth', { value: 800, configurable: true })
    });
    const wrapper = shadow.querySelector('.noureon-docx-wrapper');
    assert.equal(wrapper.style.zoom, '0.5');
    assert.equal(env.observers.length, 1);
    assert.equal(env.observers[0].target, env.host);
    Object.defineProperty(env.host, 'clientWidth', { value: 1600, configurable: true });
    env.observers[0].callback();
    assert.equal(wrapper.style.zoom, '1', 'never larger than life');
    result.dispose();
    assert.equal(env.observers[0].disconnected, true);
    assert.equal(shadow.childNodes.length, 0);
  } finally {
    env.cleanup();
  }
});

test('the fonts of a generated document are registered under names of their own, used for the document, and removed when disposed', async () => {
  const env = setup();
  try {
    const blob = await minimalDocx();
    Object.defineProperty(blob, 'documentFonts', { value: [
      { typeface: 'Body', slot: 'regular', bytes: new Uint8Array([1]) },
      { typeface: 'Body', slot: 'bold', bytes: new Uint8Array([2]) },
      { typeface: 'Han', slot: 'regular', bytes: new Uint8Array([3]), eastAsian: true },
      { typeface: 'Broken', slot: 'regular', bytes: new Uint8Array([4]) }
    ] });
    const { result, calls } = await render(env, { blob, html: page({ blocks: '<p>x</p>' }) });
    assert.equal(env.added.length, 3, 'a font that does not load is skipped');
    assert.ok(env.added.every((face) => /^Noureon Doc \d+ /.test(face.name)));
    assert.equal(env.added[1].options.weight, '700');
    assert.equal(calls[0].options.ignoreFonts, true, 'the library\'s own font rules would not apply inside the shadow root');
    result.dispose();
    assert.equal(env.faces.size, 0);
  } finally {
    env.cleanup();
  }
});

test('without font support the preview still draws, with the fonts of the page', async () => {
  const env = setup();
  try {
    delete env.scope.FontFace;
    const blob = await minimalDocx();
    Object.defineProperty(blob, 'documentFonts', { value: [{ typeface: 'Body', slot: 'regular', bytes: new Uint8Array([1]) }] });
    const { result } = await render(env, { blob, html: page({ blocks: '<p>x</p>' }) });
    assert.equal(result.pageCount, 1);
    assert.equal(env.added.length, 0);
  } finally {
    env.cleanup();
  }
});

test('drawing again into the same place replaces the earlier pages', async () => {
  const env = setup();
  try {
    await render(env, { html: page({ blocks: '<p>first</p>' }) });
    const { shadow } = await render(env, { html: page({ blocks: '<p>second</p>' }) });
    assert.equal(shadow.textContent.includes('first'), false);
    assert.equal(shadow.textContent.includes('second'), true);
  } finally {
    env.cleanup();
  }
});
