// The official connectors (連接器, MCP: docs/superpowers/specs/2026-10-10-mcp-connectors-design.md): services a person logs in to, so that a reply may read and change
// what is theirs there. The list is the owner's (a person cannot add an address): each entry is a manifest, which the page shows (the names, the
// descriptions, the choice of a read-only login) and the server reads (where the service is, what to ask for when logging in, which of its tools
// only read). Both sides read this one file, so it may not use the browser (the server reaches it: scripts/server-shared-modules.json).

const LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
const ID = /^[a-z][a-z0-9-]{1,31}$/;

/** The groups the list is shown in, in this order (the words are in the page's texts, `connectors.category.<id>`). */
export const CONNECTOR_CATEGORIES = Object.freeze(['notes', 'design', 'dev']);

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
  }),
  Object.freeze({
    id: 'context7',
    name: 'Context7',
    category: 'dev',
    endpoint: 'https://mcp.context7.com/mcp/oauth',
    icon: 'https://github.com/context7.png?size=96',
    // Context7 only looks up documentation: it has nothing that changes anything and does not touch the person's data. Its login (like Upstash's) announces these standard scopes; the refresh token is the reason to ask.
    scopes: Object.freeze({ readwrite: Object.freeze(['openid', 'profile', 'email', 'offline_access']) }),
    description: Object.freeze({
      'zh-TW': '查詢程式套件與框架的最新官方文件和範例程式碼。',
      en: 'Look up the current official documentation and code examples of libraries and frameworks.',
      fr: 'Consulter la documentation officielle à jour et des exemples de code de bibliothèques et de frameworks.',
      ru: 'Поиск актуальной официальной документации и примеров кода библиотек и фреймворков.',
      es: 'Consulta la documentación oficial actual y ejemplos de código de bibliotecas y frameworks.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 Context7 後，模型寫程式時可以查你用到的套件或框架「現在的版本」的官方文件與範例，不必只靠訓練時學到的舊資料。它只有查文件的工具，不會讀取或修改你的任何資料。',
      en: 'Once Context7 is connected, the model can look up the official documentation and examples for the version of a library or framework you use now, instead of relying on what it learned in training. It has only tools that look documentation up; it never reads or changes any of your data.',
      fr: 'Une fois Context7 connecté, le modèle peut consulter la documentation officielle et les exemples de la version actuelle d’une bibliothèque ou d’un framework que vous utilisez, au lieu de se fier à ce qu’il a appris à l’entraînement. Il n’a que des outils de consultation de documentation ; il ne lit ni ne modifie aucune de vos données.',
      ru: 'После подключения Context7 модель может смотреть официальную документацию и примеры для актуальной версии используемой вами библиотеки или фреймворка, а не полагаться на то, чему научилась при обучении. У него только инструменты поиска документации; ваши данные он не читает и не меняет.',
      es: 'Una vez conectado Context7, el modelo puede consultar la documentación oficial y los ejemplos de la versión actual de una biblioteca o framework que uses, en lugar de fiarse de lo aprendido en el entrenamiento. Solo tiene herramientas de consulta de documentación; no lee ni cambia ningún dato tuyo.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['用最新版 Next.js 的寫法，幫我做一個有登入保護的頁面', 'React 19 的 use 這個 hook 怎麼用？給我官方範例', 'Tailwind 4 的設定方式跟 3 差在哪？']),
      en: Object.freeze(['Write a page with login protection in the current Next.js way', 'How does the use hook of React 19 work? Show the official example', 'How does configuring Tailwind 4 differ from 3?']),
      fr: Object.freeze(['Écris une page protégée par connexion à la façon actuelle de Next.js', 'Comment fonctionne le hook use de React 19 ? Montre l’exemple officiel', 'En quoi la configuration de Tailwind 4 diffère-t-elle de la 3 ?']),
      ru: Object.freeze(['Напиши страницу с защитой входом так, как это делается в текущем Next.js', 'Как работает хук use в React 19? Покажи официальный пример', 'Чем настройка Tailwind 4 отличается от 3?']),
      es: Object.freeze(['Escribe una página con protección de acceso a la manera actual de Next.js', '¿Cómo funciona el hook use de React 19? Muestra el ejemplo oficial', '¿En qué se diferencia configurar Tailwind 4 de la 3?'])
    }),
    reads: Object.freeze(['resolve-library-id', 'get-library-docs', 'query-docs']),
    writes: Object.freeze([])
  }),
  Object.freeze({
    id: 'upstash',
    name: 'Upstash',
    category: 'dev',
    endpoint: 'https://mcp.upstash.com/mcp',
    icon: 'https://github.com/upstash.png?size=96',
    // Upstash has its own read-only switch on its login page (the person turns it on there if they want the connection to be unable to write); we do not ask for it, so the choice is not made for them.
    scopes: Object.freeze({ readwrite: Object.freeze(['openid', 'profile', 'email', 'offline_access']) }),
    description: Object.freeze({
      'zh-TW': '管理你的 Upstash Redis 資料庫：查看、查詢、備份與操作。',
      en: 'Manage your Upstash Redis databases: look, query, back up and operate.',
      fr: 'Gérer vos bases Redis Upstash : consulter, interroger, sauvegarder et exploiter.',
      ru: 'Управление вашими базами Redis в Upstash: просмотр, запросы, резервные копии и операции.',
      es: 'Gestiona tus bases de datos Redis de Upstash: consultar, ejecutar comandos, hacer copias y operar.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 Upstash 後，模型可以列出你的 Redis 資料庫、查看詳細資料與用量、執行 Redis 指令，也能建立或刪除資料庫、做備份。會修改或刪除資料的動作預設每次都先問你。Upstash 的登入頁有一個「唯讀」開關，想讓這個連線完全無法寫入的話，在那裡開啟即可；不開就是可讀寫。',
      en: 'Once Upstash is connected, the model can list your Redis databases, look at their details and usage, run Redis commands, and, where you allow it, create or delete databases and make backups. An action that changes or deletes data asks you first by default. Upstash\'s login page has a read-only switch: turn it on there if you want this connection to be unable to write; left off, the connection can read and write.',
      fr: 'Une fois Upstash connecté, le modèle peut lister vos bases Redis, consulter leurs détails et leur utilisation, exécuter des commandes Redis et, si vous l’autorisez, créer ou supprimer des bases et faire des sauvegardes. Une action qui modifie ou supprime des données vous demande d’abord, par défaut. La page de connexion d’Upstash a un interrupteur « lecture seule » : activez-le là si vous voulez que cette connexion ne puisse pas écrire ; laissé désactivé, la connexion peut lire et écrire.',
      ru: 'После подключения Upstash модель может перечислять ваши базы Redis, смотреть их сведения и использование, выполнять команды Redis и, если вы разрешите, создавать и удалять базы и делать резервные копии. Действие, меняющее или удаляющее данные, по умолчанию сначала спрашивает вас. На странице входа Upstash есть переключатель «только чтение»: включите его там, если хотите, чтобы подключение не могло записывать; если выключен, подключение может и читать, и писать.',
      es: 'Una vez conectado Upstash, el modelo puede listar tus bases Redis, ver sus detalles y uso, ejecutar comandos Redis y, si lo permites, crear o borrar bases y hacer copias de seguridad. Una acción que cambia o borra datos te pregunta antes, por defecto. La página de acceso de Upstash tiene un interruptor de solo lectura: actívalo allí si quieres que esta conexión no pueda escribir; desactivado, la conexión puede leer y escribir.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['列出我所有的 Redis 資料庫，並告訴我各自的用量', '幫我在東京區域建一個新的 Redis 資料庫', '查一下 user:42 這個 key 的內容']),
      en: Object.freeze(['List all my Redis databases and tell me how much each one is used', 'Create a new Redis database in the Tokyo region', 'Look up the value of the key user:42']),
      fr: Object.freeze(['Liste toutes mes bases Redis et indique l’utilisation de chacune', 'Crée une nouvelle base Redis dans la région de Tokyo', 'Cherche la valeur de la clé user:42']),
      ru: Object.freeze(['Покажи все мои базы Redis и использование каждой', 'Создай новую базу Redis в регионе Токио', 'Найди значение ключа user:42']),
      es: Object.freeze(['Lista todas mis bases Redis e indica cuánto se usa cada una', 'Crea una base Redis nueva en la región de Tokio', 'Busca el valor de la clave user:42'])
    }),
    reads: Object.freeze(['redis_database_list_databases', 'redis_database_get_details', 'redis_database_get_usage_last_5_days', 'redis_database_get_stats', 'redis_database_list_backups']),
    writes: Object.freeze(['redis_database_create_new', 'redis_database_delete', 'redis_database_reset_password', 'redis_database_create_backup', 'redis_database_delete_backup', 'redis_database_restore_backup', 'redis_database_update_regions', 'redis_database_run_redis_commands', 'redis_database_run_single_redis_command', 'redis_database_run_multiple_redis_commands'])
  }),
  Object.freeze({
    id: 'vercel',
    name: 'Vercel',
    category: 'dev',
    endpoint: 'https://mcp.vercel.com',
    icon: 'https://github.com/vercel.png?size=96',
    // Vercel only lets the clients it has approved log in (its login answered our registration with "invalid_redirect_uri: not approved for use by this authorization server"); the application to be approved is sent (2026-10-11).
    // The page says "Under review" and does not begin a login until this line is taken out.
    pending: true,
    // Vercel announces scopes with no difference between reading and writing, so the login is one: what a reply may do is the person's setting for each tool (some of its tools deploy or buy domains; the person decides, as for every tool).
    scopes: Object.freeze({ readwrite: Object.freeze(['openid', 'email', 'profile', 'offline_access']) }),
    description: Object.freeze({
      'zh-TW': '查看你的專案、部署與日誌，並部署專案、管理網域。',
      en: 'Look at your projects, deployments and logs, and deploy projects and manage domains.',
      fr: 'Consulter vos projets, déploiements et journaux, déployer des projets et gérer des domaines.',
      ru: 'Просмотр ваших проектов, развёртываний и журналов, развёртывание проектов и управление доменами.',
      es: 'Consulta tus proyectos, despliegues y registros, y despliega proyectos y gestiona dominios.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 Vercel 後，模型可以列出你的團隊與專案、查看部署狀態、建置與執行日誌，也能搜尋 Vercel 文件，並在你允許時部署專案、管理網域與環境變數。Vercel 的授權沒有讀寫之分，所以每個工具能不能用由你決定；會修改或花錢的動作（部署、買網域等）預設每次都先問你。Vercel 的 MCP 目前是 Beta。',
      en: 'Once Vercel is connected, the model can list your teams and projects, look at the status of deployments and the build and runtime logs, search Vercel\'s documentation and, where you allow it, deploy projects and manage domains and environment variables. Vercel\'s authorisation does not separate reading from writing, so what each tool may do is up to you; an action that changes things or costs money (a deployment, buying a domain and the like) asks you first by default. Vercel\'s MCP is in beta.',
      fr: 'Une fois Vercel connecté, le modèle peut lister vos équipes et projets, consulter l’état des déploiements et les journaux de build et d’exécution, chercher dans la documentation de Vercel et, si vous l’autorisez, déployer des projets et gérer domaines et variables d’environnement. L’autorisation de Vercel ne sépare pas lecture et écriture : c’est vous qui décidez de ce que chaque outil peut faire ; une action qui modifie ou coûte de l’argent (déploiement, achat de domaine, etc.) vous demande d’abord, par défaut. Le MCP de Vercel est en bêta.',
      ru: 'После подключения Vercel модель может перечислять ваши команды и проекты, смотреть состояние развёртываний и журналы сборки и выполнения, искать в документации Vercel и, если вы разрешите, развёртывать проекты и управлять доменами и переменными окружения. Авторизация Vercel не разделяет чтение и запись, поэтому что может каждый инструмент, решаете вы; действие, которое что-то меняет или стоит денег (развёртывание, покупка домена и т. п.), по умолчанию сначала спрашивает вас. MCP Vercel сейчас в бета-версии.',
      es: 'Una vez conectado Vercel, el modelo puede listar tus equipos y proyectos, ver el estado de los despliegues y los registros de compilación y ejecución, buscar en la documentación de Vercel y, si lo permites, desplegar proyectos y gestionar dominios y variables de entorno. La autorización de Vercel no separa lectura y escritura, así que lo que puede hacer cada herramienta lo decides tú; una acción que cambia cosas o cuesta dinero (un despliegue, comprar un dominio y similares) te pregunta antes, por defecto. El MCP de Vercel está en beta.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['列出我的專案，並告訴我最近一次部署的狀態', '最近的生產環境部署為什麼失敗？看建置日誌', '這個網域可以買嗎？價格多少？']),
      en: Object.freeze(['List my projects and tell me the status of the latest deployment', 'Why did the latest production deployment fail? Look at the build logs', 'Can this domain be bought, and at what price?']),
      fr: Object.freeze(['Liste mes projets et indique l’état du dernier déploiement', 'Pourquoi le dernier déploiement en production a-t-il échoué ? Regarde les journaux de build', 'Ce domaine peut-il être acheté, et à quel prix ?']),
      ru: Object.freeze(['Покажи мои проекты и состояние последнего развёртывания', 'Почему не удалось последнее развёртывание в продакшене? Посмотри журналы сборки', 'Можно ли купить этот домен и за сколько?']),
      es: Object.freeze(['Lista mis proyectos e indica el estado del último despliegue', '¿Por qué falló el último despliegue en producción? Mira los registros de compilación', '¿Se puede comprar este dominio y a qué precio?'])
    }),
    reads: Object.freeze(['search_vercel_documentation', 'web_fetch_vercel_url', 'check_domain_availability_and_price', 'count_events', 'count_pageviews', 'aggregate_events', 'aggregate_pageviews', 'artifact_query', 'search_domains', 'search_repo', 'filter_project_envs', 'git_namespaces']),
    writes: Object.freeze(['get_access_to_vercel_url', 'buy_domain', 'buy_domains', 'buy_single_domain', 'deploy_to_vercel', 'create_deployment'])
  }),
  Object.freeze({
    id: 'github',
    name: 'GitHub',
    category: 'dev',
    endpoint: 'https://api.githubcopilot.com/mcp/',
    icon: 'https://github.com/github.png?size=96',
    // GitHub has no registration of its own: Noureon is an OAuth App that the owner made in GitHub (its id and secret are in the server's environment, CONNECTOR_GITHUB_CLIENT_ID and _SECRET).
    // GitHub documents the secret in the body of the request, not in the header; it has no revocation address and its login is one for reading and writing (repo).
    clientAuth: 'post',
    scopes: Object.freeze({ readwrite: Object.freeze(['repo', 'read:org', 'read:user']) }),
    description: Object.freeze({
      'zh-TW': '搜尋與讀取你的倉庫、程式碼、議題與 Pull Request；建立議題、留言、提交與 Pull Request。',
      en: 'Search and read your repositories, code, issues and pull requests; create issues, comments, commits and pull requests.',
      fr: 'Rechercher et lire vos dépôts, votre code, vos tickets et pull requests ; créer tickets, commentaires, commits et pull requests.',
      ru: 'Поиск и чтение ваших репозиториев, кода, задач и pull request; создание задач, комментариев, коммитов и pull request.',
      es: 'Busca y lee tus repositorios, código, incidencias y pull requests; crea incidencias, comentarios, commits y pull requests.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 GitHub 後，模型可以搜尋與讀取你能看到的倉庫、檔案內容、議題與 Pull Request，也能在你允許時建立議題、留言、建立分支、提交檔案、開 Pull Request，甚至合併。GitHub 的授權包含你倉庫的寫入權限，所以每個工具由你決定；會修改或刪除資料的動作預設每次都先問你。GitHub 沒有提供撤銷令牌的功能：中斷連線時我們會刪除保存的令牌，若要在 GitHub 端取消授權，請到 GitHub 的 Settings → Applications 移除 Noureon。',
      en: 'Once GitHub is connected, the model can search and read the repositories, file contents, issues and pull requests you can see, and, where you allow it, create issues, comment, create branches, commit files, open pull requests and even merge them. GitHub\'s authorisation includes write access to your repositories, so each tool is up to you; an action that changes or deletes data asks you first by default. GitHub does not offer a way to revoke a token: when you disconnect, we delete the token we keep, and to cancel the authorisation at GitHub you remove Noureon under Settings → Applications there.',
      fr: 'Une fois GitHub connecté, le modèle peut chercher et lire les dépôts, le contenu des fichiers, les tickets et les pull requests que vous pouvez voir et, si vous l’autorisez, créer des tickets, commenter, créer des branches, valider des fichiers, ouvrir des pull requests et même les fusionner. L’autorisation de GitHub inclut l’écriture sur vos dépôts : c’est donc à vous de régler chaque outil ; une action qui modifie ou supprime des données vous demande d’abord, par défaut. GitHub ne permet pas de révoquer un jeton : à la déconnexion, nous supprimons le jeton que nous gardons ; pour annuler l’autorisation chez GitHub, retirez Noureon dans Settings → Applications.',
      ru: 'После подключения GitHub модель может искать и читать доступные вам репозитории, содержимое файлов, задачи и pull request и, если вы разрешите, создавать задачи, комментировать, создавать ветки, коммитить файлы, открывать pull request и даже сливать их. Авторизация GitHub включает запись в ваши репозитории, поэтому каждый инструмент настраиваете вы; действие, меняющее или удаляющее данные, по умолчанию сначала спрашивает вас. GitHub не позволяет отозвать токен: при отключении мы удаляем сохранённый токен, а чтобы отменить авторизацию на стороне GitHub, удалите Noureon в Settings → Applications.',
      es: 'Una vez conectado GitHub, el modelo puede buscar y leer los repositorios, el contenido de archivos, las incidencias y los pull requests que puedes ver y, si lo permites, crear incidencias, comentar, crear ramas, confirmar archivos, abrir pull requests e incluso fusionarlos. La autorización de GitHub incluye escritura en tus repositorios, así que cada herramienta la decides tú; una acción que cambia o borra datos te pregunta antes, por defecto. GitHub no ofrece revocar un token: al desconectar borramos el token que guardamos, y para cancelar la autorización en GitHub quita Noureon en Settings → Applications.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['列出我的倉庫裡還沒關閉的議題，按優先度整理', '看一下 noureon 這個倉庫最近的 Pull Request，哪些還沒有人審查？', '幫我在這個倉庫開一個議題：登入頁面在 Safari 壞掉']),
      en: Object.freeze(['List the open issues in my repositories, ordered by priority', 'Look at the latest pull requests of the noureon repository: which ones have no reviewer yet?', 'Open an issue in this repository: the login page is broken in Safari']),
      fr: Object.freeze(['Liste les tickets ouverts de mes dépôts, classés par priorité', 'Regarde les dernières pull requests du dépôt noureon : lesquelles n’ont pas encore de relecteur ?', 'Ouvre un ticket dans ce dépôt : la page de connexion est cassée dans Safari']),
      ru: Object.freeze(['Покажи открытые задачи в моих репозиториях по приоритету', 'Посмотри последние pull request репозитория noureon: у каких ещё нет ревьюера?', 'Создай задачу в этом репозитории: страница входа не работает в Safari']),
      es: Object.freeze(['Lista las incidencias abiertas de mis repositorios, por prioridad', 'Mira los últimos pull requests del repositorio noureon: ¿cuáles aún no tienen revisor?', 'Abre una incidencia en este repositorio: la página de inicio de sesión falla en Safari'])
    }),
    reads: Object.freeze(['issue_read', 'pull_request_read', 'actions_get', 'actions_list']),
    writes: Object.freeze(['issue_write', 'sub_issue_write', 'pull_request_review_write', 'create_or_update_file', 'delete_file', 'push_files', 'create_pull_request', 'merge_pull_request', 'update_pull_request', 'update_pull_request_branch', 'create_branch', 'create_repository', 'fork_repository', 'add_issue_comment', 'add_comment_to_pending_review', 'add_reply_to_pull_request_comment', 'assign_copilot_to_issue', 'request_copilot_review', 'actions_run_trigger', 'enable_pr_auto_merge', 'disable_pr_auto_merge'])
  }),
  Object.freeze({
    id: 'supabase',
    name: 'Supabase',
    category: 'dev',
    endpoint: 'https://mcp.supabase.com/mcp',
    icon: 'https://github.com/supabase.png?size=96',
    // Supabase takes a registration (it shows the name and the picture of the client on its consent screen) and has no scope that tells reading from writing; the whole organisation is connected (no project_ref in the address), and what a reply may do is the person's setting for each tool.
    registration: 'dcr',
    scopes: Object.freeze({ readwrite: Object.freeze([]) }),
    description: Object.freeze({
      'zh-TW': '查看與管理你的 Supabase 組織與專案：資料表、SQL、日誌、Edge Functions。',
      en: 'Look at and manage your Supabase organisations and projects: tables, SQL, logs, Edge Functions.',
      fr: 'Consulter et gérer vos organisations et projets Supabase : tables, SQL, journaux, Edge Functions.',
      ru: 'Просмотр и управление вашими организациями и проектами Supabase: таблицы, SQL, журналы, Edge Functions.',
      es: 'Consulta y gestiona tus organizaciones y proyectos de Supabase: tablas, SQL, registros, Edge Functions.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 Supabase 後，模型可以列出你組織裡的專案、查看資料表與擴充功能、讀取日誌與安全建議、搜尋 Supabase 文件，也能在你允許時執行 SQL、套用遷移、部署 Edge Function、建立分支，甚至建立或暫停專案。連線涵蓋你整個組織，所以包含正式環境的專案；每個工具能不能用由你決定，會修改資料的動作（執行 SQL、套用遷移等）預設每次都先問你，建議把你不想讓模型碰的工具設成停用。',
      en: 'Once Supabase is connected, the model can list the projects of your organisation, look at tables and extensions, read logs and security advice, search Supabase\'s documentation and, where you allow it, run SQL, apply migrations, deploy Edge Functions, create branches and even create or pause projects. The connection covers your whole organisation, so it includes projects that are in production; what each tool may do is up to you, an action that changes data (running SQL, applying a migration and the like) asks you first by default, and you may switch off any tool you do not want the model to touch.',
      fr: 'Une fois Supabase connecté, le modèle peut lister les projets de votre organisation, consulter tables et extensions, lire journaux et conseils de sécurité, chercher dans la documentation de Supabase et, si vous l’autorisez, exécuter du SQL, appliquer des migrations, déployer des Edge Functions, créer des branches et même créer ou mettre en pause des projets. La connexion couvre toute votre organisation, donc aussi les projets en production ; c’est vous qui décidez de ce que chaque outil peut faire, une action qui modifie des données (exécuter du SQL, appliquer une migration, etc.) vous demande d’abord, par défaut, et vous pouvez désactiver tout outil que le modèle ne doit pas toucher.',
      ru: 'После подключения Supabase модель может перечислять проекты вашей организации, смотреть таблицы и расширения, читать журналы и рекомендации по безопасности, искать в документации Supabase и, если вы разрешите, выполнять SQL, применять миграции, развёртывать Edge Functions, создавать ветки и даже создавать или приостанавливать проекты. Подключение охватывает всю вашу организацию, включая проекты в продакшене; что может каждый инструмент, решаете вы, действие, меняющее данные (выполнение SQL, применение миграции и т. п.), по умолчанию сначала спрашивает вас, а ненужные инструменты можно отключить.',
      es: 'Una vez conectado Supabase, el modelo puede listar los proyectos de tu organización, ver tablas y extensiones, leer registros y avisos de seguridad, buscar en la documentación de Supabase y, si lo permites, ejecutar SQL, aplicar migraciones, desplegar Edge Functions, crear ramas e incluso crear o pausar proyectos. La conexión abarca toda tu organización, así que incluye proyectos en producción; lo que puede hacer cada herramienta lo decides tú, una acción que cambia datos (ejecutar SQL, aplicar una migración y similares) te pregunta antes, por defecto, y puedes desactivar cualquier herramienta que no quieras que el modelo toque.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['列出我組織裡的專案，並告訴我各自的狀態', '看一下 my-app 專案有哪些資料表，哪些還沒開 RLS？', '查最近一小時 API 的錯誤日誌']),
      en: Object.freeze(['List the projects in my organisation and tell me the status of each', 'Look at the tables of the my-app project: which ones have no RLS yet?', 'Look at the API error logs of the last hour']),
      fr: Object.freeze(['Liste les projets de mon organisation et indique l’état de chacun', 'Regarde les tables du projet my-app : lesquelles n’ont pas encore de RLS ?', 'Regarde les journaux d’erreurs de l’API de la dernière heure']),
      ru: Object.freeze(['Покажи проекты моей организации и состояние каждого', 'Посмотри таблицы проекта my-app: у каких ещё нет RLS?', 'Посмотри журналы ошибок API за последний час']),
      es: Object.freeze(['Lista los proyectos de mi organización e indica el estado de cada uno', 'Mira las tablas del proyecto my-app: ¿cuáles aún no tienen RLS?', 'Mira los registros de errores de la API de la última hora'])
    }),
    reads: Object.freeze(['generate_typescript_types', 'query_logs', 'get_logs', 'get_advisors', 'get_cost']),
    writes: Object.freeze(['execute_sql', 'apply_migration', 'create_project', 'pause_project', 'restore_project', 'confirm_cost', 'create_branch', 'delete_branch', 'merge_branch', 'reset_branch', 'rebase_branch', 'deploy_edge_function', 'create_edge_function_secret'])
  }),
  Object.freeze({
    id: 'huggingface',
    name: 'Hugging Face',
    category: 'dev',
    endpoint: 'https://huggingface.co/mcp',
    icon: 'https://github.com/huggingface.png?size=96',
    registration: 'dcr',
    scopes: Object.freeze({ readwrite: Object.freeze([]) }),
    description: Object.freeze({
      'zh-TW': '搜尋 Hugging Face 的模型、資料集、Spaces 與論文，並使用社群的 AI 應用。',
      en: 'Search Hugging Face models, datasets, Spaces and papers, and use the community\'s AI apps.',
      fr: 'Rechercher modèles, jeux de données, Spaces et articles sur Hugging Face, et utiliser les applications d’IA de la communauté.',
      ru: 'Поиск моделей, датасетов, Spaces и статей на Hugging Face и использование ИИ-приложений сообщества.',
      es: 'Busca modelos, conjuntos de datos, Spaces y artículos en Hugging Face, y usa las aplicaciones de IA de la comunidad.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 Hugging Face 後，模型可以搜尋 Hub 上的模型、資料集、Spaces 與論文，查看倉庫的詳細資料，搜尋並閱讀 Hugging Face 文件，也能呼叫 Spaces 上的 Gradio 應用（例如生成圖片、語音辨識）。呼叫 Space 會把輸入送到該 Space，由它的作者決定怎麼處理，所以這類工具預設每次都先問你。Hugging Face 的 MCP 目前是實驗性質，工具可能會變動。',
      en: 'Once Hugging Face is connected, the model can search the Hub for models, datasets, Spaces and papers, look at the details of a repository, search and read Hugging Face\'s documentation and call Gradio apps on Spaces (generating an image or recognising speech, for example). Calling a Space sends the input to that Space, and its author decides what happens to it, so such tools ask you first by default. Hugging Face\'s MCP is experimental and its tools may change.',
      fr: 'Une fois Hugging Face connecté, le modèle peut chercher sur le Hub des modèles, des jeux de données, des Spaces et des articles, consulter les détails d’un dépôt, chercher et lire la documentation de Hugging Face et appeler des applications Gradio sur des Spaces (générer une image ou reconnaître la parole, par exemple). Appeler un Space lui envoie l’entrée, et son auteur décide de ce qu’il en fait : de tels outils vous demandent donc d’abord, par défaut. Le MCP de Hugging Face est expérimental et ses outils peuvent changer.',
      ru: 'После подключения Hugging Face модель может искать на Hub модели, датасеты, Spaces и статьи, смотреть сведения о репозитории, искать и читать документацию Hugging Face и вызывать приложения Gradio в Spaces (например, генерировать изображение или распознавать речь). Вызов Space отправляет ему входные данные, а что с ними будет, решает его автор, поэтому такие инструменты по умолчанию сначала спрашивают вас. MCP Hugging Face экспериментальный, его инструменты могут меняться.',
      es: 'Una vez conectado Hugging Face, el modelo puede buscar en el Hub modelos, conjuntos de datos, Spaces y artículos, ver los detalles de un repositorio, buscar y leer la documentación de Hugging Face y llamar a aplicaciones Gradio de Spaces (generar una imagen o reconocer voz, por ejemplo). Llamar a un Space le envía la entrada, y su autor decide qué se hace con ella, así que esas herramientas te preguntan antes, por defecto. El MCP de Hugging Face es experimental y sus herramientas pueden cambiar.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['找幾個適合做中文語音辨識的模型，比較它們的大小與下載量', '搜尋最近一個月關於 RAG 的熱門論文', 'Hugging Face 的 Transformers 怎麼載入量化模型？查官方文件']),
      en: Object.freeze(['Find a few models suited to Chinese speech recognition and compare their size and downloads', 'Search for the popular papers on RAG of the last month', 'How does Transformers load a quantised model? Check the official documentation']),
      fr: Object.freeze(['Trouve quelques modèles adaptés à la reconnaissance vocale du chinois et compare leur taille et leurs téléchargements', 'Cherche les articles populaires sur le RAG du dernier mois', 'Comment Transformers charge-t-il un modèle quantifié ? Consulte la documentation officielle']),
      ru: Object.freeze(['Найди несколько моделей для распознавания китайской речи и сравни размер и число загрузок', 'Найди популярные статьи о RAG за последний месяц', 'Как Transformers загружает квантованную модель? Посмотри официальную документацию']),
      es: Object.freeze(['Encuentra algunos modelos para reconocimiento de voz en chino y compara su tamaño y descargas', 'Busca los artículos populares sobre RAG del último mes', '¿Cómo carga Transformers un modelo cuantizado? Mira la documentación oficial'])
    }),
    reads: Object.freeze(['hf_whoami', 'space_search', 'model_search', 'paper_search', 'dataset_search', 'hub_repo_details', 'hub_repo_search', 'hf_doc_search', 'hf_doc_fetch']),
    writes: Object.freeze(['dynamic_space', 'use_space'])
  }),
  Object.freeze({
    id: 'miro',
    name: 'Miro',
    category: 'design',
    endpoint: 'https://mcp.miro.com/',
    icon: 'https://github.com/miroapp.png?size=96',
    registration: 'dcr',
    scopes: Object.freeze({ readwrite: Object.freeze([]) }),
    description: Object.freeze({
      'zh-TW': '讀取你的 Miro 白板內容，並建立圖表、文件與表格。',
      en: 'Read the content of your Miro boards, and create diagrams, documents and tables.',
      fr: 'Lire le contenu de vos tableaux Miro, et créer des diagrammes, des documents et des tableaux.',
      ru: 'Чтение содержимого ваших досок Miro и создание диаграмм, документов и таблиц.',
      es: 'Lee el contenido de tus tableros de Miro y crea diagramas, documentos y tablas.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 Miro 後，模型可以讀取你白板上的內容（便利貼、文字、圖表、框架），根據白板內容整理摘要或需求，也能在你允許時在白板上建立圖表、文件與表格。Miro 的連線是以團隊為單位，登入時要選擇白板所在的團隊；會修改白板的動作預設每次都先問你。如果你的 Miro 是企業方案，需要管理員先在組織裡啟用 Miro 的 MCP。',
      en: 'Once Miro is connected, the model can read what is on your boards (sticky notes, text, diagrams, frames), make a summary or a list of requirements from it and, where you allow it, create diagrams, documents and tables on a board. Miro\'s connection is made per team: you choose the team that holds the board when you log in. An action that changes a board asks you first by default. On a Miro Enterprise plan, an administrator has to enable Miro\'s MCP for the organisation first.',
      fr: 'Une fois Miro connecté, le modèle peut lire ce qui se trouve sur vos tableaux (notes, texte, diagrammes, cadres), en tirer un résumé ou une liste d’exigences et, si vous l’autorisez, créer des diagrammes, des documents et des tableaux sur un tableau. La connexion de Miro se fait par équipe : vous choisissez à la connexion l’équipe qui contient le tableau. Une action qui modifie un tableau vous demande d’abord, par défaut. Avec une offre Miro Enterprise, un administrateur doit d’abord activer le MCP de Miro pour l’organisation.',
      ru: 'После подключения Miro модель может читать содержимое ваших досок (стикеры, текст, диаграммы, фреймы), составлять по нему резюме или список требований и, если вы разрешите, создавать на доске диаграммы, документы и таблицы. Подключение Miro выполняется для команды: при входе вы выбираете команду, в которой находится доска. Действие, меняющее доску, по умолчанию сначала спрашивает вас. На тарифе Miro Enterprise администратор должен сначала включить MCP Miro для организации.',
      es: 'Una vez conectado Miro, el modelo puede leer lo que hay en tus tableros (notas, texto, diagramas, marcos), hacer con ello un resumen o una lista de requisitos y, si lo permites, crear diagramas, documentos y tablas en un tablero. La conexión de Miro se hace por equipo: al iniciar sesión eliges el equipo que contiene el tablero. Una acción que modifica un tablero te pregunta antes, por defecto. Con un plan Miro Enterprise, un administrador debe activar antes el MCP de Miro para la organización.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['讀一下「產品路線圖」這塊白板，幫我整理成一頁摘要', '根據這份需求，在白板上畫一張登入流程圖', '把白板上的便利貼依主題分類，列成表格']),
      en: Object.freeze(['Read the "Product roadmap" board and make a one-page summary of it', 'Draw a login flow diagram on the board from this requirement', 'Sort the sticky notes on the board by theme and list them in a table']),
      fr: Object.freeze(['Lis le tableau « Feuille de route produit » et fais-en un résumé d’une page', 'Dessine sur le tableau un diagramme du parcours de connexion d’après cette exigence', 'Classe par thème les notes du tableau et présente-les dans un tableau']),
      ru: Object.freeze(['Прочитай доску «Дорожная карта продукта» и сделай по ней резюме на одну страницу', 'Нарисуй на доске схему процесса входа по этому требованию', 'Разбери стикеры на доске по темам и сведи их в таблицу']),
      es: Object.freeze(['Lee el tablero «Hoja de ruta del producto» y haz un resumen de una página', 'Dibuja en el tablero un diagrama del flujo de inicio de sesión según este requisito', 'Clasifica las notas del tablero por tema y ponlas en una tabla'])
    }),
    // What reads is told by the name (the service's tools start with the thing they act on: board_list_items, doc_get, ...), so what we know is listed; any other tool asks.
    reads: Object.freeze(['board_list_items', 'context_explore', 'context_get', 'diagram_get_dsl', 'doc_get', 'table_list_rows']),
    writes: Object.freeze(['diagram_create', 'doc_create', 'doc_update', 'table_create', 'table_sync_rows'])
  }),
  Object.freeze({
    id: 'canva',
    name: 'Canva',
    category: 'design',
    endpoint: 'https://mcp.canva.com/mcp',
    icon: 'https://github.com/canva.png?size=96',
    registration: 'dcr',
    // Canva only lets the redirect addresses it has approved log in (its login answers "Invalid redirect URI" for ours, also after a registration that was accepted); a custom client applies for its address to be added (Canva's waitlist form).
    // The page says "Under review" and does not begin a login until this line is taken out.
    pending: true,
    scopes: Object.freeze({ readwrite: Object.freeze([]) }),
    description: Object.freeze({
      'zh-TW': '搜尋、讀取與生成你的 Canva 設計，並匯出成檔案。',
      en: 'Search, read and generate your Canva designs, and export them as files.',
      fr: 'Rechercher, lire et générer vos designs Canva, et les exporter en fichiers.',
      ru: 'Поиск, чтение и создание ваших дизайнов Canva и экспорт их в файлы.',
      es: 'Busca, lee y genera tus diseños de Canva, y expórtalos como archivos.'
    }),
    details: Object.freeze({
      'zh-TW': '連接 Canva 後，模型可以搜尋你的設計、讀取設計的內容與頁面、查看品牌套件與留言，也能在你允許時用文字描述生成新的設計、調整尺寸、編輯內容、加入留言，並匯出成 PDF 或圖片。部分功能需要特定的 Canva 方案（例如調整尺寸需要 Pro，品牌套件自動填入需要 Enterprise）。會建立或修改設計的動作預設每次都先問你。',
      en: 'Once Canva is connected, the model can search your designs, read the content and pages of a design, look at brand kits and comments and, where you allow it, generate new designs from a description, resize them, edit their content, add comments and export them as PDF or images. Some functions need a particular Canva plan (resizing needs Pro, filling in from a brand kit needs Enterprise). An action that creates or changes a design asks you first by default.',
      fr: 'Une fois Canva connecté, le modèle peut chercher vos designs, lire le contenu et les pages d’un design, consulter kits de marque et commentaires et, si vous l’autorisez, générer de nouveaux designs à partir d’une description, les redimensionner, modifier leur contenu, ajouter des commentaires et les exporter en PDF ou en images. Certaines fonctions demandent une offre Canva précise (le redimensionnement demande Pro, le remplissage depuis un kit de marque demande Enterprise). Une action qui crée ou modifie un design vous demande d’abord, par défaut.',
      ru: 'После подключения Canva модель может искать ваши дизайны, читать содержимое и страницы дизайна, смотреть фирменные наборы и комментарии и, если вы разрешите, создавать новые дизайны по описанию, менять их размер, редактировать содержимое, добавлять комментарии и экспортировать в PDF или изображения. Некоторым функциям нужен определённый тариф Canva (для смены размера нужен Pro, для подстановки из фирменного набора — Enterprise). Действие, создающее или меняющее дизайн, по умолчанию сначала спрашивает вас.',
      es: 'Una vez conectado Canva, el modelo puede buscar tus diseños, leer el contenido y las páginas de un diseño, ver kits de marca y comentarios y, si lo permites, generar diseños nuevos a partir de una descripción, cambiarles el tamaño, editar su contenido, añadir comentarios y exportarlos como PDF o imágenes. Algunas funciones requieren un plan concreto de Canva (cambiar el tamaño requiere Pro, rellenar desde un kit de marca requiere Enterprise). Una acción que crea o cambia un diseño te pregunta antes, por defecto.'
    }),
    examples: Object.freeze({
      'zh-TW': Object.freeze(['找出我上個月做的簡報設計，列出每一頁的標題', '幫我做一張活動海報：10 月 25 日，社區市集，風格溫暖簡約', '把這份設計匯出成 PDF']),
      en: Object.freeze(['Find the presentation I made last month and list the title of each page', 'Make an event poster: 25 October, neighbourhood market, warm and minimal', 'Export this design as a PDF']),
      fr: Object.freeze(['Trouve la présentation que j’ai faite le mois dernier et liste le titre de chaque page', 'Fais une affiche d’événement : 25 octobre, marché de quartier, style chaleureux et minimaliste', 'Exporte ce design en PDF']),
      ru: Object.freeze(['Найди презентацию, которую я делал в прошлом месяце, и перечисли заголовок каждой страницы', 'Сделай афишу мероприятия: 25 октября, районный рынок, тёплый минималистичный стиль', 'Экспортируй этот дизайн в PDF']),
      es: Object.freeze(['Encuentra la presentación que hice el mes pasado y lista el título de cada página', 'Haz un cartel de evento: 25 de octubre, mercadillo del barrio, estilo cálido y minimalista', 'Exporta este diseño como PDF'])
    }),
    reads: Object.freeze(['search-designs', 'get-design', 'get-design-content', 'get-design-pages', 'get-assets', 'list-brand-kits', 'list-comments', 'list-replies', 'get-export-formats', 'search-folders', 'list-folder-items']),
    writes: Object.freeze(['generate-design', 'create-design-from-candidate', 'resize-design', 'export-design', 'upload-asset-from-url', 'comment-on-design', 'reply-to-comment', 'start-editing-transaction', 'perform-editing-operations', 'commit-editing-transaction', 'create-folder', 'move-item-to-folder'])
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
  if (connector?.clientAuth !== undefined && connector.clientAuth !== 'post') problems.push('clientAuth');
  if (!connector?.scopes?.readwrite) problems.push('scopes');
  if (!connector?.description || !LANGUAGES.every((language) => String(connector.description[language] || '').trim())) problems.push('description in the five languages');
  if (!connector?.details || !LANGUAGES.every((language) => String(connector.details[language] || '').trim())) problems.push('details in the five languages');
  if (!connector?.examples || !LANGUAGES.every((language) => Array.isArray(connector.examples[language]) && connector.examples[language].length === 3 && connector.examples[language].every((example) => String(example || '').trim()))) problems.push('three examples in the five languages');
  return problems;
}
