// The tools a reply is given for a person's Notion when it is reached through Noureon's own connection (server/notion/oauth.js), made out of Notion's REST API
// (docs/superpowers/specs/2026-10-11-notion-public-oauth-design.md, §5). They have the shape of the tools of a connector (a name, a description, the inputs, read or write), so the
// tool loader (server/mcp/tool-loader.js), the person's settings for each tool and the card that asks before a tool runs serve them like the tools of any connector.
// What Notion answers is long and full of structure: it is cut down to plain text for the model, and what the model writes goes back as simple blocks (headings, lists,
// to-dos, quotes, code, paragraphs). The names here are the ones the catalog (src/data/connector-catalog.js, REST_CONNECTORS) says read or write; a test keeps the two together.
// A person's Noureon connection sees only the pages they shared with it in Notion: a page that was not shared is "not found" to the connection, and the answer says how to share it.

import { NotionError, NOTION_VERSION } from './oauth.js';

const API = 'https://api.notion.com/v1';
const TIMEOUT_MS = 20_000;
const MAX_RESULT_CHARS = 24_000;
const MAX_BLOCKS_READ = 300;
const MAX_BLOCKS_WRITE = 300;
const BLOCKS_PER_REQUEST = 100;
const RICH_TEXT_CHARS = 2000;
const MAX_RETRY_WAIT_MS = 3000;

const ID_PATTERN = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;
const idSchema = (what) => ({ type: 'string', description: `${what}: its id, or the address of the page in Notion.` });

/** The tools, in the order a person sees them. `kind` is what the catalog says too. */
export const NOTION_TOOLS = Object.freeze([
  { name: 'notion_search', kind: 'read', description: 'Search the pages and databases the user shared with Noureon in Notion, by words in their title. Returns the title, address, id and last edit of each match. With no query it lists the most recently edited.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for in titles. Leave out to list recent items.' }, filter: { type: 'string', enum: ['page', 'database'], description: 'Only pages or only databases.' }, page_size: { type: 'integer', minimum: 1, maximum: 20 } } } },
  { name: 'notion_get_page', kind: 'read', description: 'Read the properties of one page (its title, address, and the values of its properties). To read what is written on the page use notion_get_page_content.', inputSchema: { type: 'object', properties: { page_id: idSchema('The page') }, required: ['page_id'] } },
  { name: 'notion_get_page_content', kind: 'read', description: 'Read what is written on a page, as plain text with simple marks (# headings, - lists, [ ] to-dos, > quotes, code). Long pages are cut.', inputSchema: { type: 'object', properties: { page_id: idSchema('The page'), max_blocks: { type: 'integer', minimum: 1, maximum: MAX_BLOCKS_READ, description: 'How many blocks to read at most (default 100).' } }, required: ['page_id'] } },
  { name: 'notion_get_database', kind: 'read', description: 'Read the structure of a database: its title and its properties (name, type, and the options of selects). Use it before querying or adding to a database.', inputSchema: { type: 'object', properties: { database_id: idSchema('The database') }, required: ['database_id'] } },
  { name: 'notion_query_database', kind: 'read', description: 'List the rows (pages) of a database, with their properties. `filter` and `sorts` are Notion\'s own query format (see the structure of the database for the property names).', inputSchema: { type: 'object', properties: { database_id: idSchema('The database'), filter: { type: 'object', description: 'A Notion filter, for example {"property":"Status","status":{"equals":"In progress"}}.' }, sorts: { type: 'array', items: { type: 'object' }, description: 'A Notion sorts list, for example [{"property":"Due","direction":"ascending"}].' }, page_size: { type: 'integer', minimum: 1, maximum: 50 } }, required: ['database_id'] } },
  { name: 'notion_get_comments', kind: 'read', description: 'Read the open comments on a page (or a block).', inputSchema: { type: 'object', properties: { block_id: idSchema('The page or block') }, required: ['block_id'] } },
  { name: 'notion_create_page', kind: 'write', description: 'Create a page, under a page (`parent_page_id`) or as a row of a database (`parent_database_id`). `content` is the text of the page in simple Markdown (# headings, - lists, [ ] to-dos, > quotes, code fences, paragraphs). For a database, `properties` are Notion property values by property name, for example {"Status":{"status":{"name":"Todo"}}}; the title goes in `title`.', inputSchema: { type: 'object', properties: { parent_page_id: idSchema('The page to create it under'), parent_database_id: idSchema('The database to add it to'), title: { type: 'string' }, content: { type: 'string' }, properties: { type: 'object' } }, required: ['title'] } },
  { name: 'notion_update_page', kind: 'write', description: 'Change the properties of a page (Notion property values by property name, for example {"Status":{"status":{"name":"Done"}}}), or archive it (`archived`: true; false restores it).', inputSchema: { type: 'object', properties: { page_id: idSchema('The page'), properties: { type: 'object' }, archived: { type: 'boolean' } }, required: ['page_id'] } },
  { name: 'notion_append_content', kind: 'write', description: 'Add text at the end of a page, in simple Markdown (# headings, - lists, [ ] to-dos, > quotes, code fences, paragraphs).', inputSchema: { type: 'object', properties: { page_id: idSchema('The page (or block) to add to'), content: { type: 'string' } }, required: ['page_id', 'content'] } },
  { name: 'notion_create_comment', kind: 'write', description: 'Add a comment to a page.', inputSchema: { type: 'object', properties: { page_id: idSchema('The page'), text: { type: 'string' } }, required: ['page_id', 'text'] } }
].map((tool) => Object.freeze(tool)));

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clip = (text, limit) => (String(text).length > limit ? `${String(text).slice(0, limit - 1)}…` : String(text));

/** The id in what the model gave (an id with or without dashes, or an address of Notion), in the form Notion writes it; '' when there is none. */
export function normalizeId(value) {
  const match = ID_PATTERN.exec(String(value || ''));
  if (!match) return '';
  const hex = match[0].replace(/-/g, '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ----- from Notion to text

const plain = (richText) => (Array.isArray(richText) ? richText.map((item) => item?.plain_text ?? item?.text?.content ?? '').join('') : '');

/** The text of one property value of a page, for the model. */
export function propertyText(property) {
  if (!isObject(property)) return '';
  const value = property[property.type];
  switch (property.type) {
    case 'title': case 'rich_text': return plain(value);
    case 'number': return value === null || value === undefined ? '' : String(value);
    case 'select': case 'status': return value?.name || '';
    case 'multi_select': return Array.isArray(value) ? value.map((item) => item?.name).filter(Boolean).join(', ') : '';
    case 'date': return value?.start ? `${value.start}${value.end ? ` → ${value.end}` : ''}` : '';
    case 'checkbox': return value ? 'yes' : 'no';
    case 'url': case 'email': case 'phone_number': return value || '';
    case 'people': return Array.isArray(value) ? value.map((person) => person?.name || person?.id).filter(Boolean).join(', ') : '';
    case 'relation': return Array.isArray(value) ? value.map((item) => item?.id).filter(Boolean).join(', ') : '';
    case 'files': return Array.isArray(value) ? value.map((file) => file?.name).filter(Boolean).join(', ') : '';
    case 'formula': return value ? String(value[value.type] ?? '') : '';
    case 'created_time': case 'last_edited_time': return typeof value === 'string' ? value : '';
    case 'unique_id': return value ? `${value.prefix ? `${value.prefix}-` : ''}${value.number}` : '';
    default: return `[${property.type}]`;
  }
}

const titleOf = (object) => {
  if (object?.object === 'database') return plain(object.title) || '(untitled)';
  const properties = isObject(object?.properties) ? Object.values(object.properties) : [];
  const title = properties.find((property) => property?.type === 'title');
  return plain(title?.title) || '(untitled)';
};
const propertyLines = (page) => Object.entries(isObject(page?.properties) ? page.properties : {})
  .filter(([, property]) => property?.type !== 'title')
  .map(([name, property]) => ({ name, value: propertyText(property) }))
  .filter((entry) => entry.value !== '')
  .map((entry) => `${entry.name}: ${clip(entry.value, 300)}`);
const summaryLine = (object) => `- [${object.object}] ${titleOf(object)} — ${object.url || ''} — id ${object.id}${object.last_edited_time ? ` — edited ${object.last_edited_time}` : ''}`;

/** The blocks of a page as plain text with simple marks; `children(block)` has the blocks under a block (already read, by id). */
export function blocksToText(blocks, childrenOf = () => [], depth = 0) {
  const lines = [];
  const indent = '  '.repeat(depth);
  for (const block of blocks) {
    const data = block?.[block?.type] || {};
    const text = plain(data.rich_text);
    let line;
    switch (block?.type) {
      case 'paragraph': line = text; break;
      case 'heading_1': line = `# ${text}`; break;
      case 'heading_2': line = `## ${text}`; break;
      case 'heading_3': line = `### ${text}`; break;
      case 'bulleted_list_item': case 'toggle': line = `- ${text}`; break;
      case 'numbered_list_item': line = `1. ${text}`; break;
      case 'to_do': line = `- [${data.checked ? 'x' : ' '}] ${text}`; break;
      case 'quote': line = `> ${text}`; break;
      case 'callout': line = `> ${data.icon?.emoji ? `${data.icon.emoji} ` : ''}${text}`; break;
      case 'code': line = `\`\`\`${data.language && data.language !== 'plain text' ? data.language : ''}\n${text}\n\`\`\``; break;
      case 'divider': line = '---'; break;
      case 'child_page': line = `[page] ${data.title || ''} (id ${block.id})`; break;
      case 'child_database': line = `[database] ${data.title || ''} (id ${block.id})`; break;
      case 'equation': line = `$$${data.expression || ''}$$`; break;
      case 'bookmark': case 'embed': case 'link_preview': line = `[${block.type}] ${data.url || ''}`; break;
      case 'image': case 'file': case 'pdf': case 'video': case 'audio': line = `[${block.type}] ${plain(data.caption) || data.name || ''}`.trim(); break;
      case 'table_row': line = Array.isArray(data.cells) ? `| ${data.cells.map((cell) => plain(cell)).join(' | ')} |` : ''; break;
      case 'column_list': case 'column': case 'table': case 'synced_block': line = null; break;
      default: line = `[${block?.type || 'unknown'}]`;
    }
    if (line !== null && line !== undefined) lines.push(...String(line).split('\n').map((part) => `${indent}${part}`));
    const below = childrenOf(block);
    if (below.length) {
      const inner = blocksToText(below, childrenOf, line === null ? depth : depth + 1);
      if (inner) lines.push(inner);
    }
  }
  return lines.join('\n');
}

// ----- from text to Notion

const CODE_LANGUAGES = new Set(['javascript', 'typescript', 'python', 'json', 'bash', 'shell', 'html', 'css', 'sql', 'java', 'go', 'rust', 'markdown', 'yaml', 'c', 'c++', 'c#', 'php', 'ruby', 'swift', 'kotlin']);
const LANGUAGE_ALIASES = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', zsh: 'bash', yml: 'yaml', md: 'markdown', rb: 'ruby', rs: 'rust', golang: 'go', cpp: 'c++', cs: 'c#' };
const richText = (text) => {
  const value = String(text);
  if (!value) return [];
  const parts = [];
  for (let at = 0; at < value.length; at += RICH_TEXT_CHARS) parts.push({ type: 'text', text: { content: value.slice(at, at + RICH_TEXT_CHARS) } });
  return parts;
};
const block = (type, text, extra = {}) => ({ object: 'block', type, [type]: { rich_text: richText(text), ...extra } });

/** Simple Markdown as the blocks of Notion: headings (#, ##, ###), - lists, 1. lists, - [ ] to-dos, > quotes, code fences, --- and paragraphs. At most `max` blocks. */
export function textToBlocks(markdown, max = MAX_BLOCKS_WRITE) {
  const blocks = [];
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length && blocks.length < max; index += 1) {
    const line = lines[index];
    const fence = /^```\s*([A-Za-z0-9+#-]*)\s*$/.exec(line);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      const raw = fence[1].toLowerCase();
      const language = LANGUAGE_ALIASES[raw] || raw;
      blocks.push(block('code', code.join('\n'), { language: CODE_LANGUAGES.has(language) ? language : 'plain text' }));
      continue;
    }
    if (!line.trim()) continue;
    let match;
    if ((match = /^(#{1,3})\s+(.*)$/.exec(line))) blocks.push(block(`heading_${match[1].length}`, match[2]));
    else if ((match = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line))) blocks.push(block('to_do', match[2], { checked: match[1] !== ' ' }));
    else if ((match = /^\s*[-*+]\s+(.*)$/.exec(line))) blocks.push(block('bulleted_list_item', match[1]));
    else if ((match = /^\s*\d+[.)]\s+(.*)$/.exec(line))) blocks.push(block('numbered_list_item', match[1]));
    else if ((match = /^>\s?(.*)$/.exec(line))) blocks.push(block('quote', match[1]));
    else if (/^\s*([-*_])\1\1+\s*$/.test(line)) blocks.push({ object: 'block', type: 'divider', divider: {} });
    else blocks.push(block('paragraph', line.trim()));
  }
  return blocks;
}

// ----- the calls

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const NOT_SHARED = 'Notion says it cannot find that. The page or database may not be shared with Noureon: in Notion, open it, choose the ••• menu at the top right, then Connections, and add Noureon (the pages under a shared page are shared with it).';

/**
 * `oauth`: server/notion/oauth.js (it gives the access token of a person and is told when Notion no longer accepts it). Returns { definitions, call(userId, name, args, { signal }) }:
 * `call` resolves { text, isError, images: 0 }; a problem with the inputs or with a page is the text of an error the model can read; a login that Notion no longer accepts throws a NotionError
 * ('unauthorized' or 'not_connected').
 */
export function createNotionTools({ oauth, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  async function api(userId, method, path, { query, body, signal } = {}) {
    const token = await oauth.accessToken(userId);
    const url = new URL(`${API}${path}`);
    for (const [name, value] of Object.entries(query || {})) if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      try {
        const timer = AbortSignal.timeout(TIMEOUT_MS);
        response = await fetchImpl(url, {
          method,
          redirect: 'error',
          headers: { authorization: `Bearer ${token}`, 'notion-version': NOTION_VERSION, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: signal ? AbortSignal.any([signal, timer]) : timer
        });
      } catch {
        throw new ApiError(0, 'unreachable', 'Notion could not be reached.');
      }
      if (response.status === 429 && attempt === 0) {
        const wait = Number(response.headers.get('retry-after'));
        await sleep(Math.min(MAX_RETRY_WAIT_MS, Number.isFinite(wait) && wait > 0 ? wait * 1000 : 1000));
        continue;
      }
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (response.ok) return data;
      if (response.status === 401) {
        await oauth.markExpired(userId).catch(() => {});
        throw new NotionError('unauthorized', 'Notion no longer accepts the login.');
      }
      throw new ApiError(response.status, typeof data?.code === 'string' ? data.code : '', typeof data?.message === 'string' ? data.message : '');
    }
    throw new ApiError(429, 'rate_limited', 'Notion asked to slow down.');
  }

  const needId = (value, name) => {
    const id = normalizeId(value);
    if (!id) throw new ApiError(0, 'bad_input', `\`${name}\` must be the id of a page or database in Notion, or its address.`);
    return id;
  };
  const needText = (value, name, limit = 20_000) => {
    if (typeof value !== 'string' || !value.trim()) throw new ApiError(0, 'bad_input', `\`${name}\` is needed and must be text.`);
    return clip(value, limit);
  };
  const wholeNumber = (value, fallback, low, high) => {
    const number = Number(value);
    return Number.isInteger(number) ? Math.min(high, Math.max(low, number)) : fallback;
  };

  // The blocks of a page, a few levels deep, at most `cap` of them.
  async function readBlocks(userId, id, cap, signal) {
    const byParent = new Map();
    let count = 0;
    let cut = false;
    async function load(parent, depth) {
      let cursor;
      const found = [];
      do {
        const data = await api(userId, 'GET', `/blocks/${parent}/children`, { query: { page_size: Math.min(100, cap - count), start_cursor: cursor }, signal });
        for (const item of Array.isArray(data?.results) ? data.results : []) {
          if (count >= cap) {
            cut = true;
            break;
          }
          count += 1;
          found.push(item);
        }
        cursor = data?.has_more && count < cap ? data.next_cursor : null;
        if (data?.has_more && count >= cap) cut = true;
      } while (cursor);
      byParent.set(parent, found);
      if (depth < 2) for (const item of found) if (item.has_children && count < cap) await load(item.id, depth + 1);
    }
    await load(id, 0);
    return { top: byParent.get(id) || [], childrenOf: (item) => byParent.get(item.id) || [], cut };
  }

  async function appendBlocks(userId, parentId, blocks, signal) {
    for (let at = 0; at < blocks.length; at += BLOCKS_PER_REQUEST) await api(userId, 'PATCH', `/blocks/${parentId}/children`, { body: { children: blocks.slice(at, at + BLOCKS_PER_REQUEST) }, signal });
  }

  const handlers = {
    async notion_search(userId, args, signal) {
      const body = { page_size: wholeNumber(args.page_size, 10, 1, 20), sort: { direction: 'descending', timestamp: 'last_edited_time' } };
      if (typeof args.query === 'string' && args.query.trim()) body.query = clip(args.query.trim(), 200);
      if (args.filter === 'page' || args.filter === 'database') body.filter = { property: 'object', value: args.filter };
      const data = await api(userId, 'POST', '/search', { body, signal });
      const results = Array.isArray(data?.results) ? data.results : [];
      return results.length ? `${results.length} result(s)${data?.has_more ? ' (there are more; narrow the words)' : ''}:\n${results.map(summaryLine).join('\n')}` : 'Nothing found. Only what the user shared with Noureon in Notion can be found.';
    },
    async notion_get_page(userId, args, signal) {
      const page = await api(userId, 'GET', `/pages/${needId(args.page_id, 'page_id')}`, { signal });
      return [`${titleOf(page)}`, `address: ${page.url || ''}`, `id: ${page.id}`, `parent: ${page.parent?.type || ''}${page.archived ? ' (archived)' : ''}`, `last edited: ${page.last_edited_time || ''}`, ...propertyLines(page)].join('\n');
    },
    async notion_get_page_content(userId, args, signal) {
      const id = needId(args.page_id, 'page_id');
      const { top, childrenOf, cut } = await readBlocks(userId, id, wholeNumber(args.max_blocks, 100, 1, MAX_BLOCKS_READ), signal);
      const text = blocksToText(top, childrenOf);
      return `${text || '(the page is empty)'}${cut ? '\n(The page is longer: only the beginning is shown.)' : ''}`;
    },
    async notion_get_database(userId, args, signal) {
      const database = await api(userId, 'GET', `/databases/${needId(args.database_id, 'database_id')}`, { signal });
      const lines = Object.entries(isObject(database.properties) ? database.properties : {}).map(([name, property]) => {
        const options = property?.[property.type]?.options;
        return `- ${name} (${property.type})${Array.isArray(options) && options.length ? `: ${options.map((option) => option.name).join(', ')}` : ''}`;
      });
      return [`${titleOf(database)}`, `address: ${database.url || ''}`, `id: ${database.id}`, 'properties:', ...lines].join('\n');
    },
    async notion_query_database(userId, args, signal) {
      const body = { page_size: wholeNumber(args.page_size, 20, 1, 50) };
      if (args.filter !== undefined) {
        if (!isObject(args.filter)) throw new ApiError(0, 'bad_input', '`filter` must be an object in Notion\'s filter format.');
        body.filter = args.filter;
      }
      if (args.sorts !== undefined) {
        if (!Array.isArray(args.sorts)) throw new ApiError(0, 'bad_input', '`sorts` must be a list in Notion\'s sorts format.');
        body.sorts = args.sorts.slice(0, 5);
      }
      const data = await api(userId, 'POST', `/databases/${needId(args.database_id, 'database_id')}/query`, { body, signal });
      const rows = Array.isArray(data?.results) ? data.results : [];
      if (!rows.length) return 'No rows.';
      return `${rows.length} row(s)${data?.has_more ? ' (there are more)' : ''}:\n${rows.map((row) => [`- ${titleOf(row)} — ${row.url || ''} — id ${row.id}`, ...propertyLines(row).map((line) => `    ${line}`)].join('\n')).join('\n')}`;
    },
    async notion_get_comments(userId, args, signal) {
      const data = await api(userId, 'GET', '/comments', { query: { block_id: needId(args.block_id, 'block_id'), page_size: 50 }, signal });
      const comments = Array.isArray(data?.results) ? data.results : [];
      return comments.length ? comments.map((comment) => `- ${comment.created_time || ''}: ${plain(comment.rich_text)}`).join('\n') : 'No comments.';
    },
    async notion_create_page(userId, args, signal) {
      const title = needText(args.title, 'title', 1000);
      const hasPage = args.parent_page_id !== undefined && args.parent_page_id !== null && args.parent_page_id !== '';
      const hasDatabase = args.parent_database_id !== undefined && args.parent_database_id !== null && args.parent_database_id !== '';
      if (hasPage === hasDatabase) throw new ApiError(0, 'bad_input', 'Give exactly one of `parent_page_id` and `parent_database_id`.');
      if (args.properties !== undefined && !isObject(args.properties)) throw new ApiError(0, 'bad_input', '`properties` must be an object of Notion property values by property name.');
      const blocks = args.content === undefined ? [] : textToBlocks(needText(args.content, 'content', 60_000));
      let body;
      if (hasPage) body = { parent: { page_id: needId(args.parent_page_id, 'parent_page_id') }, properties: { title: { title: richText(title) } } };
      else {
        const databaseId = needId(args.parent_database_id, 'parent_database_id');
        const database = await api(userId, 'GET', `/databases/${databaseId}`, { signal });
        const titleName = Object.entries(isObject(database.properties) ? database.properties : {}).find(([, property]) => property?.type === 'title')?.[0] || 'Name';
        body = { parent: { database_id: databaseId }, properties: { ...(args.properties || {}), [titleName]: { title: richText(title) } } };
      }
      if (hasPage && args.properties) body.properties = { ...args.properties, ...body.properties };
      if (blocks.length) body.children = blocks.slice(0, BLOCKS_PER_REQUEST);
      const page = await api(userId, 'POST', '/pages', { body, signal });
      if (blocks.length > BLOCKS_PER_REQUEST) await appendBlocks(userId, page.id, blocks.slice(BLOCKS_PER_REQUEST), signal);
      return `Created the page "${titleOf(page)}": ${page.url || ''} (id ${page.id}).`;
    },
    async notion_update_page(userId, args, signal) {
      const id = needId(args.page_id, 'page_id');
      const body = {};
      if (args.properties !== undefined) {
        if (!isObject(args.properties)) throw new ApiError(0, 'bad_input', '`properties` must be an object of Notion property values by property name.');
        body.properties = args.properties;
      }
      if (typeof args.archived === 'boolean') body.archived = args.archived;
      if (!Object.keys(body).length) throw new ApiError(0, 'bad_input', 'Give `properties` or `archived`.');
      const page = await api(userId, 'PATCH', `/pages/${id}`, { body, signal });
      return `Updated the page "${titleOf(page)}": ${page.url || ''}${page.archived ? ' (archived)' : ''}.`;
    },
    async notion_append_content(userId, args, signal) {
      const id = needId(args.page_id, 'page_id');
      if (typeof args.content === 'string' && !args.content.trim()) throw new ApiError(0, 'bad_input', '`content` has nothing to add.');
      const blocks = textToBlocks(needText(args.content, 'content', 60_000));
      if (!blocks.length) throw new ApiError(0, 'bad_input', '`content` has nothing to add.');
      await appendBlocks(userId, id, blocks, signal);
      return `Added ${blocks.length} block(s) at the end of the page.`;
    },
    async notion_create_comment(userId, args, signal) {
      const text = needText(args.text, 'text', 4000);
      await api(userId, 'POST', '/comments', { body: { parent: { page_id: needId(args.page_id, 'page_id') }, rich_text: richText(text) }, signal });
      return 'Added the comment.';
    }
  };

  return {
    definitions: NOTION_TOOLS,
    async call(userId, name, args, { signal } = {}) {
      const handler = handlers[name];
      if (!handler) return { text: `There is no tool called "${name}".`, isError: true, images: 0 };
      try {
        const text = await handler(userId, isObject(args) ? args : {}, signal);
        return { text: clip(text, MAX_RESULT_CHARS), isError: false, images: 0 };
      } catch (error) {
        if (error instanceof NotionError) throw error;
        if (!(error instanceof ApiError)) throw error;
        if (error.code === 'bad_input') return { text: error.message, isError: true, images: 0 };
        if (error.status === 404 || error.status === 403 || error.code === 'object_not_found' || error.code === 'restricted_resource') return { text: NOT_SHARED, isError: true, images: 0 };
        if (error.status === 429) return { text: 'Notion asked to slow down. Wait a little and try again.', isError: true, images: 0 };
        if (error.status === 400 || error.status === 409) return { text: `Notion refused the request: ${clip(error.message || error.code || 'invalid request', 400)}`, isError: true, images: 0 };
        return { text: 'Notion could not do that now.', isError: true, images: 0 };
      }
    }
  };
}
