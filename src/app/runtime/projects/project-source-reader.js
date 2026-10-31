// A file a person adds to a project as a source, read into text (docs/superpowers/specs/2026-10-31-projects-design.md, §13). Plain text and code are read as they are, Word, PowerPoint and Excel
// files by the office reader the chats use, and PDFs by their text layer. A picture or a scan has no text to read here: it is told, not dropped quietly. The readers that need the browser
// (JSZip, DOMParser, the PDF library) come from `deps`, so this module can be tested without one. Only the text is kept: the file itself is not stored.

import { extractOffice, officeKindOf } from '../../ui/files/office-text/office-text.js';
import { PROJECT_SOURCE_CHARS_MAX } from './project-source-model.js';

/** The biggest file that is read (bytes): the text is cut at 100 000 characters anyway, and a bigger file only costs the page time. */
export const PROJECT_SOURCE_FILE_MAX_BYTES = 25 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'html', 'htm', 'yaml', 'yml', 'toml', 'ini', 'log', 'rtf', 'tex', 'srt', 'vtt',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'sql', 'css', 'scss', 'vue', 'svelte', 'r', 'lua']);
const TEXT_MIMES = new Set(['application/json', 'application/xml', 'application/x-yaml', 'application/javascript', 'application/x-sh', 'application/sql']);

const extensionOf = (name) => (String(name || '').includes('.') ? String(name).toLowerCase().split('.').pop() : '');
const isPdf = (file) => file.type === 'application/pdf' || extensionOf(file.name) === 'pdf';
const isPlainText = (file) => String(file.type || '').startsWith('text/') || TEXT_MIMES.has(file.type) || TEXT_EXTENSIONS.has(extensionOf(file.name));

/** The kind of the file this reader knows: 'text', 'office', 'pdf' or '' (a picture, a video, a program...). */
export function sourceFileKind(file) {
  if (isPdf(file)) return 'pdf';
  if (officeKindOf({ mimeType: file.type || '', name: file.name || '' })) return 'office';
  return isPlainText(file) ? 'text' : '';
}

const clean = (text) => String(text ?? '').replace(/\r\n?/g, '\n').replaceAll(String.fromCharCode(0), '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();

/**
 * Reads a File. Gives { ok: true, title, mime, size, text, truncated } or { ok: false, code } with code one of
 * 'unsupported' (a kind of file with no text to read), 'too_big', 'empty' (nothing to read: a scan, an empty file) and 'unreadable' (damaged or protected).
 * deps: { loadOfficeDeps() -> { JSZip, DOMParser }, readPdfText(bytes) -> text }.
 */
export async function readSourceFile(file, { loadOfficeDeps, readPdfText } = {}) {
  const kind = sourceFileKind(file);
  if (!kind) return { ok: false, code: 'unsupported' };
  if (file.size > PROJECT_SOURCE_FILE_MAX_BYTES) return { ok: false, code: 'too_big' };
  let text = '';
  try {
    if (kind === 'text') text = await file.text();
    else if (kind === 'pdf') text = await readPdfText(new Uint8Array(await file.arrayBuffer()));
    else {
      const deps = await loadOfficeDeps();
      const content = await extractOffice({ data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type || '', name: file.name || '' }, { ...deps, maxImages: 0 });
      text = content?.text || '';
    }
  } catch {
    return { ok: false, code: 'unreadable' };
  }
  text = clean(text);
  if (!text) return { ok: false, code: 'empty' };
  return { ok: true, title: String(file.name || '').slice(0, 120), mime: String(file.type || ''), size: Number(file.size) || text.length, text: text.slice(0, PROJECT_SOURCE_CHARS_MAX), truncated: text.length > PROJECT_SOURCE_CHARS_MAX };
}
