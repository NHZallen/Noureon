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
