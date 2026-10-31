// The text of a file of a project, for the tools that look into the files (src/data/project-files-tool.js; docs/superpowers/specs/2026-10-31-projects-design.md, §16): text and code as they are,
// a PDF by its text layer (pdf.js), a Word, PowerPoint or Excel file by the reader the attachments of a chat use. A picture, a scan (a PDF with no text layer) and any other kind of file have
// none: the text is '' and the file stays a file the model is given whole, when it can read it. The page and the server give their own pdf.js and office reader; this file has neither.
// Pure: no window, no document, no browser storage.

import { sourceFileKind } from './project-source-reader.js';

/** The most characters taken from one file. */
export const FILE_TEXT_CHARS_MAX = 3_000_000;
const PDF_PAGES_MAX = 600;

const clean = (text) => String(text ?? '').replace(/\r\n?/g, '\n').replaceAll(String.fromCharCode(0), '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();

function toBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) binary += String.fromCharCode(...bytes.subarray(index, index + step));
  return btoa(binary);
}

/** The kind of a file for the tools: 'text', 'pdf', 'office', or '' (a picture or anything else: no text to look into). */
export function textKindOf({ name = '', mime = '' } = {}) {
  const kind = sourceFileKind({ name, type: mime });
  return kind === 'text' || kind === 'pdf' || kind === 'office' ? kind : '';
}

/** The text layer of a PDF, a page after another with its number before it. `pdfjs` is the library (`getDocument`). */
export async function pdfText(pdfjs, bytes) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, disableFontFace: true });
  const doc = await task.promise;
  try {
    const pages = [];
    let chars = 0;
    for (let number = 1; number <= Math.min(doc.numPages, PDF_PAGES_MAX) && chars < FILE_TEXT_CHARS_MAX; number += 1) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      let line = '';
      const lines = [];
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        line += item.str;
        if (item.hasEOL) { lines.push(line); line = ''; } else if (item.str && !item.str.endsWith(' ')) line += ' ';
      }
      if (line) lines.push(line);
      const text = clean(lines.join('\n'));
      if (text) { pages.push(`[Page ${number}]\n${text}`); chars += text.length; }
      page.cleanup?.();
    }
    return pages.join('\n\n');
  } finally {
    await doc.destroy?.();
  }
}

/**
 * The text of a file given as bytes. `getPdfjs()` gives the pdf.js library, `officeReader` the reader of Word, PowerPoint and Excel files (ui/files/office-text/office-reader.js);
 * a kind with no reader given has no text. Resolves '' for a file that has no text; throws when a file that should have text cannot be read.
 */
export async function extractProjectFileText({ bytes, name = '', mime = '', getPdfjs = null, officeReader = null }) {
  const kind = textKindOf({ name, mime });
  if (!kind || !bytes?.length) return '';
  if (kind === 'text') return clean(new TextDecoder('utf-8').decode(bytes)).slice(0, FILE_TEXT_CHARS_MAX);
  if (kind === 'pdf') {
    if (!getPdfjs) return '';
    return (await pdfText(await getPdfjs(), bytes)).slice(0, FILE_TEXT_CHARS_MAX);
  }
  if (!officeReader) return '';
  const content = await officeReader.content({ mimeType: mime, name, data: toBase64(bytes) });
  return content?.usable ? clean(content.text).slice(0, FILE_TEXT_CHARS_MAX) : '';
}
