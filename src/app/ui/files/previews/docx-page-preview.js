// Browser-only: draws a .docx the way it will look when opened, page by page.
// docx-preview does the Word-to-HTML work; this module prepares the package
// for it, keeps the result isolated and safe, and adds what it lacks:
// automatic page breaks, page numbers and complete equation rendering.

import JSZip from 'jszip';
import { renderAsync } from 'docx-preview';

import { convertOmmlToMathml, OMML_NS } from './omml-to-mathml.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const CLASS_NAME = 'noureon-docx';
// Placeholders use private-use characters that real documents do not contain.
const TOKEN_START = '\uE000';
const TOKEN_PATTERN = /\uE000(PAGE|NUMPAGES|SECTIONPAGES|MATH(\d+))\uE001/g;
const PAGE_FIELD_PATTERN = /^\s*(PAGE|NUMPAGES|SECTIONPAGES)\b/i;
const PAGE_GAP_PX = 24;
const SAFE_LINK_PATTERN = /^(?:https?:|mailto:)/i;
const SAFE_SOURCE_PATTERN = /^(?:data:|blob:)/i;
const UNSAFE_CSS_URL_PATTERN = /url\(\s*(?!['"]?\s*(?:data:|blob:|#))[^)]*\)/gi;
const REMOVED_ELEMENTS = 'script, iframe, frame, object, embed, link, meta, base, form, input, button, textarea, select, portal';

const token = (name) => `${TOKEN_START}${name}\uE001`;

const isWord = (node, name) => node?.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === name;

function closestWord(node, name) {
  for (let current = node; current; current = current.parentNode) {
    if (isWord(current, name)) return current;
  }
  return null;
}

// Package XML is edited with DOM Level 2 methods only, so the same code runs
// on browser XML documents and on the XML DOM used by the tests.
const removeNode = (node) => node?.parentNode?.removeChild(node);
const replaceNode = (node, replacement) => node.parentNode?.replaceChild(replacement, node);

function createTokenText(xml, text) {
  const element = xml.createElementNS(WORD_NS, 'w:t');
  element.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  element.textContent = text;
  return element;
}

function createTokenRun(xml, text, properties = null) {
  const run = xml.createElementNS(WORD_NS, 'w:r');
  if (properties) run.appendChild(properties.cloneNode(true));
  run.appendChild(createTokenText(xml, text));
  return run;
}

// Removes a field's instruction and cached result: everything after `begin`
// up to and including `end`, across the runs of one paragraph.
function removeFieldNodes(paragraph, begin, end) {
  const beginRun = closestWord(begin, 'r');
  const endRun = closestWord(end, 'r');
  const runs = [...paragraph.getElementsByTagNameNS(WORD_NS, 'r')];
  const beginIndex = runs.indexOf(beginRun);
  const endIndex = runs.indexOf(endRun);
  if (beginIndex < 0 || endIndex < beginIndex) return false;

  const removeSiblings = (from, to) => {
    for (let node = from; node && node !== to;) {
      const next = node.nextSibling;
      if (!isWord(node, 'rPr')) removeNode(node);
      node = next;
    }
  };
  if (beginRun === endRun) {
    removeSiblings(begin.nextSibling, end);
  } else {
    removeSiblings(begin.nextSibling, null);
    runs.slice(beginIndex + 1, endIndex).forEach(removeNode);
    removeSiblings(endRun.firstChild, end);
  }
  removeNode(end);
  return true;
}

// PAGE and NUMPAGES fields become placeholder text that is filled in once the
// preview knows which page each header or footer ended up on.
function replacePageFields(xml) {
  let replaced = 0;
  [...xml.getElementsByTagNameNS(WORD_NS, 'fldSimple')].forEach((field) => {
    const match = PAGE_FIELD_PATTERN.exec(field.getAttributeNS(WORD_NS, 'instr') || field.getAttribute('w:instr') || '');
    if (!match) return;
    const properties = field.getElementsByTagNameNS(WORD_NS, 'rPr')[0] || null;
    replaceNode(field, createTokenRun(xml, token(match[1].toUpperCase()), properties));
    replaced += 1;
  });

  [...xml.getElementsByTagNameNS(WORD_NS, 'p')].forEach((paragraph) => {
    const stack = [];
    const fields = [];
    for (const node of paragraph.getElementsByTagNameNS(WORD_NS, '*')) {
      if (node.localName === 'fldChar') {
        const type = node.getAttributeNS(WORD_NS, 'fldCharType') || node.getAttribute('w:fldCharType');
        if (type === 'begin') stack.push({ begin: node, instruction: '' });
        else if (type === 'separate' && stack.length) stack.at(-1).separated = true;
        else if (type === 'end' && stack.length) {
          const field = stack.pop();
          if (stack.length === 0) fields.push({ ...field, end: node });
        }
      } else if (node.localName === 'instrText' && stack.length && !stack.at(-1).separated) {
        stack.at(-1).instruction += node.textContent || '';
      }
    }
    fields.forEach(({ begin, end, instruction }) => {
      const match = PAGE_FIELD_PATTERN.exec(instruction);
      if (!match) return;
      const text = createTokenText(xml, token(match[1].toUpperCase()));
      begin.parentNode.insertBefore(text, begin);
      if (removeFieldNodes(paragraph, begin, end)) {
        removeNode(begin);
        replaced += 1;
      } else {
        removeNode(text);
      }
    });
  });
  return replaced;
}

function replaceEquations(xml, equations, document) {
  const replace = (node, display) => {
    const index = equations.length;
    equations.push(convertOmmlToMathml(node, { document, display }));
    replaceNode(node, createTokenRun(xml, token(`MATH${index}`)));
  };
  [...xml.getElementsByTagNameNS(OMML_NS, 'oMathPara')].forEach((node) => replace(node, true));
  [...xml.getElementsByTagNameNS(OMML_NS, 'oMath')].forEach((node) => replace(node, false));
}

const BODY_LEVEL_CONTAINERS = new Set(['sdt', 'sdtContent', 'customXml']);

function isBodyLevel(table) {
  for (let node = table.parentNode; node; node = node.parentNode) {
    if (isWord(node, 'body')) return true;
    if (!(node.namespaceURI === WORD_NS && BODY_LEVEL_CONTAINERS.has(node.localName))) return false;
  }
  return false;
}

// Header rows (w:tblHeader) repeat on every page in Word. docx-preview does
// not mark them, so their count is read here, in body table order.
function countHeaderRows(xml) {
  const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) return [];
  return [...body.getElementsByTagNameNS(WORD_NS, 'tbl')]
    .filter(isBodyLevel)
    .map((table) => {
      let count = 0;
      for (const row of [...table.childNodes].filter((child) => isWord(child, 'tr'))) {
        const header = [...row.getElementsByTagNameNS(WORD_NS, 'tblHeader')][0];
        const value = header?.getAttributeNS(WORD_NS, 'val') ?? header?.getAttribute('w:val');
        if (!header || /^(?:0|false|off)$/i.test(value || '')) break;
        count += 1;
      }
      return count;
    });
}

// A w:spacing without lineRule means "auto" (a multiple of single spacing),
// but docx-preview reads it as an exact height. Spelling the rule out lets
// the preview apply Word's meaning (see applyWordLineHeights).
function normalizeLineRules(xml) {
  let changed = 0;
  Array.from(xml.getElementsByTagNameNS(WORD_NS, 'spacing')).forEach((spacing) => {
    if (spacing.hasAttributeNS(WORD_NS, 'line') && !spacing.hasAttributeNS(WORD_NS, 'lineRule')) {
      spacing.setAttributeNS(WORD_NS, 'w:lineRule', 'auto');
      changed += 1;
    }
  });
  return changed;
}

export async function prepareDocxPackage(data, { window, document }) {
  const zip = await JSZip.loadAsync(data);
  const parser = new window.DOMParser();
  const serializer = new window.XMLSerializer();
  const equations = [];
  let headerRows = [];
  const partNames = Object.keys(zip.files).filter((name) => /^word\/(?:document|styles|numbering|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name));

  for (const name of partNames) {
    const source = await zip.file(name).async('string');
    const xml = parser.parseFromString(source, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length > 0) continue;
    let changed = replacePageFields(xml) > 0;
    changed = normalizeLineRules(xml) > 0 || changed;
    const equationCount = equations.length;
    replaceEquations(xml, equations, document);
    changed = changed || equations.length > equationCount;
    if (name === 'word/document.xml') headerRows = countHeaderRows(xml);
    if (changed) zip.file(name, serializer.serializeToString(xml));
  }
  return {
    data: await zip.generateAsync({ type: 'arraybuffer' }),
    equations,
    headerRows
  };
}

const stripUnsafeCssUrls = (text) => String(text || '').replace(UNSAFE_CSS_URL_PATTERN, 'none');

// CSS multiplies a unitless line-height by the font size; Word multiplies by
// the font's natural line height, which for CJK fonts is a third larger.
// Unitless heights become a custom property that applyWordLineHeights
// resolves per paragraph; fixed heights reset it so the cascade stays exact.
export const rewriteLineHeights = (text) => String(text || '').replace(/line-height:\s*([^;}"]+)/g, (match, raw) => {
  const value = raw.trim();
  return /^\d*\.?\d+$/.test(value) ? `--noureon-line: ${value}` : `line-height: ${value}; --noureon-line: none`;
});

function convertAutoLineHeights(root, styleRoot) {
  styleRoot.querySelectorAll('style').forEach((style) => {
    style.textContent = rewriteLineHeights(style.textContent);
  });
  root.querySelectorAll('[style*="line-height"]').forEach((element) => {
    element.setAttribute('style', rewriteLineHeights(element.getAttribute('style')));
  });
}

const CJK_PATTERN = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;

function applyWordLineHeights(root, window, document) {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;line-height:normal;';
  root.appendChild(probe);
  const naturalHeights = new Map();
  const naturalHeight = (element, cjk) => {
    const style = window.getComputedStyle(element);
    const key = `${style.fontFamily}|${style.fontSize}|${style.fontWeight}|${cjk}`;
    if (!naturalHeights.has(key)) {
      Object.assign(probe.style, { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight });
      // Ten lines, so the rounded offsetHeight still gives 0.1 px precision.
      probe.textContent = Array(10).fill(cjk ? '\u570BAg' : 'Ag').join('\n');
      naturalHeights.set(key, probe.offsetHeight / 10);
    }
    return naturalHeights.get(key);
  };
  const paragraphs = [...root.querySelectorAll('p')].map((paragraph) => ({
    paragraph,
    multiple: parseFloat(window.getComputedStyle(paragraph).getPropertyValue('--noureon-line'))
  })).filter(({ multiple }) => multiple > 0);
  paragraphs.forEach(({ paragraph, multiple }) => {
    const cjk = CJK_PATTERN.test(paragraph.textContent || '');
    // Word sizes a line by its largest run; the paragraph's own font (the
    // paragraph mark) only counts when there is no text at all.
    const runs = [...paragraph.querySelectorAll('span')].filter((span) => span.firstChild?.nodeType === 3).slice(0, 40);
    const tallest = runs.length > 0
      ? Math.max(...runs.map((run) => naturalHeight(run, cjk)))
      : naturalHeight(paragraph, cjk);
    paragraph.style.lineHeight = `${(multiple * tallest).toFixed(2)}px`;
  });
  probe.remove();
}

// Word adds one paragraph's space after to the next one's space before; CSS
// collapses the two margins into the larger one.
function applyWordParagraphSpacing(root, window) {
  root.querySelectorAll('article, td, th, header, footer').forEach((container) => {
    const blocks = [...container.children];
    const margins = blocks.map((block) => {
      const style = window.getComputedStyle(block);
      return { top: parseFloat(style.marginTop) || 0, bottom: parseFloat(style.marginBottom) || 0 };
    });
    for (let index = 1; index < blocks.length; index += 1) {
      const before = margins[index - 1].bottom;
      const after = margins[index].top;
      if (before > 0 && after > 0) {
        blocks[index].style.marginTop = `${before + after}px`;
        blocks[index - 1].style.marginBottom = '0px';
      }
    }
  });
}

// Word files made by model-written code (plan B) are untrusted input: the
// preview may not run script, fetch remote resources or navigate the app.
function sanitizeRenderedDocument(root, styleRoot) {
  root.querySelectorAll(REMOVED_ELEMENTS).forEach((node) => node.remove());
  root.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcset' || name === 'formaction') {
        element.removeAttribute(attribute.name);
      } else if (name === 'style') {
        const safe = stripUnsafeCssUrls(attribute.value);
        if (safe !== attribute.value) element.setAttribute(attribute.name, safe);
      } else if ((name === 'src' || name === 'xlink:href') && !SAFE_SOURCE_PATTERN.test(attribute.value.trim())) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  root.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href').trim();
    if (href.startsWith('#')) {
      anchor.dataset.previewTarget = href.slice(1);
      anchor.removeAttribute('href');
      anchor.setAttribute('role', 'link');
      anchor.tabIndex = 0;
    } else if (SAFE_LINK_PATTERN.test(href)) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    } else {
      anchor.removeAttribute('href');
    }
  });
  // Style text comes from the document; it may not fetch anything.
  styleRoot.querySelectorAll('style').forEach((style) => {
    style.textContent = stripUnsafeCssUrls(style.textContent);
  });
  styleRoot.querySelectorAll(':not(style)').forEach((node) => node.remove());
}

function insertEquations(root, equations, document) {
  const walker = document.createTreeWalker(root, 4);
  const matches = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.includes(`${TOKEN_START}MATH`)) matches.push(node);
  }
  matches.forEach((node) => {
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of node.nodeValue.matchAll(TOKEN_PATTERN)) {
      if (match[2] === undefined) continue;
      fragment.append(node.nodeValue.slice(cursor, match.index));
      const equation = equations[Number(match[2])];
      fragment.append(equation ? equation.cloneNode(true) : '');
      cursor = match.index + match[0].length;
    }
    fragment.append(node.nodeValue.slice(cursor));
    node.replaceWith(fragment);
  });
}

// Layout offsets, not client rectangles: the dialog may still be running its
// opening transform, which would scale every rectangle it contains.
const outerHeight = (element, window) => {
  if (!element) return 0;
  const style = window.getComputedStyle(element);
  return element.offsetHeight + parseFloat(style.marginTop || 0) + parseFloat(style.marginBottom || 0);
};

const isHeading = (element) => /(?:^|\s)[\w-]*(?:heading|title|subtitle|toctitle)\d*(?:\s|$)/i.test(element.className || '');

// The article is positioned (see PREVIEW_STYLE), so child offsets are
// measured from its top edge.
function childBottom(child, window) {
  const style = window.getComputedStyle(child);
  return child.offsetTop + child.offsetHeight + parseFloat(style.marginBottom || 0);
}

function splitTable(table, available) {
  const rows = [...table.rows];
  const headerCount = Math.min(Number(table.dataset.previewHeaderRows || 0), rows.length);
  const breakIndex = rows.findIndex((row, index) => index >= headerCount
    && table.offsetTop + row.offsetTop + row.offsetHeight > available);
  // Nothing past the header rows fits: move the whole table instead.
  if (breakIndex <= headerCount) return null;

  const continuation = table.cloneNode(false);
  [...table.children].filter((child) => /^(?:colgroup|caption)$/i.test(child.tagName)).forEach((child) => {
    if (child.tagName.toLowerCase() === 'colgroup') continuation.appendChild(child.cloneNode(true));
  });
  let currentParent = null;
  let currentTarget = null;
  const targetFor = (row) => {
    if (row.parentNode === table) return continuation;
    if (row.parentNode !== currentParent) {
      currentParent = row.parentNode;
      currentTarget = currentParent.cloneNode(false);
      continuation.appendChild(currentTarget);
    }
    return currentTarget;
  };
  rows.slice(0, headerCount).forEach((row) => targetFor(row).appendChild(row.cloneNode(true)));
  rows.slice(breakIndex).forEach((row) => targetFor(row).appendChild(row));
  return continuation;
}

// Word's widow and orphan control keeps at least two lines of a paragraph on
// each side of a page break.
const MIN_LINES_PER_SIDE = 2;

// Line boxes of a paragraph, in layout pixels from its top edge. Client
// rectangles are divided by `scale` to undo any transform on the dialog.
function measureLines(paragraph, frame, document) {
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const lines = [];
  for (const rect of range.getClientRects()) {
    if (!rect.width || !rect.height) continue;
    const top = (rect.top - frame.top) / frame.scale;
    const bottom = (rect.bottom - frame.top) / frame.scale;
    const last = lines.at(-1);
    if (!last || top >= last.bottom - 1) lines.push({ top, bottom });
    else last.bottom = Math.max(last.bottom, bottom);
  }
  return lines;
}

// The text position where the line starting at `lineTop` begins. Equations
// are atomic, so their text is never a split point.
function findLineStart(paragraph, lineTop, frame, document) {
  const walker = document.createTreeWalker(paragraph, 4, {
    acceptNode: (node) => (node.parentNode?.closest?.('math') ? 3 : 1)
  });
  const nodes = [];
  let total = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, start: total });
    total += node.nodeValue.length;
  }
  const range = document.createRange();
  const locate = (index) => {
    const entry = nodes.findLast((item) => item.start <= index);
    return { node: entry.node, offset: index - entry.start };
  };
  const topOf = (index) => {
    const { node, offset } = locate(index);
    range.setStart(node, offset);
    range.setEnd(node, Math.min(offset + 1, node.nodeValue.length));
    const rect = [...range.getClientRects()].find((item) => item.height > 0);
    return rect ? (rect.top - frame.top) / frame.scale : -Infinity;
  };
  let low = 0;
  let high = total - 1;
  let found = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (topOf(middle) >= lineTop - 0.5) {
      found = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  if (found <= 0) return null;
  const position = locate(found);
  // Never split a surrogate pair.
  const code = position.node.nodeValue.charCodeAt(position.offset);
  if (code >= 0xDC00 && code <= 0xDFFF) position.offset -= 1;
  return position;
}

// Moves everything from (textNode, offset) to the end of the paragraph into
// a copy of it, recreating the inline elements that wrap the split point.
export function splitInlineContent(paragraph, textNode, offset) {
  const tail = offset > 0 ? textNode.splitText(offset) : textNode;
  const chain = [];
  for (let node = tail.parentNode; node && node !== paragraph; node = node.parentNode) chain.unshift(node);
  const continuation = paragraph.cloneNode(false);
  let target = continuation;
  const copies = chain.map((element) => {
    const copy = element.cloneNode(false);
    copy.removeAttribute('id');
    target.appendChild(copy);
    target = copy;
    return copy;
  });
  const moveFrom = (start, into) => {
    for (let node = start; node;) {
      const next = node.nextSibling;
      into.appendChild(node);
      node = next;
    }
  };
  moveFrom(tail, copies.at(-1) || continuation);
  for (let depth = chain.length - 1; depth >= 0; depth -= 1) {
    moveFrom(chain[depth].nextSibling, depth === 0 ? continuation : copies[depth - 1]);
  }
  return continuation;
}

function splitParagraph(paragraph, available, document) {
  const bounds = paragraph.getBoundingClientRect();
  if (!paragraph.offsetHeight || !bounds.height) return null;
  const frame = { top: bounds.top, scale: bounds.height / paragraph.offsetHeight };
  const lines = measureLines(paragraph, frame, document);
  if (lines.length < MIN_LINES_PER_SIDE * 2) return null;
  const fitting = Math.min(
    lines.filter((line) => paragraph.offsetTop + line.bottom <= available + 0.5).length,
    lines.length - MIN_LINES_PER_SIDE
  );
  if (fitting < MIN_LINES_PER_SIDE) return null;
  const position = findLineStart(paragraph, lines[fitting].top, frame, document);
  if (!position) return null;

  const continuation = splitInlineContent(paragraph, position.node, position.offset);
  // The rest of the paragraph continues its lines: no first-line indent, no
  // list marker and no space between the two halves.
  continuation.removeAttribute('id');
  [...continuation.classList].filter((name) => name.includes('-num-')).forEach((name) => continuation.classList.remove(name));
  continuation.style.textIndent = '0px';
  continuation.style.marginTop = '0px';
  paragraph.style.marginBottom = '0px';
  return continuation;
}

// Splits one rendered page into as many pages as its content needs, keeping
// headings with what follows, splitting long paragraphs between lines and
// repeating table headers.
function splitPage(page, window, document) {
  const article = [...page.children].find((child) => child.tagName.toLowerCase() === 'article');
  if (!article) return null;
  const header = [...page.children].find((child) => child.tagName.toLowerCase() === 'header');
  const footer = [...page.children].find((child) => child.tagName.toLowerCase() === 'footer');
  const style = window.getComputedStyle(page);
  const pageHeight = parseFloat(style.minHeight) || parseFloat(style.height);
  if (!pageHeight) return null;
  const available = pageHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0)
    - outerHeight(header, window) - outerHeight(footer, window);
  if (available <= 0) return null;

  const children = [...article.children];
  let breakIndex = children.findIndex((child) => childBottom(child, window) > available + 0.5);
  if (breakIndex < 0) return null;

  let carried = null;
  const breaking = children[breakIndex];
  const breakingTag = breaking.tagName.toLowerCase();
  if (breakingTag === 'table') {
    carried = splitTable(breaking, available);
  } else if (breakingTag === 'p' && breaking.offsetTop < available) {
    carried = splitParagraph(breaking, available, document);
  }
  if (carried) breakIndex += 1;
  if (!carried) {
    if (breakIndex === 0) {
      // A single block taller than a page stays where it is.
      if (children.length === 1) return null;
      breakIndex = 1;
    }
    while (breakIndex > 1 && isHeading(children[breakIndex - 1])) breakIndex -= 1;
  }

  const next = page.cloneNode(false);
  if (header) next.appendChild(header.cloneNode(true));
  const nextArticle = article.cloneNode(false);
  next.appendChild(nextArticle);
  if (footer) next.appendChild(footer.cloneNode(true));
  if (carried) nextArticle.appendChild(carried);
  children.slice(breakIndex).forEach((child) => nextArticle.appendChild(child));
  if (nextArticle.children.length === 0) return null;
  page.after(next);
  return next;
}

function paginate(wrapper, window, document) {
  const pages = [...wrapper.children].filter((child) => child.tagName.toLowerCase() === 'section');
  for (let index = 0; index < pages.length && pages.length < 2000; index += 1) {
    const next = splitPage(pages[index], window, document);
    if (next) pages.splice(index + 1, 0, next);
  }
  return pages;
}

function fillPageNumbers(pages, document) {
  const total = String(pages.length);
  pages.forEach((page, index) => {
    const walker = document.createTreeWalker(page, 4);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue.includes(TOKEN_START)) nodes.push(node);
    }
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue.replace(TOKEN_PATTERN, (match, name, equationIndex) => {
        if (equationIndex !== undefined) return match;
        return name === 'PAGE' ? String(index + 1) : total;
      });
    });
  });
}

const PREVIEW_STYLE = `
  :host { all: initial; display: block; }
  .preview-viewport { overflow: hidden; }
  .${CLASS_NAME}-wrapper {
    background: transparent !important;
    padding: 0 !important;
    gap: ${PAGE_GAP_PX}px;
    width: max-content;
    margin: 0 auto;
  }
  .${CLASS_NAME}-wrapper > section.${CLASS_NAME} {
    margin: 0 !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18), 0 8px 24px rgba(15, 23, 42, 0.08) !important;
  }
  section.${CLASS_NAME} > article { position: relative; }
  [data-preview-target] { cursor: pointer; }
  math { font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", math; }
  math[display="block"] { margin: 0.35em 0; }
`;

/**
 * Renders `blob` into `host` (which gets its own shadow root) and returns
 * { pageCount, dispose }. Throws when the document cannot be drawn.
 */
export async function renderDocxPreview(blob, host, { window = globalThis.window, document = globalThis.document } = {}) {
  const prepared = await prepareDocxPackage(await blob.arrayBuffer(), { window, document });
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  shadow.replaceChildren();
  const baseStyle = document.createElement('style');
  baseStyle.textContent = PREVIEW_STYLE;
  const styleRoot = document.createElement('div');
  const viewport = document.createElement('div');
  viewport.className = 'preview-viewport';
  const body = document.createElement('div');
  viewport.appendChild(body);
  shadow.append(styleRoot, baseStyle, viewport);

  await renderAsync(prepared.data, body, styleRoot, {
    className: CLASS_NAME,
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    // The experimental tab-stop pass runs 500 ms after rendering (after
    // pagination) and misplaces tabs in indented paragraphs; a plain tab
    // renders as a fixed em space instead, which keeps the pages stable.
    experimental: false,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderComments: false,
    renderChanges: false,
    useBase64URL: true,
    trimXmlDeclaration: true
  });
  // docx-preview puts its styles before the page; keep ours last so they win.
  shadow.appendChild(baseStyle);

  const wrapper = body.querySelector(`.${CLASS_NAME}-wrapper`) || body;
  sanitizeRenderedDocument(body, styleRoot);
  convertAutoLineHeights(body, styleRoot);
  insertEquations(body, prepared.equations, document);
  [...wrapper.querySelectorAll(`section.${CLASS_NAME} > article > table`)].forEach((table, index) => {
    const count = prepared.headerRows[index];
    if (count > 0) table.dataset.previewHeaderRows = String(count);
  });

  // Line heights and page breaks depend on the real font metrics.
  await document.fonts?.ready;
  applyWordParagraphSpacing(wrapper, window);
  applyWordLineHeights(wrapper, window, document);
  const pages = paginate(wrapper, window, document);
  fillPageNumbers(pages, document);

  const naturalWidth = wrapper.offsetWidth;
  const fit = () => {
    const available = host.clientWidth;
    if (!available || !naturalWidth) return;
    const zoom = Math.min(1, available / naturalWidth);
    wrapper.style.zoom = String(zoom);
  };
  fit();
  const observer = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(fit) : null;
  observer?.observe(host);

  const onClick = (event) => {
    const link = event.target?.closest?.('[data-preview-target]');
    if (!link) return;
    event.preventDefault();
    const target = shadow.getElementById(link.dataset.previewTarget)
      || shadow.querySelector(`[name="${window.CSS?.escape ? window.CSS.escape(link.dataset.previewTarget) : link.dataset.previewTarget}"]`);
    // Word jumps straight to the target; so does the preview.
    target?.scrollIntoView({ block: 'start' });
  };
  const onKeyDown = (event) => {
    if (event.key === 'Enter' && event.target?.dataset?.previewTarget) onClick(event);
  };
  shadow.addEventListener('click', onClick);
  shadow.addEventListener('keydown', onKeyDown);

  return {
    pageCount: pages.length,
    dispose() {
      observer?.disconnect();
      shadow.removeEventListener('click', onClick);
      shadow.removeEventListener('keydown', onKeyDown);
      shadow.replaceChildren();
    }
  };
}
