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
    // The logo: the picture of the project's owner on GitHub (the CLI tools have theirs the same way); the page shows the first letter while it is not there.
    icon: 'https://github.com/makenotion.png?size=96',
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
    details: Object.freeze({
      'zh-TW': '連接 Notion 後，模型可以在你允許的範圍內搜尋你的頁面與資料庫、讀取頁面內容，也能建立頁面、更新內容、新增留言。它只能看到你在登入時授權給它的工作空間內容；會修改資料的動作預設每次都先問你。',
      en: 'Once Notion is connected, the model can search your pages and databases, read the content of a page, and, where you allow it, create pages, update content and add comments. It sees only the workspace content you authorised when you logged in; an action that changes data asks you first by default.',
      fr: 'Une fois Notion connecté, le modèle peut chercher dans vos pages et vos bases de données, lire le contenu d’une page et, si vous l’autorisez, créer des pages, modifier du contenu et ajouter des commentaires. Il ne voit que le contenu de l’espace de travail que vous avez autorisé à la connexion ; une action qui modifie des données vous demande d’abord, par défaut.',
      ru: 'После подключения Notion модель может искать по вашим страницам и базам данных, читать содержимое страницы и, если вы разрешите, создавать страницы, менять содержимое и добавлять комментарии. Она видит только то содержимое рабочего пространства, которое вы разрешили при входе; действие, изменяющее данные, по умолчанию сначала спрашивает вас.',
      es: 'Una vez conectado Notion, el modelo puede buscar en tus páginas y bases de datos, leer el contenido de una página y, si lo permites, crear páginas, actualizar contenido y añadir comentarios. Solo ve el contenido del espacio de trabajo que autorizaste al iniciar sesión; una acción que cambia datos te pregunta antes, por defecto.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['在 Notion 搜尋上週的會議記錄，幫我整理成待辦清單', '把這段內容整理成一頁新的 Notion 頁面', '找出專案資料庫裡狀態是「進行中」的項目']),
      en: Object.freeze(['Search Notion for last week\'s meeting notes and turn them into a to-do list', 'Make a new Notion page from this text', 'Find the items in the project database whose status is "In progress"']),
      fr: Object.freeze(['Cherche dans Notion les notes de la réunion de la semaine dernière et transforme-les en liste de tâches', 'Crée une nouvelle page Notion à partir de ce texte', 'Trouve les éléments de la base de projets dont le statut est « En cours »']),
      ru: Object.freeze(['Найди в Notion заметки с прошлой встречи и преврати их в список дел', 'Создай новую страницу Notion из этого текста', 'Найди в базе проектов элементы со статусом «В работе»']),
      es: Object.freeze(['Busca en Notion las notas de la reunión de la semana pasada y conviértelas en una lista de tareas', 'Crea una página nueva de Notion con este texto', 'Encuentra los elementos de la base de proyectos cuyo estado es «En curso»'])
    }),
    reads: Object.freeze(['notion-search', 'notion-fetch', 'notion-get-comments', 'notion-get-teams', 'notion-get-users']),
    writes: Object.freeze(['notion-create-pages', 'notion-update-page', 'notion-move-pages', 'notion-duplicate-page', 'notion-create-database', 'notion-update-database', 'notion-create-comment'])
  }),
  Object.freeze({
    id: 'linear',
    name: 'Linear',
    category: 'notes',
    endpoint: 'https://mcp.linear.app/mcp',
    icon: 'https://github.com/linear.png?size=96',
    scopes: Object.freeze({ readonly: Object.freeze(['read']), readwrite: Object.freeze(['read', 'write']) }),
    description: Object.freeze({
      'zh-TW': '查詢議題、專案與週期；建立與更新議題、留言。',
      en: 'Look up issues, projects and cycles; create and update issues and comments.',
      fr: 'Consulter tickets, projets et cycles ; créer et modifier des tickets et des commentaires.',
      ru: 'Просмотр задач, проектов и циклов; создание и изменение задач и комментариев.',
      es: 'Consulta incidencias, proyectos y ciclos; crea y actualiza incidencias y comentarios.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 Linear 後，模型可以查詢你的議題、專案與週期，讀取議題內容與留言，也能建立議題、更新狀態與負責人、新增留言。會修改資料的動作預設每次都先問你；也可以選「唯讀連線」，讓這個連線本身就無法寫入。',
      en: 'Once Linear is connected, the model can look up your issues, projects and cycles, read the content and comments of an issue, and, where you allow it, create issues, update their status and assignee, and add comments. An action that changes data asks you first by default; you can also choose a read-only connection, which cannot write at all.',
      fr: 'Une fois Linear connecté, le modèle peut consulter vos tickets, projets et cycles, lire le contenu et les commentaires d’un ticket et, si vous l’autorisez, créer des tickets, modifier leur statut et leur responsable, et ajouter des commentaires. Une action qui modifie des données vous demande d’abord, par défaut ; vous pouvez aussi choisir une connexion en lecture seule, qui ne peut pas écrire du tout.',
      ru: 'После подключения Linear модель может просматривать ваши задачи, проекты и циклы, читать содержимое задач и комментарии и, если вы разрешите, создавать задачи, менять их статус и исполнителя, добавлять комментарии. Действие, изменяющее данные, по умолчанию сначала спрашивает вас; можно также выбрать подключение «только чтение», которое вообще не может записывать.',
      es: 'Una vez conectado Linear, el modelo puede consultar tus incidencias, proyectos y ciclos, leer el contenido y los comentarios de una incidencia y, si lo permites, crear incidencias, actualizar su estado y responsable y añadir comentarios. Una acción que cambia datos te pregunta antes, por defecto; también puedes elegir una conexión de solo lectura, que no puede escribir en absoluto.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['列出指派給我、還沒完成的議題', '幫我建立一個議題：登入頁面在 Safari 壞掉，優先度高', '這個週期還有哪些議題沒有負責人？']),
      en: Object.freeze(['List the unfinished issues assigned to me', 'Create an issue: the login page is broken in Safari, high priority', 'Which issues in this cycle have no assignee?']),
      fr: Object.freeze(['Liste les tickets non terminés qui me sont assignés', 'Crée un ticket : la page de connexion est cassée dans Safari, priorité haute', 'Quels tickets de ce cycle n’ont pas de responsable ?']),
      ru: Object.freeze(['Покажи незавершённые задачи, назначенные на меня', 'Создай задачу: страница входа не работает в Safari, высокий приоритет', 'Какие задачи этого цикла без исполнителя?']),
      es: Object.freeze(['Lista las incidencias sin terminar que tengo asignadas', 'Crea una incidencia: la página de inicio de sesión falla en Safari, prioridad alta', '¿Qué incidencias de este ciclo no tienen responsable?'])
    }),
    // The names of the reading tools of Linear (list_issues, get_issue, ...) are told apart by `toolKind`.
    reads: Object.freeze([]),
    writes: Object.freeze(['create_issue', 'update_issue', 'save_issue', 'create_comment', 'delete_comment', 'create_project', 'update_project', 'save_project', 'create_issue_label', 'create_document', 'update_document'])
  })
]);

export const getConnector = (id) => CONNECTORS.find((connector) => connector.id === id) || null;
export const connectorDescription = (connector, language) => String(connector?.description?.[language] || connector?.description?.en || '');
/** The longer words about what a connector does, and a few requests to try: shown when its row is opened. */
export const connectorDetails = (connector, language) => String(connector?.details?.[language] || connector?.details?.en || '');
export const connectorExamples = (connector, language) => [...(connector?.examples?.[language] || connector?.examples?.en || [])];
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
  if (!/^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\.png\?size=\d{2,3}$/.test(String(connector?.icon || ''))) problems.push('icon');
  if (connector?.registration !== undefined && connector.registration !== 'dcr') problems.push('registration');
  if (!connector?.scopes?.readwrite) problems.push('scopes');
  if (!connector?.description || !LANGUAGES.every((language) => String(connector.description[language] || '').trim())) problems.push('description in the five languages');
  if (!connector?.details || !LANGUAGES.every((language) => String(connector.details[language] || '').trim())) problems.push('details in the five languages');
  if (!connector?.examples || !LANGUAGES.every((language) => Array.isArray(connector.examples[language]) && connector.examples[language].length === 3 && connector.examples[language].every((example) => String(example || '').trim()))) problems.push('three examples in the five languages');
  return problems;
}
