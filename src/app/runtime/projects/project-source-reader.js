// A file a person adds to a project as a source (docs/superpowers/specs/2026-10-31-projects-design.md, §13). Text and code become text; every other kind of file is kept as it is
// (project-source-files.js) and given to the model like an attachment of a chat, so a PDF keeps its pictures and a Word file its layout. Pure: no window, no document.

import { officeKindOf } from '../../ui/files/office-text/office-text.js';
import { PROJECT_SOURCE_CHARS_MAX } from './project-source-model.js';

/** The biggest file that is read (bytes): the text is cut at 100 000 characters anyway, and an original that is kept is at most this big too. */
export const PROJECT_SOURCE_FILE_MAX_BYTES = 20 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'html', 'htm', 'yaml', 'yml', 'toml', 'ini', 'log', 'rtf', 'tex', 'srt', 'vtt',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'sql', 'css', 'scss', 'vue', 'svelte', 'r', 'lua']);
const TEXT_MIMES = new Set(['application/json', 'application/xml', 'application/x-yaml', 'application/javascript', 'application/x-sh', 'application/sql']);

const extensionOf = (name) => (String(name || '').includes('.') ? String(name).toLowerCase().split('.').pop() : '');
const isPdf = (file) => file.type === 'application/pdf' || extensionOf(file.name) === 'pdf';
const isPlainText = (file) => String(file.type || '').startsWith('text/') || TEXT_MIMES.has(file.type) || TEXT_EXTENSIONS.has(extensionOf(file.name));

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif']);

/** The kind of file: 'text' (text and code), 'pdf', 'office' (Word, PowerPoint, Excel), 'image' or 'other' (anything else: a video, a sound, an archive...). */
export function sourceFileKind(file) {
  if (isPdf(file)) return 'pdf';
  if (IMAGE_TYPES.has(String(file.type || '').toLowerCase()) || (!file.type && IMAGE_EXTENSIONS.has(extensionOf(file.name)))) return 'image';
  if (officeKindOf({ mimeType: file.type || '', name: file.name || '' })) return 'office';
  return isPlainText(file) ? 'text' : 'other';
}

const clean = (text) => String(text ?? '').replace(/\r\n?/g, '\n').replaceAll(String.fromCharCode(0), '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();

/**
 * Takes a File as a source. Gives { ok: true, title, mime, size, text, truncated, original } or { ok: false, code } with code 'too_big' or 'empty' (a file with nothing in it, or a text with only
 * spaces). Text and code are read as text (`original` false: the text is the source). Anything else - a PDF, a Word, PowerPoint or Excel file, a picture, a video, a sound - is kept as it is
 * (`original` true, no text here): it goes to the model the way an attachment of a chat does, which reads it itself, or has it turned into text or a PDF when it cannot.
 */
export async function readSourceFile(file) {
  if (!file.size && sourceFileKind(file) !== 'text') return { ok: false, code: 'empty' };
  if (file.size > PROJECT_SOURCE_FILE_MAX_BYTES) return { ok: false, code: 'too_big' };
  const base = { title: String(file.name || '').slice(0, 120), mime: String(file.type || ''), size: Number(file.size) || 0 };
  if (sourceFileKind(file) !== 'text') return { ok: true, ...base, text: '', truncated: false, original: true };
  let text;
  try {
    text = clean(await file.text());
  } catch {
    return { ok: false, code: 'unreadable' };
  }
  if (!text) return { ok: false, code: 'empty' };
  return { ok: true, ...base, size: base.size || text.length, text: text.slice(0, PROJECT_SOURCE_CHARS_MAX), truncated: text.length > PROJECT_SOURCE_CHARS_MAX, original: false };
}
