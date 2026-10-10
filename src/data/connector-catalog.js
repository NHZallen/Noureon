// The official connectors (連接器, MCP: docs/superpowers/specs/2026-10-10-mcp-connectors-design.md): services a person logs in to, so that a reply may read and change
// what is theirs there. The list is the owner's (a person cannot add an address): each entry is a manifest, which the page shows (the names, the
// descriptions, the choice of a read-only login) and the server reads (where the service is, what to ask for when logging in, which of its tools
// only read). Both sides read this one file, so it may not use the browser (the server reaches it: scripts/server-shared-modules.json).

const LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
const ID = /^[a-z][a-z0-9-]{1,31}$/;

/** The groups the list is shown in, in this order (the words are in the page's texts, `connectors.category.<id>`). */
export const CONNECTOR_CATEGORIES = Object.freeze(['notes', 'dev']);

// `scopes`: what the login asks for. `readonly` and `readwrite` are the two kinds of login a person may choose when the service lets the login itself say
// it (Linear: the scope `read` alone gives a token that cannot write); a service with only `readwrite` gives one token for everything, and what a reply
// may do is then up to the person's settings for each tool (the page says so). `readOnlyService`: the service has nothing that changes anything.
// `reads`/`writes`: the tools we know (the name the service gives). Anything else is judged by `toolKind` below.
export const CONNECTORS = Object.freeze([
  Object.freeze({
    id: 'notion',
    name: 'Notion',
    category: 'notes',
    endpoint: 'https://mcp.notion.com/mcp',
    // How a client is made known to the service when the service takes both a registration and a metadata document: Notion shows on its consent screen the
    // name and the picture that a registration gave (and only the address of the redirect for a client known by a document), so it is registered first.
    registration: 'dcr',
    // The service names no scope of its own to ask for (its login announces only "default").
    scopes: Object.freeze({ readwrite: Object.freeze([]) }),
    description: Object.freeze({
      'zh-TW': '搜尋、讀取、建立與更新你的 Notion 頁面與資料庫。',
      en: 'Search, read, create and update your Notion pages and databases.',
      fr: 'Rechercher, lire, créer et modifier vos pages et bases de données Notion.',
      ru: 'Поиск, чтение, создание и изменение ваших страниц и баз данных Notion.',
      es: 'Busca, lee, crea y actualiza tus páginas y bases de datos de Notion.'
    }),
    reads: Object.freeze(['notion-search', 'notion-fetch', 'notion-get-comments', 'notion-get-teams', 'notion-get-users']),
    writes: Object.freeze(['notion-create-pages', 'notion-update-page', 'notion-move-pages', 'notion-duplicate-page', 'notion-create-database', 'notion-update-database', 'notion-create-comment'])
  }),
  Object.freeze({
    id: 'linear',
    name: 'Linear',
    category: 'notes',
    endpoint: 'https://mcp.linear.app/mcp',
    scopes: Object.freeze({ readonly: Object.freeze(['read']), readwrite: Object.freeze(['read', 'write']) }),
    description: Object.freeze({
      'zh-TW': '查詢議題、專案與週期；建立與更新議題、留言。',
      en: 'Look up issues, projects and cycles; create and update issues and comments.',
      fr: 'Consulter tickets, projets et cycles ; créer et modifier des tickets et des commentaires.',
      ru: 'Просмотр задач, проектов и циклов; создание и изменение задач и комментариев.',
      es: 'Consulta incidencias, proyectos y ciclos; crea y actualiza incidencias y comentarios.'
    }),
    // The names of the reading tools of Linear (list_issues, get_issue, ...) are told apart by `toolKind`.
    reads: Object.freeze([]),
    writes: Object.freeze(['create_issue', 'update_issue', 'save_issue', 'create_comment', 'delete_comment', 'create_project', 'update_project', 'save_project', 'create_issue_label', 'create_document', 'update_document'])
  })
]);

export const getConnector = (id) => CONNECTORS.find((connector) => connector.id === id) || null;
export const connectorDescription = (connector, language) => String(connector?.description?.[language] || connector?.description?.en || '');
/** Whether a service lets the login choose a read-only token (the page then offers the two kinds of login). */
export const hasReadonlyLogin = (connector) => Boolean(connector?.scopes?.readonly);
/** The scopes to ask for: `mode` is 'readonly' or 'readwrite' (a service with no read-only login always gets the second). */
export const loginScopes = (connector, mode) => [...(mode === 'readonly' && connector?.scopes?.readonly ? connector.scopes.readonly : connector?.scopes?.readwrite || [])];

// A tool is a "read" only when it is one we know reads or its name is one that a reading tool of the services has (get, list, search, fetch, read, find ...).
// A service may mark its own tools read only, but it can be wrong, so that mark is never trusted: what is not known to read is a "write", which by default asks.
const READING_WORDS = '(?:get|list|search|fetch|read|find|query|view|describe|lookup)(?:[-_]|$)';

/** 'read' or 'write' for a tool of a connector (by the tool's name only). */
export function toolKind(connector, toolName) {
  const name = String(toolName || '').toLowerCase();
  if (connector?.reads?.includes(name)) return 'read';
  if (connector?.writes?.includes(name)) return 'write';
  // The service's own name may come first (notion-search); no other word may, so `update-view` is a write.
  const own = String(connector?.id || '').replace(/[^a-z0-9]/g, '');
  return new RegExp(`^(?:${own}[-_])?${READING_WORDS}`).test(name) ? 'read' : 'write';
}

/** The states a tool may be in, and the one each kind starts with. */
export const TOOL_STATES = Object.freeze(['allow', 'ask', 'deny']);
export const DEFAULT_TOOL_STATE = Object.freeze({ read: 'allow', write: 'ask' });
export const defaultToolState = (connector, toolName) => DEFAULT_TOOL_STATE[toolKind(connector, toolName)];

/** Problems in an entry (the names of what is wrong); empty when it is right. Used by the tests. */
export function connectorProblems(connector) {
  const problems = [];
  if (!ID.test(String(connector?.id || ''))) problems.push('id');
  if (!String(connector?.name || '').trim()) problems.push('name');
  if (!CONNECTOR_CATEGORIES.includes(connector?.category)) problems.push('category');
  if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(String(connector?.endpoint || ''))) problems.push('endpoint');
  if (connector?.registration !== undefined && connector.registration !== 'dcr') problems.push('registration');
  if (!connector?.scopes?.readwrite) problems.push('scopes');
  if (!connector?.description || !LANGUAGES.every((language) => String(connector.description[language] || '').trim())) problems.push('description in the five languages');
  return problems;
}
