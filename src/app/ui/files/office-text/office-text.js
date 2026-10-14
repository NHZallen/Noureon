// A Word, PowerPoint or Excel file read into what a model can take: text (headings, paragraphs, lists, tables, the numbers of charts), and the pictures of the
// file. For a model that cannot read the file itself (docs/superpowers/specs/2026-10-14-office-to-pdf-design.md). Shared by the page and the server: no window,
// no document; the zip reader (JSZip) and the XML parser (DOMParser) come from the caller.

import { chartBlock } from './chart-table.js';
import { joinBlocks, readDocxText } from './docx-text.js';
import { readPptxText } from './pptx-text.js';
import { readXlsxText } from './xlsx-text.js';

export const OFFICE_KINDS = Object.freeze({
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word document' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint presentation' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel workbook' }
});
/** At most this many of the pictures of a file are sent to a model (the rest are told). */
export const MAX_OFFICE_IMAGES = 10;
const MAX_TEXT_CHARS = 300_000;

/** 'docx', 'pptx', 'xlsx' or '' for the file { mimeType, name }. */
export function officeKindOf({ mimeType = '', name = '' } = {}) {
  for (const [kind, { mime }] of Object.entries(OFFICE_KINDS)) if (mimeType === mime) return kind;
  const extension = String(name).toLowerCase().split('.').pop();
  return (!mimeType || mimeType === 'application/octet-stream') && OFFICE_KINDS[extension] ? extension : '';
}

const toBytes = (data) => {
  if (data instanceof Uint8Array) return data;
  const binary = atob(String(data));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/**
 * The content of the file: { kind, label, name, text, images: [{ number, label, mimeType, bytes }], imageTotal, omitted, charts, truncated, usable }.
 * `data` is base64 or bytes. `usable` is false for a file that has almost no text and pictures (a scan): it is not for this reader. Throws when the file
 * is not what its kind says (damaged, encrypted); the caller falls back to another way.
 */
export async function extractOffice({ data, mimeType, name = '' }, { JSZip, DOMParser, maxImages = MAX_OFFICE_IMAGES }) {
  const kind = officeKindOf({ mimeType, name });
  if (!kind) return null;
  const bytes = toBytes(data);
  const zip = await JSZip.loadAsync(bytes);
  let text = '';
  let images = [];
  let imageTotal = 0;
  let charts = 0;
  let truncated = false;
  if (kind === 'docx') {
    const read = await readDocxText(zip, { DOMParser });
    text = [joinBlocks(read.blocks), ...[...read.chartTexts.values()]].filter(Boolean).join('\n\n');
    ({ images, imageTotal, charts } = read);
  } else if (kind === 'pptx') {
    const read = await readPptxText(zip, { DOMParser });
    ({ text, images, imageTotal, charts } = read);
  } else {
    const read = await readXlsxText(zip, bytes, { JSZip, DOMParser });
    ({ text, imageTotal, charts, truncated } = read);
  }
  if (text.length > MAX_TEXT_CHARS) {
    text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n(The text of the file is longer than what is shown.)`;
    truncated = true;
  }
  const sent = images.slice(0, maxImages);
  const significant = text.replace(/\s+/g, '').length;
  return {
    kind,
    label: OFFICE_KINDS[kind].label,
    name,
    text,
    images: sent,
    imageTotal,
    omitted: Math.max(0, imageTotal - sent.length),
    charts,
    truncated,
    // A file that is mostly pictures (a scan, a deck of screenshots) with hardly any text is better told by a model that looks at it.
    usable: significant >= 20 || (imageTotal === 0 && significant > 0)
  };
}

export { chartBlock };
