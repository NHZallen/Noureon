// The files of Google Drive as sources of a project (docs/superpowers/specs/2026-10-31-projects-design.md, §13.2): the person's own Google connector (the Extensions page) does the reading, through
// the server (which keeps the login); the page only asks. Only what the connector reads as text is offered: a Google Doc, Slides or Sheet (a sheet as CSV, its first sheet) and plain text, markdown,
// CSV and JSON files. `call(tool, args)` is the page's read through the connector ({ ok, text, isError } or { ok: false, code }). Pure: nothing here touches the browser.

import { PROJECT_SOURCE_CHARS_MAX } from './project-source-model.js';

export const DRIVE_KINDS = Object.freeze({
  'application/vnd.google-apps.document': 'doc',
  'application/vnd.google-apps.presentation': 'slides',
  'application/vnd.google-apps.spreadsheet': 'sheet',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'text',
  'application/json': 'text'
});

const QUERY = `(${Object.keys(DRIVE_KINDS).map((type) => `mimeType = '${type}'`).join(' or ')})`;

const failed = (result) => (result?.code === 'not_connected' ? { ok: false, code: 'not_connected' } : { ok: false, code: 'failed' });

export function createDriveSource({ call }) {
  return {
    /** The latest readable files (the ones that match `text`, when given): { ok, files: [{ id, name, mimeType, kind, modifiedTime, size }] } or { ok: false, code }. */
    async search(text = '') {
      const result = await call('drive_search_files', { text: String(text || '').slice(0, 200), query: QUERY, max_results: 30 });
      if (!result?.ok || result.isError) return failed(result);
      let list;
      try { list = JSON.parse(result.text); } catch { return { ok: false, code: 'failed' }; }
      const files = (Array.isArray(list) ? list : []).filter((file) => file && typeof file.id === 'string' && DRIVE_KINDS[file.mimeType]).map((file) => ({
        id: file.id, name: String(file.name || ''), mimeType: file.mimeType, kind: DRIVE_KINDS[file.mimeType], modifiedTime: String(file.modifiedTime || ''), size: Number(file.size) || 0
      }));
      return { ok: true, files };
    },
    /** The text of one file as a source: { ok, title, mime, size, text, truncated } or { ok: false, code }. */
    async read(file) {
      const result = await call('drive_read_file', { file_id: file.id });
      if (!result?.ok || result.isError) return failed(result);
      // The tool puts the name and the type on the first line, and cuts a long text.
      const text = String(result.text).replace(/^[^\n]*\n\n/, '').trim();
      if (!text) return { ok: false, code: 'empty' };
      return { ok: true, title: file.name.slice(0, 120), mime: file.mimeType, size: text.length, text: text.slice(0, PROJECT_SOURCE_CHARS_MAX), truncated: text.length > PROJECT_SOURCE_CHARS_MAX };
    }
  };
}
