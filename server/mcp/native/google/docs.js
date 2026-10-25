// Google Docs (https://developers.google.com/docs/api/reference/rest): reading a document as text, making one, adding text at its end, replacing text.

import { ToolFailure } from '../api.js';
import { boolArg, fit, idArg, idPart, textArg } from '../inputs.js';

const BASE = 'https://docs.googleapis.com/v1/documents';
const link = (id) => `https://docs.google.com/document/d/${id}/edit`;

const paragraphText = (paragraph) => (paragraph.elements || []).map((element) => element.textRun?.content || '').join('').replace(/\n$/, '');

/** The words of a document body as plain text: headings with #, list items with -, the cells of a table separated by tabs. */
export function documentText(content) {
  const lines = [];
  for (const item of content || []) {
    if (item.paragraph) {
      const text = paragraphText(item.paragraph);
      const style = item.paragraph.paragraphStyle?.namedStyleType || '';
      const level = style === 'TITLE' ? 1 : Number(/^HEADING_(\d)$/.exec(style)?.[1] || 0);
      if (level) lines.push(`${'#'.repeat(level)} ${text}`);
      else lines.push(item.paragraph.bullet ? `- ${text}` : text);
    } else if (item.table) {
      for (const row of item.table.tableRows || []) lines.push((row.tableCells || []).map((cell) => documentText(cell.content).replace(/\n+/g, ' ').trim()).join('\t'));
    }
  }
  return lines.join('\n');
}

const batch = (id, requests, call) => call('POST', `${BASE}/${idPart(id)}:batchUpdate`, { json: { requests } });

export const docsTools = [
  {
    name: 'docs_get_document',
    description: 'Read a Google Doc as plain text (headings marked with #, lists with -, tables with tabs). A long document is cut.',
    inputSchema: { type: 'object', properties: { document_id: { type: 'string', description: 'The id in the address: docs.google.com/document/d/<id>/edit' } }, required: ['document_id'] },
    async run(args, call) {
      const data = await call('GET', `${BASE}/${idPart(idArg(args, 'document_id'))}`);
      return fit({ id: data.documentId, title: data.title || '', link: link(data.documentId), text: documentText(data.body?.content) }, 60_000);
    }
  },
  {
    name: 'docs_create_document',
    description: 'Create a new Google Doc in the user\'s Drive, with the given text as its content (plain text; the lines are paragraphs).',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string', description: 'The content to start with.' } }, required: ['title'] },
    async run(args, call) {
      const text = textArg(args, 'text', { max: 100_000 });
      const data = await call('POST', BASE, { json: { title: textArg(args, 'title', { required: true, max: 300 }) } });
      if (text) await batch(data.documentId, [{ insertText: { location: { index: 1 }, text } }], call);
      return { id: data.documentId, title: data.title || '', link: link(data.documentId) };
    }
  },
  {
    name: 'docs_append_text',
    description: 'Add text at the end of a Google Doc (plain text; start with a new line to begin a new paragraph).',
    inputSchema: { type: 'object', properties: { document_id: { type: 'string' }, text: { type: 'string' } }, required: ['document_id', 'text'] },
    async run(args, call) {
      const id = idArg(args, 'document_id');
      await batch(id, [{ insertText: { endOfSegmentLocation: {}, text: textArg(args, 'text', { required: true, max: 100_000 }) } }], call);
      return { appended: true, link: link(id) };
    }
  },
  {
    name: 'docs_replace_text',
    description: 'Replace every place a text is found in a Google Doc with another text.',
    inputSchema: { type: 'object', properties: { document_id: { type: 'string' }, find: { type: 'string' }, replace_with: { type: 'string' }, match_case: { type: 'boolean' } }, required: ['document_id', 'find', 'replace_with'] },
    async run(args, call) {
      const find = textArg(args, 'find', { required: true, max: 1000 });
      const data = await batch(idArg(args, 'document_id'), [{ replaceAllText: { containsText: { text: find, matchCase: boolArg(args, 'match_case') }, replaceText: textArg(args, 'replace_with', { max: 20_000 }) } }], call);
      const changed = data?.replies?.[0]?.replaceAllText?.occurrencesChanged;
      if (changed === undefined) throw new ToolFailure('Google did not say how many places changed.');
      return { places_changed: changed };
    }
  }
];
