// The text of the files of a project for a reply the server makes (docs/superpowers/specs/2026-10-31-projects-design.md, §16): a file that came with its text is given as it is; any other is
// read from the person's own folder of the cloud storage (the page keeps the originals there when the person has a cloud account), and turned into text with the same code the page uses
// (src/app/runtime/projects/project-file-text.js; pdf.js here, the reader of the Word, PowerPoint and Excel files of the attachments). What was read stays in memory for a while (by the hash of
// the bytes, for the person it was read for), so the next reply does not read the same file again.

import { extractProjectFileText } from '../src/app/runtime/projects/project-file-text.js';
import { createServerOfficeReader } from './office-deps.js';

const CACHE_FILES = 40;
const CACHE_CHARS = 20_000_000;
const cache = new Map();
let cached = 0;
const remember = (key, text) => {
  cache.set(key, text);
  cached += text.length;
  while ((cache.size > CACHE_FILES || cached > CACHE_CHARS) && cache.size) {
    const oldest = cache.keys().next().value;
    cached -= cache.get(oldest).length;
    cache.delete(oldest);
  }
};
export const clearProjectFileTextCache = () => { cache.clear(); cached = 0; };

const getPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');

/**
 * Returns `readText(entry)` for one reply: `entry` is a file of `tools.projectFiles` ({ text } or { file: { hash, mimeType, name } }). `files` is the file store (server/file-store.js).
 */
export function createProjectFileTextReader({ files, userId, signal, officeReaderFor = createServerOfficeReader }) {
  let office = null;
  return async (entry) => {
    if (typeof entry.text === 'string') return entry.text;
    const file = entry.file;
    if (!file?.hash || !files || !userId) throw new Error('The file cannot be read here.');
    const key = `${userId}:${file.hash}`;
    if (cache.has(key)) return cache.get(key);
    const bytes = await files.load({ userId, marker: { __astraCloudAsset: { path: `${userId}/${file.hash}`, mimeType: file.mimeType || '', encoding: 'base64' } } });
    office ||= officeReaderFor({ userId, signal });
    const text = await extractProjectFileText({ bytes, name: file.name || entry.name, mime: file.mimeType || '', getPdfjs, officeReader: office });
    remember(key, text);
    return text;
  };
}
