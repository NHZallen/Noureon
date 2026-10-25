// Google Drive (https://developers.google.com/drive/api/reference/rest/v3): finding and reading files, folders, renaming, moving, the bin, sharing.

import { ToolFailure } from '../api.js';
import { enumArg, fit, idArg, idPart, intArg, textArg, boolArg } from '../inputs.js';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const SHARED = { supportsAllDrives: 'true' };
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,size,webViewLink,parents,owners(displayName,emailAddress),trashed';
const MAX_READ_BYTES = 5 * 1024 * 1024;
// What a file of Google's own kinds is read as (Drive converts it), and the kinds of plain file that are text.
const EXPORTS = { 'application/vnd.google-apps.document': 'text/plain', 'application/vnd.google-apps.presentation': 'text/plain', 'application/vnd.google-apps.spreadsheet': 'text/csv' };
const TEXT_TYPE = /^(?:text\/|application\/(?:json|xml|x-yaml|yaml|javascript|x-sh|sql|csv)|application\/.+\+(?:json|xml))/;

const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function shape(file) {
  return {
    id: file.id,
    name: file.name,
    type: file.mimeType === FOLDER ? 'folder' : file.mimeType,
    ...(file.modifiedTime ? { modified: file.modifiedTime } : {}),
    ...(file.size ? { size: Number(file.size) } : {}),
    ...(file.owners?.[0] ? { owner: file.owners[0].emailAddress || file.owners[0].displayName } : {}),
    ...(file.parents?.[0] ? { parent_id: file.parents[0] } : {}),
    ...(file.trashed ? { in_bin: true } : {}),
    link: file.webViewLink || ''
  };
}

const parentOf = (args) => idArg(args, 'parent_id', { required: false });

export const driveTools = [
  {
    name: 'drive_search_files',
    description: 'Find files and folders in the user\'s Drive (not those in the bin), the most recently changed first. `text` looks in names and in the words inside files; `query` is a Drive search expression (for example name contains \'budget\' and mimeType = \'application/pdf\' and modifiedTime > \'2026-01-01T00:00:00\'; a folder\'s files: \'<folder id>\' in parents). With neither, the latest files.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, query: { type: 'string' }, max_results: { type: 'integer', description: '1 to 100, default 20.' } } },
    async run(args, call) {
      const parts = ['trashed = false'];
      const text = textArg(args, 'text', { max: 300 });
      const query = textArg(args, 'query', { max: 1000 });
      if (text) parts.push(`fullText contains ${quote(text)}`);
      if (query) parts.push(`(${query})`);
      const data = await call('GET', `${BASE}/files`, { query: { q: parts.join(' and '), orderBy: 'modifiedTime desc', pageSize: intArg(args, 'max_results', { max: 100, fallback: 20 }), fields: `files(${FILE_FIELDS})`, includeItemsFromAllDrives: 'true', ...SHARED } });
      return (data?.files || []).map(shape);
    }
  },
  {
    name: 'drive_get_file',
    description: 'Get what Drive knows of one file or folder: its name, type, owner, when it changed, where it is, its link.',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
    async run(args, call) {
      return shape(await call('GET', `${BASE}/files/${idPart(idArg(args, 'file_id'))}`, { query: { fields: FILE_FIELDS, ...SHARED } }));
    }
  },
  {
    name: 'drive_read_file',
    description: 'Read the text of a file: a Google Doc or Slides presentation as text, a Google Sheet as CSV (its first sheet; use the sheets tools for the rest), or a plain text, markdown, CSV, JSON or code file. Not pictures, PDFs or Office files. A long text is cut.',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
    async run(args, call) {
      const id = idArg(args, 'file_id');
      const file = await call('GET', `${BASE}/files/${idPart(id)}`, { query: { fields: 'id,name,mimeType,size', ...SHARED } });
      const exported = EXPORTS[file.mimeType];
      if (file.mimeType === FOLDER) throw new ToolFailure('That is a folder: list what is in it with drive_search_files.');
      if (!exported && !TEXT_TYPE.test(file.mimeType || '')) throw new ToolFailure(`This kind of file (${file.mimeType}) cannot be read as text.`);
      if (!exported && Number(file.size) > MAX_READ_BYTES) throw new ToolFailure('The file is too large to read.');
      const text = await call('GET', exported ? `${BASE}/files/${idPart(id)}/export` : `${BASE}/files/${idPart(id)}`, { query: exported ? { mimeType: exported } : { alt: 'media', ...SHARED }, as: 'text' });
      return fit(`${file.name} (${file.mimeType})\n\n${text}`, 60_000);
    }
  },
  {
    name: 'drive_create_folder',
    description: 'Create a folder in Drive (in the main "My Drive" unless a parent folder is given).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, parent_id: { type: 'string' } }, required: ['name'] },
    async run(args, call) {
      const parent = parentOf(args);
      return shape(await call('POST', `${BASE}/files`, { query: { fields: FILE_FIELDS, ...SHARED }, json: { name: textArg(args, 'name', { required: true, max: 300 }), mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) } }));
    }
  },
  {
    name: 'drive_create_text_file',
    description: 'Create a plain text file (text, markdown, CSV, JSON...) in Drive. For a Google Doc or Sheet use docs_create_document or sheets_create_spreadsheet.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'With its ending: notes.md' }, text: { type: 'string' }, mime_type: { type: 'string', enum: ['text/plain', 'text/markdown', 'text/csv', 'application/json'], description: 'Default text/plain.' }, parent_id: { type: 'string' } }, required: ['name', 'text'] },
    async run(args, call) {
      const type = enumArg(args, 'mime_type', ['text/plain', 'text/markdown', 'text/csv', 'application/json'], 'text/plain');
      const parent = parentOf(args);
      const meta = { name: textArg(args, 'name', { required: true, max: 300 }), mimeType: type, ...(parent ? { parents: [parent] } : {}) };
      const boundary = `noureon${Math.random().toString(36).slice(2, 14)}`;
      const body = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${type}; charset=UTF-8\r\n\r\n${textArg(args, 'text', { required: true, max: 1_000_000 })}\r\n--${boundary}--`;
      return shape(await call('POST', UPLOAD, { query: { uploadType: 'multipart', fields: FILE_FIELDS, ...SHARED }, body, headers: { 'content-type': `multipart/related; boundary=${boundary}` } }));
    }
  },
  {
    name: 'drive_rename_file',
    description: 'Rename a file or folder.',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' }, name: { type: 'string' } }, required: ['file_id', 'name'] },
    async run(args, call) {
      return shape(await call('PATCH', `${BASE}/files/${idPart(idArg(args, 'file_id'))}`, { query: { fields: FILE_FIELDS, ...SHARED }, json: { name: textArg(args, 'name', { required: true, max: 300 }) } }));
    }
  },
  {
    name: 'drive_move_file',
    description: 'Move a file or folder into another folder.',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' }, new_parent_id: { type: 'string', description: 'The folder to move it to (the id "root" is My Drive).' } }, required: ['file_id', 'new_parent_id'] },
    async run(args, call) {
      const id = idArg(args, 'file_id');
      const current = await call('GET', `${BASE}/files/${idPart(id)}`, { query: { fields: 'parents', ...SHARED } });
      return shape(await call('PATCH', `${BASE}/files/${idPart(id)}`, { query: { addParents: idArg(args, 'new_parent_id'), removeParents: (current?.parents || []).join(','), fields: FILE_FIELDS, ...SHARED }, json: {} }));
    }
  },
  {
    name: 'drive_trash_file',
    description: 'Move a file or folder to the bin (it can still be taken out of the bin by the user; nothing is deleted for good).',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
    async run(args, call) {
      return shape(await call('PATCH', `${BASE}/files/${idPart(idArg(args, 'file_id'))}`, { query: { fields: FILE_FIELDS, ...SHARED }, json: { trashed: true } }));
    }
  },
  {
    name: 'drive_share_file',
    description: 'Give a person (by email address) access to a file or folder.',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', enum: ['reader', 'commenter', 'writer'] }, notify: { type: 'boolean', description: 'Send the person an email. Default false.' } }, required: ['file_id', 'email', 'role'] },
    async run(args, call) {
      const email = textArg(args, 'email', { required: true, max: 200 });
      if (!/^[^\s<>,;"]+@[^\s<>,;"]+$/.test(email)) throw new ToolFailure('"email" is not an email address.');
      const role = enumArg(args, 'role', ['reader', 'commenter', 'writer']);
      if (!role) throw new ToolFailure('"role" is needed.');
      const data = await call('POST', `${BASE}/files/${idPart(idArg(args, 'file_id'))}/permissions`, { query: { sendNotificationEmail: String(boolArg(args, 'notify')), fields: 'id,role,type', ...SHARED }, json: { type: 'user', role, emailAddress: email } });
      return { shared_with: email, role: data?.role || '' };
    }
  }
];
