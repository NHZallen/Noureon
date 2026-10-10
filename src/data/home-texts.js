// The words of the home page (the page shown before sign-in), in the five languages of the application. They are loaded after the first paint
// by app/ui/home/home-page.js; the sign-in form itself keeps the keys of data/i18n so it never waits for this file.
// A line break inside a string is written \n and shown as a break. Numbers that come from the application (models, vendors, presets) are in
// HOME_FACTS and are checked against the registries by tests/home-page.test.js.

export const HOME_FACTS = Object.freeze({ models: 38, vendors: 14, councilMin: 2, councilMax: 5, deckDesigns: 20, documentStyles: 9, skills: 11, cliTools: 8 });

export const HOME_BRANDS = Object.freeze(['Anthropic', 'OpenAI', 'Google', 'xAI', 'DeepSeek', 'Qwen', 'Moonshot AI', 'Z.ai', 'MiniMax', 'Xiaomi', 'StepFun', 'Poolside', 'NVIDIA', 'Black Forest Labs']);

export const HOME_LINKS = Object.freeze({
  x: 'https://x.com/NoureonAi',
  github: 'https://github.com/NHZallen/Noureon',
  license: 'https://github.com/NHZallen/Noureon/blob/main/LICENSE',
  mail: 'mailto:support@noureon.com'
});

export const HOME_TEXTS = {
  'zh-TW': {
    nav: { council: '理事會', research: '深度研究', files: '檔案', extensions: '擴充', privacy: '隱私', theme: '切換深淺色' },
    hero: {
      title: '思考，\n不止一個模型。',
      lead: 'Noureon 把 14 家廠商、38 個模型選項放進同一個工作空間。讓它們同席議事、替你深度研究，最後交出可以直接使用的檔案。',
      start: '開始使用', how: '看看怎麼運作', hint: '往下滑，看它怎麼工作'
    },
    brands: '同一個對話框，十四家的模型。',
    window: '聊天室',
    stories: {
      council: {
        eyebrow: '模型理事會',
        caps: [
          { h: '讓頂尖模型，\n同席議事。', p: '挑出 2 到 5 位成員，再指定一位整合者。Claude、GPT、Gemini，在同一個問題上各抒己見。', facts: ['38 個模型選項', '14 家廠商', '成員可存成分組'] },
          { h: '先獨立作答，\n再交叉辯證。', p: '共識模式各自作答；討論模式多一輪互評與修正。需要時，理事會先共同搜尋一次，每位成員依據同一份資料發言。', facts: ['共識模式', '討論模式', '共用搜尋資料包'] },
          { h: '一份結論，\n分歧一目了然。', p: '整合者把意見收斂成一份答案，並附上共識與差異整理：哪些成員贊成、哪些保留，最後如何取捨。', facts: ['共識與差異整理', '各成員立場並列'] }
        ]
      },
      research: {
        eyebrow: '深度研究',
        caps: [
          { h: '提出問題，\n其餘交給它。', p: '先擬定研究計畫，再逐項搜尋、閱讀、交叉比對。整個過程在伺服器上執行，關上分頁，研究照常進行。', facts: ['先列計畫', '逐項研究', '伺服器執行'] },
          { h: '每一步，\n都看得見。', p: '搜尋次數、耗時與完成度即時更新。想調整方向，直接傳訊息補充；也能隨時暫停或停止。', facts: ['搜尋次數與耗時', '暫停・停止', '研究中補充指示'] },
          { h: '一份\n有出處的報告。', p: '附引用與圖表的完整報告，可以展開閱讀，並匯出為 PDF、Word 或 Markdown。', facts: ['引用標註', '展開閱讀', 'PDF・Word・Markdown'] }
        ]
      },
      files: {
        eyebrow: '檔案與簡報',
        caps: [
          { h: '從對話，\n直接到成品。', p: '簡報、Word、Excel、PDF，以及 CSV、行事曆、字幕等十餘種格式，在對話中生成。', facts: ['PPTX', 'DOCX', 'XLSX', 'PDF'] },
          { h: '先預覽，\n再下載。', p: '每個檔案都有預覽與下載按鈕，簡報、文件、試算表各自獨立，要哪個拿哪個。', facts: ['逐檔預覽', '單檔下載'] },
          { h: '多個檔案，\n一次帶走。', p: '多個檔案可以一次打包成 ZIP。簡報完成後，還能逐頁畫成圖片，交給模型檢查版面；簡報有 20 套設計、文件有 9 套樣式可選。', facts: ['ZIP 打包', '看圖檢查', '簡報 20 套設計', '文件 9 套樣式'] }
        ]
      }
    },
    ext: {
      eyebrow: '擴充', title: '能力，隨需擴充。',
      lead: '技能是寫好的工作方法：會議記錄、事實查核、校對、摘要等 11 項官方技能，也能貼上或上傳你自己寫的。命令工具則在伺服器上與外界隔離的容器裡執行，Pandoc、FFmpeg、yt-dlp、csvkit 等 8 個工具；要連上網站，必須先經過你的同意。',
      facts: ['11 項官方技能', '8 個命令工具', '可上傳自己的技能包']
    },
    stats: {
      eyebrow: '規格', title: '每個數字，現在就能用。',
      items: [['38', '可選模型'], ['14', '家廠商'], ['2–5', '位理事會成員'], ['20', '套簡報設計'], ['11', '項官方技能'], ['8', '個命令工具']]
    },
    server: {
      eyebrow: '伺服器執行', title: '關上分頁，\n工作不停。',
      lead: '回覆預設由伺服器執行。你可以離開頁面、鎖上手機，回來時結果已經在對話裡。',
      rows: [['回覆', '長篇回答寫到一半，也不會因為離開而中斷。'], ['深度研究', '數十次搜尋與閱讀，在背景完成。'], ['模型理事會', '多位成員的討論與整合，照常進行。'], ['圖片生成', '關上分頁，圖片仍會畫完。'], ['網路搜尋', '先搜後答，在伺服器上一次完成。']]
    },
    more: {
      eyebrow: '還有更多', title: '細節，都替你想好了。',
      tiles: [
        ['image', '圖片生成', 'GPT Image、FLUX、Nano Banana 等 4 個圖片模型，在對話中出圖，也能接著修改。'],
        ['eye', '看圖檢查', '簡報完成後逐頁畫成圖片，交給你選的模型再檢查一遍版面。'],
        ['code', '進階模式', '在隔離的 Python 沙盒中執行程式：處理資料、畫圖表、產出檔案。'],
        ['user', 'Nouras', '把常用的角色與指示存成自己的助理，隨時切換。'],
        ['search', '網路搜尋', '需要最新資訊時先查再答，並在句中標出來源。'],
        ['book', '學習模式', '以引導的方式協助你理解，而不是直接給答案。'],
        ['ghost', '臨時對話', '用完即走，不留下紀錄。'],
        ['mic', '語音輸入', '用說的，比打字更快。'],
        ['globe', '五種語言', '繁體中文、English、Français、Русский、Español。']
      ]
    },
    trust: {
      eyebrow: '隱私與信任', title: '你的金鑰，你的資料。',
      items: [
        ['自備 API 金鑰', 'Noureon 不轉售模型用量，費用由你直接與供應商結算。'],
        ['本機優先', '對話、設定與金鑰預設存在你的瀏覽器；雲端同步為選用，並可用同步密鑰加密。'],
        ['用完即刪', '由伺服器執行時，金鑰只加密暫存到回覆結束，最長 2 小時 15 分；沙盒容器在回覆後立即刪除。'],
        ['開源（MIT）', '完整原始碼公開在 GitHub，可以逐行檢查，也可以自行架設。']
      ],
      source: '在 GitHub 查看原始碼', policy: '閱讀隱私權政策'
    },
    final: { title: '現在就開始。', lead: '準備好一組 API 金鑰，幾分鐘內就能用上所有功能。' },
    footer: {
      tagline: '思考，不止一個模型。',
      product: '產品', council: '模型理事會', research: '深度研究', files: '檔案與簡報', extensions: '擴充',
      resources: '資源', help: '協助中心', updates: '更新紀錄', license: '開源授權',
      legal: '法務', xLabel: 'Noureon 的官方 X 帳號 @NoureonAi'
    }
  },
  en: {
    nav: { council: 'Council', research: 'Deep research', files: 'Files', extensions: 'Extensions', privacy: 'Privacy', theme: 'Switch light or dark' },
    hero: {
      title: 'Think with more\nthan one model.',
      lead: 'Noureon puts 14 vendors and 38 models in one workspace. Have them debate a question, research it for you, and hand back files you can use right away.',
      start: 'Get started', how: 'See how it works', hint: 'Scroll to see it work'
    },
    brands: 'One chat box, models from fourteen vendors.',
    window: 'Chat',
    stories: {
      council: {
        eyebrow: 'Model Council',
        caps: [
          { h: 'Let the best models\nsit at one table.', p: 'Pick 2 to 5 members and name one to bring it together. Claude, GPT and Gemini each give their view on the same question.', facts: ['38 models', '14 vendors', 'Save members as groups'] },
          { h: 'First on their own,\nthen against each other.', p: 'In consensus mode each member answers alone; discussion mode adds a round of review and revision. When it helps, the council searches once together, so every member works from the same material.', facts: ['Consensus mode', 'Discussion mode', 'One shared search'] },
          { h: 'One conclusion.\nEvery disagreement in view.', p: 'The synthesizer boils the views down to one answer, with a table of what the members agree on and where they differ: who backed it, who held back, and how it was settled.', facts: ['Consensus and differences', 'Each member’s stance side by side'] }
        ]
      },
      research: {
        eyebrow: 'Deep research',
        caps: [
          { h: 'Ask the question.\nLeave the rest.', p: 'It drafts a plan, then searches, reads and cross-checks item by item. It all runs on the server, so closing the tab does not stop it.', facts: ['Plan first', 'Item by item', 'Runs on the server'] },
          { h: 'Every step,\nin plain sight.', p: 'Searches, time and progress update live. To change course, send a message; you can also pause or stop at any time.', facts: ['Searches and time', 'Pause · Stop', 'Add instructions mid-run'] },
          { h: 'A report\nwith its sources.', p: 'A full report with citations and charts. Open it to read, and export it as PDF, Word or Markdown.', facts: ['Citations', 'Open to read', 'PDF · Word · Markdown'] }
        ]
      },
      files: {
        eyebrow: 'Files and decks',
        caps: [
          { h: 'From conversation\nstraight to the file.', p: 'Decks, Word, Excel, PDF, and a dozen more formats such as CSV, calendars and subtitles, made right in the chat.', facts: ['PPTX', 'DOCX', 'XLSX', 'PDF'] },
          { h: 'Preview first.\nThen download.', p: 'Every file has its own preview and download button. The deck, the document and the sheet stay separate, so take only what you need.', facts: ['Preview each file', 'Download one'] },
          { h: 'Several files,\none download.', p: 'Bundle several files into one ZIP. After a deck is made, each slide can be drawn as an image for a model to check the layout. Pick from 20 deck designs and 9 document styles.', facts: ['ZIP bundle', 'Visual check', '20 deck designs', '9 document styles'] }
        ]
      }
    },
    ext: {
      eyebrow: 'Extensions', title: 'Add abilities\nas you need them.',
      lead: 'Skills are written-down ways of working: 11 official ones such as meeting notes, fact-checking, proofreading and summaries, plus any you paste or upload yourself. Command tools run on the server in an isolated container: 8 of them, including Pandoc, FFmpeg, yt-dlp and csvkit. Reaching a website needs your approval first.',
      facts: ['11 official skills', '8 command tools', 'Upload your own skill packs']
    },
    stats: {
      eyebrow: 'By the numbers', title: 'Every number is ready to use.',
      items: [['38', 'models to choose from'], ['14', 'vendors'], ['2–5', 'council members'], ['20', 'deck designs'], ['11', 'official skills'], ['8', 'command tools']]
    },
    server: {
      eyebrow: 'Runs on the server', title: 'Close the tab.\nThe work goes on.',
      lead: 'Replies run on the server by default. Leave the page or lock your phone, and the result is in the chat when you come back.',
      rows: [['Replies', 'A long answer is not cut off halfway because you left.'], ['Deep research', 'Dozens of searches and readings finish in the background.'], ['Model Council', 'The members’ discussion and the synthesis carry on.'], ['Image generation', 'Close the tab and the image still gets drawn.'], ['Web search', 'Search first, then answer, all on the server.']]
    },
    more: {
      eyebrow: 'And more', title: 'The details are taken care of.',
      tiles: [
        ['image', 'Image generation', 'Four image models, including GPT Image, FLUX and Nano Banana, draw in the chat and can keep editing.'],
        ['eye', 'Visual check', 'After a deck is made, each slide is drawn as an image and a model of your choice checks the layout again.'],
        ['code', 'Advanced mode', 'Run code in an isolated Python sandbox: process data, draw charts, produce files.'],
        ['user', 'Nouras', 'Save the roles and instructions you use often as your own assistants, and switch any time.'],
        ['search', 'Web search', 'When something recent matters, it looks first and answers after, with sources marked in the text.'],
        ['book', 'Learning mode', 'Helps you understand by guiding you, instead of handing over the answer.'],
        ['ghost', 'Temporary chat', 'Use it and go. No record is kept.'],
        ['mic', 'Voice input', 'Say it. It is faster than typing.'],
        ['globe', 'Five languages', '繁體中文, English, Français, Русский, Español.']
      ]
    },
    trust: {
      eyebrow: 'Privacy and trust', title: 'Your keys. Your data.',
      items: [
        ['Bring your own API key', 'Noureon does not resell model usage. You settle the cost directly with each provider.'],
        ['Local first', 'Chats, settings and keys stay in your browser by default. Cloud sync is optional and can be encrypted with a sync key.'],
        ['Deleted after use', 'When the server runs a reply, your key is held encrypted only until the reply ends, for 2 hours 15 minutes at most; the sandbox container is deleted right after.'],
        ['Open source (MIT)', 'The full source is public on GitHub. Read it line by line, or host it yourself.']
      ],
      source: 'View the source on GitHub', policy: 'Read the privacy policy'
    },
    final: { title: 'Start now.', lead: 'Have a set of API keys ready and you can use every feature within minutes.' },
    footer: {
      tagline: 'Think with more than one model.',
      product: 'Product', council: 'Model Council', research: 'Deep research', files: 'Files and decks', extensions: 'Extensions',
      resources: 'Resources', help: 'Help Center', updates: 'Updates', license: 'Open source license',
      legal: 'Legal', xLabel: 'Noureon on X, @NoureonAi'
    }
  },
  fr: {
    nav: { council: 'Conseil', research: 'Recherche approfondie', files: 'Fichiers', extensions: 'Extensions', privacy: 'Confidentialité', theme: 'Changer de thème clair ou sombre' },
    hero: {
      title: 'Réfléchir avec\nplus d’un modèle.',
      lead: 'Noureon réunit 14 fournisseurs et 38 modèles dans un seul espace de travail. Faites-les débattre, laissez-les enquêter à votre place, et recevez des fichiers prêts à l’emploi.',
      start: 'Commencer', how: 'Voir comment ça marche', hint: 'Faites défiler pour le voir à l’œuvre'
    },
    brands: 'Une seule fenêtre, les modèles de quatorze fournisseurs.',
    window: 'Discussion',
    stories: {
      council: {
        eyebrow: 'Conseil des modèles',
        caps: [
          { h: 'Les meilleurs modèles,\nautour d’une même table.', p: 'Choisissez de 2 à 5 membres et désignez celui qui fera la synthèse. Claude, GPT et Gemini donnent chacun leur avis sur la même question.', facts: ['38 modèles', '14 fournisseurs', 'Membres enregistrables en groupes'] },
          { h: 'D’abord seuls,\nensuite face à face.', p: 'En mode consensus, chaque membre répond seul ; le mode discussion ajoute un tour de critique et de révision. Au besoin, le conseil fait une seule recherche commune, pour que tous s’appuient sur les mêmes sources.', facts: ['Mode consensus', 'Mode discussion', 'Une recherche commune'] },
          { h: 'Une conclusion.\nTous les désaccords visibles.', p: 'Le synthétiseur ramène les avis à une seule réponse, avec un tableau des points d’accord et de divergence : qui approuve, qui hésite, et comment la question est tranchée.', facts: ['Consensus et différences', 'Positions côte à côte'] }
        ]
      },
      research: {
        eyebrow: 'Recherche approfondie',
        caps: [
          { h: 'Posez la question.\nLe reste lui revient.', p: 'Il établit d’abord un plan, puis cherche, lit et recoupe point par point. Tout s’exécute sur le serveur : fermer l’onglet ne l’arrête pas.', facts: ['Plan d’abord', 'Point par point', 'Exécuté sur le serveur'] },
          { h: 'Chaque étape,\nsous vos yeux.', p: 'Recherches, durée et avancement se mettent à jour en direct. Pour changer de cap, envoyez un message ; vous pouvez aussi mettre en pause ou arrêter à tout moment.', facts: ['Recherches et durée', 'Pause · Arrêt', 'Consignes en cours de route'] },
          { h: 'Un rapport\navec ses sources.', p: 'Un rapport complet avec citations et graphiques. Ouvrez-le pour le lire, puis exportez-le en PDF, Word ou Markdown.', facts: ['Citations', 'Lecture plein écran', 'PDF · Word · Markdown'] }
        ]
      },
      files: {
        eyebrow: 'Fichiers et présentations',
        caps: [
          { h: 'De la conversation\nau fichier fini.', p: 'Présentations, Word, Excel, PDF et une dizaine d’autres formats comme CSV, calendriers ou sous-titres, créés directement dans la discussion.', facts: ['PPTX', 'DOCX', 'XLSX', 'PDF'] },
          { h: 'D’abord l’aperçu.\nEnsuite le téléchargement.', p: 'Chaque fichier a son aperçu et son bouton de téléchargement. Présentation, document et tableur restent séparés : prenez seulement ce qu’il vous faut.', facts: ['Aperçu par fichier', 'Un fichier à la fois'] },
          { h: 'Plusieurs fichiers,\nun seul téléchargement.', p: 'Regroupez plusieurs fichiers dans un ZIP. Une fois la présentation prête, chaque diapositive peut être dessinée en image pour qu’un modèle vérifie la mise en page. 20 designs de présentation et 9 styles de document au choix.', facts: ['Archive ZIP', 'Contrôle visuel', '20 designs de présentation', '9 styles de document'] }
        ]
      }
    },
    ext: {
      eyebrow: 'Extensions', title: 'Ajoutez des capacités\nselon vos besoins.',
      lead: 'Les compétences sont des méthodes de travail écrites : 11 compétences officielles (comptes rendus, vérification des faits, relecture, résumés…), plus les vôtres, collées ou importées. Les outils en ligne de commande s’exécutent sur le serveur dans un conteneur isolé : 8 outils, dont Pandoc, FFmpeg, yt-dlp et csvkit. Accéder à un site exige d’abord votre accord.',
      facts: ['11 compétences officielles', '8 outils en ligne de commande', 'Importez vos propres compétences']
    },
    stats: {
      eyebrow: 'En chiffres', title: 'Chaque chiffre est utilisable dès maintenant.',
      items: [['38', 'modèles au choix'], ['14', 'fournisseurs'], ['2–5', 'membres du conseil'], ['20', 'designs de présentation'], ['11', 'compétences officielles'], ['8', 'outils en ligne de commande']]
    },
    server: {
      eyebrow: 'Exécution sur le serveur', title: 'Fermez l’onglet.\nLe travail continue.',
      lead: 'Les réponses s’exécutent par défaut sur le serveur. Quittez la page ou verrouillez votre téléphone : à votre retour, le résultat est dans la discussion.',
      rows: [['Réponses', 'Une longue réponse n’est pas coupée en route parce que vous êtes parti.'], ['Recherche approfondie', 'Des dizaines de recherches et de lectures se terminent en arrière-plan.'], ['Conseil des modèles', 'La discussion des membres et la synthèse se poursuivent.'], ['Génération d’images', 'Fermez l’onglet : l’image se dessine quand même.'], ['Recherche web', 'Chercher puis répondre, en une fois sur le serveur.']]
    },
    more: {
      eyebrow: 'Et aussi', title: 'Les détails sont réglés.',
      tiles: [
        ['image', 'Génération d’images', 'Quatre modèles d’image, dont GPT Image, FLUX et Nano Banana, dessinent dans la discussion et peuvent continuer à retoucher.'],
        ['eye', 'Contrôle visuel', 'Une fois la présentation faite, chaque diapositive est dessinée en image et le modèle de votre choix revérifie la mise en page.'],
        ['code', 'Mode avancé', 'Exécutez du code dans un bac à sable Python isolé : traiter des données, tracer des graphiques, produire des fichiers.'],
        ['user', 'Nouras', 'Enregistrez vos rôles et consignes habituels comme assistants à vous, et changez à tout moment.'],
        ['search', 'Recherche web', 'Quand l’actualité compte, il cherche d’abord et répond ensuite, avec les sources indiquées dans le texte.'],
        ['book', 'Mode apprentissage', 'Vous aide à comprendre en vous guidant, au lieu de donner la réponse.'],
        ['ghost', 'Discussion temporaire', 'On l’utilise et on part. Aucune trace n’est gardée.'],
        ['mic', 'Saisie vocale', 'Dites-le. C’est plus rapide que de taper.'],
        ['globe', 'Cinq langues', '繁體中文, English, Français, Русский, Español.']
      ]
    },
    trust: {
      eyebrow: 'Confidentialité et confiance', title: 'Vos clés. Vos données.',
      items: [
        ['Votre propre clé API', 'Noureon ne revend pas l’usage des modèles. Vous réglez directement chaque fournisseur.'],
        ['Local d’abord', 'Discussions, réglages et clés restent par défaut dans votre navigateur. La synchronisation cloud est facultative et peut être chiffrée avec une clé de synchronisation.'],
        ['Supprimé après usage', 'Quand le serveur exécute une réponse, votre clé n’est conservée chiffrée que jusqu’à la fin de la réponse, 2 h 15 au plus ; le conteneur du bac à sable est supprimé juste après.'],
        ['Open source (MIT)', 'Le code source complet est public sur GitHub. Lisez-le ligne à ligne, ou hébergez-le vous-même.']
      ],
      source: 'Voir le code source sur GitHub', policy: 'Lire la politique de confidentialité'
    },
    final: { title: 'Commencez maintenant.', lead: 'Munissez-vous de vos clés API et profitez de toutes les fonctions en quelques minutes.' },
    footer: {
      tagline: 'Réfléchir avec plus d’un modèle.',
      product: 'Produit', council: 'Conseil des modèles', research: 'Recherche approfondie', files: 'Fichiers et présentations', extensions: 'Extensions',
      resources: 'Ressources', help: 'Centre d’aide', updates: 'Mises à jour', license: 'Licence open source',
      legal: 'Mentions légales', xLabel: 'Noureon sur X, @NoureonAi'
    }
  },
  ru: {
    nav: { council: 'Совет', research: 'Глубокое исследование', files: 'Файлы', extensions: 'Расширения', privacy: 'Конфиденциальность', theme: 'Переключить светлую или тёмную тему' },
    hero: {
      title: 'Думайте не с одной\nмоделью.',
      lead: 'Noureon собирает 14 поставщиков и 38 моделей в одном рабочем пространстве. Пусть они спорят над вопросом, исследуют его за вас и возвращают готовые файлы.',
      start: 'Начать', how: 'Как это работает', hint: 'Прокрутите, чтобы увидеть, как это работает'
    },
    brands: 'Одно окно чата, модели четырнадцати поставщиков.',
    window: 'Чат',
    stories: {
      council: {
        eyebrow: 'Совет моделей',
        caps: [
          { h: 'Лучшие модели\nза одним столом.', p: 'Выберите от 2 до 5 участников и назначьте того, кто подведёт итог. Claude, GPT и Gemini высказываются по одному и тому же вопросу.', facts: ['38 моделей', '14 поставщиков', 'Участников можно сохранять группами'] },
          { h: 'Сначала поодиночке,\nпотом друг с другом.', p: 'В режиме консенсуса каждый отвечает сам; режим обсуждения добавляет круг взаимной оценки и правок. При необходимости совет один раз ищет в сети сообща, и все опираются на одни и те же материалы.', facts: ['Режим консенсуса', 'Режим обсуждения', 'Общий поиск'] },
          { h: 'Один вывод.\nВсе разногласия видны.', p: 'Ведущий сводит мнения к одному ответу и прикладывает таблицу согласия и расхождений: кто за, кто с оговорками и как решили.', facts: ['Согласие и расхождения', 'Позиции рядом'] }
        ]
      },
      research: {
        eyebrow: 'Глубокое исследование',
        caps: [
          { h: 'Задайте вопрос.\nОстальное — за ним.', p: 'Сначала план, затем поиск, чтение и сверка пункт за пунктом. Всё выполняется на сервере, поэтому закрытая вкладка исследованию не мешает.', facts: ['Сначала план', 'Пункт за пунктом', 'Работает на сервере'] },
          { h: 'Каждый шаг\nна виду.', p: 'Число поисков, время и ход работы обновляются сразу. Чтобы изменить курс, отправьте сообщение; можно также поставить на паузу или остановить.', facts: ['Поиски и время', 'Пауза · Стоп', 'Уточнения по ходу'] },
          { h: 'Отчёт\nс источниками.', p: 'Полный отчёт со ссылками и графиками. Откройте его для чтения и экспортируйте в PDF, Word или Markdown.', facts: ['Ссылки на источники', 'Чтение на весь экран', 'PDF · Word · Markdown'] }
        ]
      },
      files: {
        eyebrow: 'Файлы и презентации',
        caps: [
          { h: 'Из разговора —\nсразу в файл.', p: 'Презентации, Word, Excel, PDF и ещё около десятка форматов, например CSV, календари и субтитры, создаются прямо в чате.', facts: ['PPTX', 'DOCX', 'XLSX', 'PDF'] },
          { h: 'Сначала просмотр.\nПотом загрузка.', p: 'У каждого файла свой просмотр и своя кнопка загрузки. Презентация, документ и таблица отдельны — берите только нужное.', facts: ['Просмотр каждого файла', 'Загрузка по одному'] },
          { h: 'Несколько файлов —\nодной загрузкой.', p: 'Несколько файлов можно упаковать в один ZIP. Когда презентация готова, каждый слайд можно нарисовать картинкой, чтобы модель проверила вёрстку. На выбор 20 дизайнов презентаций и 9 стилей документов.', facts: ['Архив ZIP', 'Визуальная проверка', '20 дизайнов презентаций', '9 стилей документов'] }
        ]
      }
    },
    ext: {
      eyebrow: 'Расширения', title: 'Возможности —\nпо мере надобности.',
      lead: 'Навыки — это записанные приёмы работы: 11 официальных, среди них протоколы встреч, проверка фактов, вычитка и краткие изложения, а также ваши собственные, вставленные или загруженные. Командные инструменты работают на сервере в изолированном контейнере: их 8, среди них Pandoc, FFmpeg, yt-dlp и csvkit. Для выхода на сайт сначала нужно ваше согласие.',
      facts: ['11 официальных навыков', '8 командных инструментов', 'Загрузка своих пакетов навыков']
    },
    stats: {
      eyebrow: 'В цифрах', title: 'Каждая цифра — уже в работе.',
      items: [['38', 'моделей на выбор'], ['14', 'поставщиков'], ['2–5', 'участников совета'], ['20', 'дизайнов презентаций'], ['11', 'официальных навыков'], ['8', 'командных инструментов']]
    },
    server: {
      eyebrow: 'Работа на сервере', title: 'Закройте вкладку.\nРабота продолжится.',
      lead: 'Ответы по умолчанию выполняются на сервере. Уйдите со страницы или заблокируйте телефон — вернувшись, вы найдёте результат в чате.',
      rows: [['Ответы', 'Длинный ответ не обрывается на полуслове из-за того, что вы ушли.'], ['Глубокое исследование', 'Десятки поисков и прочтений завершаются в фоне.'], ['Совет моделей', 'Обсуждение участников и итоговая сводка идут своим чередом.'], ['Создание изображений', 'Закройте вкладку — изображение всё равно дорисуется.'], ['Поиск в сети', 'Сначала поиск, затем ответ — целиком на сервере.']]
    },
    more: {
      eyebrow: 'И ещё', title: 'О мелочах уже позаботились.',
      tiles: [
        ['image', 'Создание изображений', 'Четыре модели изображений, включая GPT Image, FLUX и Nano Banana, рисуют прямо в чате и могут продолжать правки.'],
        ['eye', 'Визуальная проверка', 'Когда презентация готова, каждый слайд рисуется картинкой, и выбранная вами модель ещё раз проверяет вёрстку.'],
        ['code', 'Расширенный режим', 'Запуск кода в изолированной песочнице Python: обработка данных, графики, готовые файлы.'],
        ['user', 'Nouras', 'Сохраняйте привычные роли и инструкции как собственных ассистентов и переключайтесь когда угодно.'],
        ['search', 'Поиск в сети', 'Когда важны свежие сведения, сначала ищет, потом отвечает, отмечая источники в тексте.'],
        ['book', 'Режим обучения', 'Помогает понять, направляя вас, а не выдавая готовый ответ.'],
        ['ghost', 'Временный чат', 'Воспользовались и ушли. Записей не остаётся.'],
        ['mic', 'Голосовой ввод', 'Просто скажите. Быстрее, чем печатать.'],
        ['globe', 'Пять языков', '繁體中文, English, Français, Русский, Español.']
      ]
    },
    trust: {
      eyebrow: 'Конфиденциальность и доверие', title: 'Ваши ключи. Ваши данные.',
      items: [
        ['Свой API-ключ', 'Noureon не перепродаёт использование моделей. Вы платите каждому поставщику напрямую.'],
        ['Сначала локально', 'Чаты, настройки и ключи по умолчанию хранятся в вашем браузере. Облачная синхронизация необязательна и может шифроваться ключом синхронизации.'],
        ['Удаляется после использования', 'Когда ответ выполняет сервер, ключ хранится в зашифрованном виде только до конца ответа, не дольше 2 часов 15 минут; контейнер песочницы удаляется сразу после.'],
        ['Открытый код (MIT)', 'Весь исходный код открыт на GitHub. Читайте его построчно или разверните у себя.']
      ],
      source: 'Исходный код на GitHub', policy: 'Читать политику конфиденциальности'
    },
    final: { title: 'Начните сейчас.', lead: 'Подготовьте API-ключи — и через несколько минут вам будут доступны все функции.' },
    footer: {
      tagline: 'Думайте не с одной моделью.',
      product: 'Продукт', council: 'Совет моделей', research: 'Глубокое исследование', files: 'Файлы и презентации', extensions: 'Расширения',
      resources: 'Ресурсы', help: 'Центр помощи', updates: 'Обновления', license: 'Открытая лицензия',
      legal: 'Правовая информация', xLabel: 'Noureon в X, @NoureonAi'
    }
  },
  es: {
    nav: { council: 'Consejo', research: 'Investigación profunda', files: 'Archivos', extensions: 'Extensiones', privacy: 'Privacidad', theme: 'Cambiar entre tema claro y oscuro' },
    hero: {
      title: 'Piensa con más\nde un modelo.',
      lead: 'Noureon reúne 14 proveedores y 38 modelos en un solo espacio de trabajo. Haz que debatan una pregunta, que investiguen por ti y que te entreguen archivos listos para usar.',
      start: 'Empezar', how: 'Ver cómo funciona', hint: 'Desplázate para verlo en acción'
    },
    brands: 'Una sola ventana, modelos de catorce proveedores.',
    window: 'Chat',
    stories: {
      council: {
        eyebrow: 'Consejo de modelos',
        caps: [
          { h: 'Los mejores modelos,\nen la misma mesa.', p: 'Elige de 2 a 5 miembros y designa a quien hará la síntesis. Claude, GPT y Gemini opinan cada uno sobre la misma pregunta.', facts: ['38 modelos', '14 proveedores', 'Miembros guardables en grupos'] },
          { h: 'Primero cada uno,\nluego frente a frente.', p: 'En el modo consenso cada miembro responde por su cuenta; el modo debate añade una ronda de crítica y revisión. Cuando conviene, el consejo busca una sola vez en común, y todos se basan en el mismo material.', facts: ['Modo consenso', 'Modo debate', 'Una búsqueda compartida'] },
          { h: 'Una conclusión.\nCada desacuerdo a la vista.', p: 'El sintetizador reduce las opiniones a una respuesta, con una tabla de lo que acuerdan y de en qué difieren: quién la apoya, quién se reserva y cómo se resolvió.', facts: ['Consenso y diferencias', 'Posturas lado a lado'] }
        ]
      },
      research: {
        eyebrow: 'Investigación profunda',
        caps: [
          { h: 'Haz la pregunta.\nEl resto es cosa suya.', p: 'Primero redacta un plan; luego busca, lee y contrasta punto por punto. Todo se ejecuta en el servidor, así que cerrar la pestaña no lo detiene.', facts: ['Primero el plan', 'Punto por punto', 'Se ejecuta en el servidor'] },
          { h: 'Cada paso,\na la vista.', p: 'Búsquedas, tiempo y avance se actualizan al instante. Para cambiar de rumbo, envía un mensaje; también puedes pausar o detener en cualquier momento.', facts: ['Búsquedas y tiempo', 'Pausar · Detener', 'Indicaciones durante la marcha'] },
          { h: 'Un informe\ncon sus fuentes.', p: 'Un informe completo con citas y gráficos. Ábrelo para leerlo y expórtalo a PDF, Word o Markdown.', facts: ['Citas', 'Lectura a pantalla completa', 'PDF · Word · Markdown'] }
        ]
      },
      files: {
        eyebrow: 'Archivos y presentaciones',
        caps: [
          { h: 'De la conversación\ndirecto al archivo.', p: 'Presentaciones, Word, Excel, PDF y una docena más de formatos, como CSV, calendarios o subtítulos, creados dentro del chat.', facts: ['PPTX', 'DOCX', 'XLSX', 'PDF'] },
          { h: 'Primero la vista previa.\nDespués la descarga.', p: 'Cada archivo tiene su vista previa y su botón de descarga. Presentación, documento y hoja de cálculo van por separado: llévate solo lo que necesites.', facts: ['Vista previa por archivo', 'Descarga individual'] },
          { h: 'Varios archivos,\nuna sola descarga.', p: 'Reúne varios archivos en un ZIP. Cuando la presentación está lista, cada diapositiva puede dibujarse como imagen para que un modelo revise la maquetación. Hay 20 diseños de presentación y 9 estilos de documento a elegir.', facts: ['Paquete ZIP', 'Revisión visual', '20 diseños de presentación', '9 estilos de documento'] }
        ]
      }
    },
    ext: {
      eyebrow: 'Extensiones', title: 'Capacidades\nsegún las necesites.',
      lead: 'Las habilidades son formas de trabajo ya escritas: 11 oficiales, como actas de reunión, comprobación de datos, corrección y resúmenes, además de las tuyas, pegadas o subidas. Las herramientas de línea de comandos se ejecutan en el servidor, en un contenedor aislado: son 8, entre ellas Pandoc, FFmpeg, yt-dlp y csvkit. Para conectarse a un sitio web hace falta antes tu aprobación.',
      facts: ['11 habilidades oficiales', '8 herramientas de comandos', 'Sube tus propios paquetes de habilidades']
    },
    stats: {
      eyebrow: 'En cifras', title: 'Cada cifra, lista para usar.',
      items: [['38', 'modelos a elegir'], ['14', 'proveedores'], ['2–5', 'miembros del consejo'], ['20', 'diseños de presentación'], ['11', 'habilidades oficiales'], ['8', 'herramientas de comandos']]
    },
    server: {
      eyebrow: 'Ejecución en el servidor', title: 'Cierra la pestaña.\nEl trabajo sigue.',
      lead: 'Las respuestas se ejecutan por defecto en el servidor. Sal de la página o bloquea el teléfono: al volver, el resultado ya está en el chat.',
      rows: [['Respuestas', 'Una respuesta larga no se corta a medias porque te hayas ido.'], ['Investigación profunda', 'Decenas de búsquedas y lecturas terminan en segundo plano.'], ['Consejo de modelos', 'El debate de los miembros y la síntesis continúan.'], ['Generación de imágenes', 'Cierra la pestaña y la imagen se dibuja igualmente.'], ['Búsqueda web', 'Buscar y luego responder, todo en el servidor.']]
    },
    more: {
      eyebrow: 'Y más', title: 'Los detalles ya están cuidados.',
      tiles: [
        ['image', 'Generación de imágenes', 'Cuatro modelos de imagen, entre ellos GPT Image, FLUX y Nano Banana, dibujan en el chat y pueden seguir retocando.'],
        ['eye', 'Revisión visual', 'Cuando la presentación está hecha, cada diapositiva se dibuja como imagen y el modelo que elijas revisa de nuevo la maquetación.'],
        ['code', 'Modo avanzado', 'Ejecuta código en un entorno aislado de Python: procesar datos, trazar gráficos, producir archivos.'],
        ['user', 'Nouras', 'Guarda los roles e instrucciones que más usas como asistentes propios y cambia cuando quieras.'],
        ['search', 'Búsqueda web', 'Cuando importa lo reciente, busca primero y responde después, con las fuentes marcadas en el texto.'],
        ['book', 'Modo aprendizaje', 'Te ayuda a comprender guiándote, en lugar de darte la respuesta hecha.'],
        ['ghost', 'Chat temporal', 'Lo usas y te vas. No queda ningún registro.'],
        ['mic', 'Entrada de voz', 'Dilo en voz alta. Es más rápido que escribir.'],
        ['globe', 'Cinco idiomas', '繁體中文, English, Français, Русский, Español.']
      ]
    },
    trust: {
      eyebrow: 'Privacidad y confianza', title: 'Tus claves. Tus datos.',
      items: [
        ['Tu propia clave de API', 'Noureon no revende el uso de los modelos. Pagas directamente a cada proveedor.'],
        ['Primero en local', 'Chats, ajustes y claves se quedan por defecto en tu navegador. La sincronización en la nube es opcional y puede cifrarse con una clave de sincronización.'],
        ['Se borra tras el uso', 'Cuando el servidor ejecuta una respuesta, tu clave se conserva cifrada solo hasta que termina, 2 horas y 15 minutos como máximo; el contenedor del entorno aislado se elimina justo después.'],
        ['Código abierto (MIT)', 'El código fuente completo es público en GitHub. Léelo línea a línea o alójalo tú mismo.']
      ],
      source: 'Ver el código en GitHub', policy: 'Leer la política de privacidad'
    },
    final: { title: 'Empieza ahora.', lead: 'Ten a mano tus claves de API y usarás todas las funciones en unos minutos.' },
    footer: {
      tagline: 'Piensa con más de un modelo.',
      product: 'Producto', council: 'Consejo de modelos', research: 'Investigación profunda', files: 'Archivos y presentaciones', extensions: 'Extensiones',
      resources: 'Recursos', help: 'Centro de ayuda', updates: 'Novedades', license: 'Licencia de código abierto',
      legal: 'Legal', xLabel: 'Noureon en X, @NoureonAi'
    }
  }
};

export default HOME_TEXTS;
