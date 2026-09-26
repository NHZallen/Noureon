import { extractFileBlocks, FILE_BLOCK_TOKEN_GLOBAL_PATTERN } from './file-block-protocol.js';
import { describeFileBlock, registerFileBlock } from './file-block-model.js';
import { createFileBundleElement, createFileCardElement } from './file-card-renderer.js';

const FILE_LINK_PREFIX = '#noureon-file:';

// The chat's own Markdown renderer (sanitized, with formulas and charts). The
// markdown helpers register it when they are created so file previews render
// documents exactly like chat messages without extra dependency plumbing.
let chatMarkdownRenderer = null;

export function setFileMarkdownRenderer(renderer) {
  chatMarkdownRenderer = typeof renderer === 'function' ? renderer : null;
}

export function getFileMarkdownRenderer() {
  return chatMarkdownRenderer;
}

// Models trained on ChatGPT transcripts often "link" the file they just wrote
// to a sandbox path that does not exist here. Rewriting those targets to an
// in-page marker lets the card below own the download, and keeps DOMPurify
// from leaving a dead anchor behind.
const PSEUDO_TARGET = '(?:sandbox:|attachment:\\/\\/|file:\\/\\/\\/?|\\/?mnt\\/data\\/)';
const PSEUDO_FILE_LINK_PATTERN = new RegExp(`\\]\\(\\s*(?:<(${PSEUDO_TARGET}[^>]*)>|(${PSEUDO_TARGET}[^)\\s<>]*))\\s*\\)`, 'gi');

function rewritePseudoFileLinks(markdown) {
  return markdown.replace(PSEUDO_FILE_LINK_PATTERN, (match, bracketedTarget, bareTarget) => {
    const name = String(bracketedTarget || bareTarget || '').split('/').at(-1).trim();
    if (!/\.[A-Za-z0-9]{1,8}$/.test(name)) return match;
    return `](${FILE_LINK_PREFIX}${encodeURIComponent(name)})`;
  });
}

/**
 * Pre-parse step: pulls file blocks out of the Markdown source and returns the
 * tokenized text to hand to marked.
 */
export function prepareFileBlocksForMarkdown(text = '') {
  const { text: tokenized, blocks } = extractFileBlocks(text);
  return {
    markdown: blocks.length > 0 ? rewritePseudoFileLinks(tokenized) : tokenized,
    blocks
  };
}

function replaceTokenInTextNode(document, textNode, cardsByIndex) {
  const text = textNode.nodeValue || '';
  FILE_BLOCK_TOKEN_GLOBAL_PATTERN.lastIndex = 0;
  if (!FILE_BLOCK_TOKEN_GLOBAL_PATTERN.test(text)) return;
  FILE_BLOCK_TOKEN_GLOBAL_PATTERN.lastIndex = 0;

  const parent = textNode.parentNode;
  const paragraph = parent?.nodeName === 'P' ? parent : null;
  const onlyToken = paragraph && paragraph.childNodes.length === 1 && text.trim().match(/^NOURA_FILE_TOKEN_(\d+)_END$/);
  if (onlyToken) {
    const card = cardsByIndex.get(Number(onlyToken[1]));
    if (card) paragraph.replaceWith(card);
    else paragraph.remove();
    return;
  }

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let match;
  while ((match = FILE_BLOCK_TOKEN_GLOBAL_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
    const card = cardsByIndex.get(Number(match[1]));
    if (card) fragment.appendChild(card);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
  textNode.replaceWith(fragment);
}

function collectTextNodes(root) {
  const nodes = [];
  const visit = (node) => {
    node.childNodes?.forEach((child) => {
      if (child.nodeType === 3) nodes.push(child);
      else if (child.nodeType === 1 && child.nodeName !== 'CODE' && child.nodeName !== 'PRE') visit(child);
    });
  };
  visit(root);
  return nodes;
}

function bindPseudoFileLinks(root, descriptors) {
  root.querySelectorAll(`a[href^="${FILE_LINK_PREFIX}"]`).forEach((anchor) => {
    let name = '';
    try {
      name = decodeURIComponent(anchor.getAttribute('href').slice(FILE_LINK_PREFIX.length));
    } catch {
      name = '';
    }
    const extension = name.split('.').at(-1).toLowerCase();
    // Models sometimes shorten or translate the name in the link text; with a
    // single file of the same type the intent is still unambiguous.
    const sameType = descriptors.filter((descriptor) => descriptor.extension === extension);
    const target = descriptors.find((descriptor) => descriptor.name.toLowerCase() === name.toLowerCase())
      || (sameType.length === 1 ? sameType[0] : null);
    if (!target || target.state === 'blocked' || target.state === 'too-large') {
      anchor.replaceWith(...anchor.childNodes);
      return;
    }
    anchor.removeAttribute('target');
    anchor.setAttribute('href', `${FILE_LINK_PREFIX}${encodeURIComponent(target.name)}`);
    anchor.dataset.fileAction = 'download';
    anchor.dataset.fileId = target.id;
    anchor.classList.add('ac-file-inline-link');
  });
}

/**
 * Post-render step: swaps the paragraph tokens produced by
 * prepareFileBlocksForMarkdown for real file cards inside the parsed document.
 */
export function applyFileCards({ document, root, blocks = [], language = 'zh-TW' } = {}) {
  if (!document || !root || blocks.length === 0) return [];
  const descriptors = blocks.map((block) => registerFileBlock(describeFileBlock(block)));
  const cardsByIndex = new Map(descriptors.map((descriptor, index) => [
    index,
    createFileCardElement(document, descriptor, { language })
  ]));

  collectTextNodes(root).forEach((node) => replaceTokenInTextNode(document, node, cardsByIndex));
  // A token swallowed by an unusual Markdown context still gets its card.
  cardsByIndex.forEach((card) => {
    if (!card.parentNode) root.appendChild(card);
  });

  bindPseudoFileLinks(root, descriptors);

  const bundleIds = descriptors
    .filter((descriptor) => descriptor.state === 'ready')
    .map((descriptor) => descriptor.id);
  if (bundleIds.length >= 2) {
    root.appendChild(createFileBundleElement(document, bundleIds, { language }));
  }
  return descriptors;
}
