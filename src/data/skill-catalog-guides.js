// What the Extensions page tells about an official skill when its details are opened, a little more than the line of the list: how it works (`about`) and a few
// requests to try (`examples`), in the app's five languages. Kept apart from skill-catalog.js like the texts of the skills (skill-catalog-bodies.js), so the page that
// shows the list does not carry them: the page loads this file when the details of a skill are opened. Only the page reads it (the model is given the text of the skill,
// not this). A skill of the list has its guide here under its name; what the guide says must be what the text of the skill does.

export const OFFICIAL_SKILL_GUIDES = Object.freeze({
  'skill-creator': {
    'zh-TW': {
      about: '想把重複做的事變成可以反覆使用的技能時用。它會先問清楚這個技能要在什麼情況下用、要做出什麼結果，接著寫草稿、拿一個例子試做、依結果修改；最後在聊天室放一張技能草稿卡，你讀過全文、按下「加入」才會存進你的技能。模型自己不能儲存技能。',
      examples: ['幫我把剛才整理週報的做法做成技能', '我想要一個固定用來回覆客戶抱怨信的技能', '我加的這個技能很少被用到，幫我改好']
    },
    en: {
      about: 'Use it when you want to turn something you do again and again into a skill. It first asks what the skill is for and when it should be used, then writes a draft, tries it on an example and improves it; at the end it puts a skill draft card in the chat, and the skill is saved only when you have read it all and press Add. The model cannot save a skill itself.',
      examples: ['Turn the way I just put together my weekly report into a skill', 'I want a skill I can always use to reply to customer complaints', 'This skill I added is rarely used, please fix it']
    },
    fr: {
      about: 'À utiliser pour transformer en compétence ce que vous faites sans cesse. Elle demande d’abord à quoi sert la compétence et quand l’utiliser, puis rédige un brouillon, l’essaie sur un exemple et l’améliore ; à la fin elle place une carte de brouillon dans la conversation, et la compétence n’est enregistrée que lorsque vous avez tout lu et appuyé sur Ajouter. Le modèle ne peut pas enregistrer une compétence lui-même.',
      examples: ['Transforme en compétence ma façon de préparer mon rapport hebdomadaire', 'Je voudrais une compétence pour répondre aux réclamations de clients', 'Cette compétence que j’ai ajoutée est rarement utilisée, corrige-la']
    },
    ru: {
      about: 'Нужен, когда вы хотите превратить то, что делаете снова и снова, в навык. Сначала он выясняет, для чего нужен навык и когда его использовать, затем пишет черновик, пробует его на примере и улучшает; в конце в чат попадает карточка черновика, и навык сохраняется, только когда вы прочли всё и нажали «Добавить». Сама модель сохранить навык не может.',
      examples: ['Сделай навык из того, как я только что собрал еженедельный отчёт', 'Мне нужен навык для ответов на жалобы клиентов', 'Этот навык, который я добавил, почти не срабатывает, исправь его']
    },
    es: {
      about: 'Úsala cuando quieras convertir en habilidad algo que haces una y otra vez. Primero pregunta para qué sirve la habilidad y cuándo usarla, luego redacta un borrador, lo prueba con un ejemplo y lo mejora; al final pone una tarjeta de borrador en el chat, y la habilidad solo se guarda cuando la has leído entera y pulsas Añadir. El modelo no puede guardar una habilidad por sí mismo.',
      examples: ['Convierte en habilidad la forma en que acabo de preparar mi informe semanal', 'Quiero una habilidad para responder a quejas de clientes', 'Esta habilidad que añadí casi no se usa, arréglala']
    }
  },
  'meeting-notes': {
    'zh-TW': {
      about: '貼上會議筆記、逐字稿或錄音轉成的文字，它會整理出摘要、決議、待辦事項（動作、負責人、期限）以及待解問題與風險。筆記沒寫的標題、日期或與會者會標示「未提及」，沒有指定負責人的待辦會標示「未指派」，不會替你猜。預設約一頁，需要完整會議紀錄可以直接說。',
      examples: ['把這份會議逐字稿整理成會議記錄，我要待辦清單', '這是今天客戶電話的筆記，幫我列出決議和誰要做什麼', '整理成完整會議紀錄，最後附一則給大家的跟進訊息']
    },
    en: {
      about: 'Paste meeting notes, a transcript or the text of a voice memo, and it makes a record with the summary, the decisions, the action items (action, owner, due date) and the open questions and risks. A title, date or attendee that the notes do not give is marked as not stated, and an action nobody owns is marked as unassigned, never guessed. The record is about one page; ask if you want full minutes.',
      examples: ['Turn this meeting transcript into meeting notes, I want the action items', 'These are my notes from today’s client call, list the decisions and who does what', 'Write full minutes and add a follow-up message for everyone at the end']
    },
    fr: {
      about: 'Collez des notes de réunion, une transcription ou le texte d’un mémo vocal, et elle produit un compte rendu avec le résumé, les décisions, les actions (action, responsable, échéance) et les questions ouvertes et risques. Un titre, une date ou un participant que les notes ne donnent pas est marqué comme non indiqué, et une action sans responsable est marquée comme non attribuée, jamais devinée. Le compte rendu tient sur une page environ ; demandez un procès-verbal complet si vous le souhaitez.',
      examples: ['Transforme cette transcription en compte rendu, je veux la liste des actions', 'Voici mes notes de l’appel client d’aujourd’hui, liste les décisions et qui fait quoi', 'Rédige un procès-verbal complet et ajoute à la fin un message de suivi pour tous']
    },
    ru: {
      about: 'Вставьте заметки со встречи, расшифровку или текст голосовой заметки, и получите протокол: итоги, решения, задачи (действие, исполнитель, срок), открытые вопросы и риски. Название, дату или участников, которых нет в заметках, он помечает как не указанные, а задачу без исполнителя — как неназначенную, ничего не домысливая. Протокол занимает около страницы; если нужен полный протокол, скажите об этом.',
      examples: ['Преврати эту расшифровку встречи в протокол, мне нужен список задач', 'Это мои заметки с сегодняшнего звонка с клиентом: перечисли решения и кто что делает', 'Составь полный протокол и добавь в конце сообщение для всех с дальнейшими шагами']
    },
    es: {
      about: 'Pega notas de una reunión, una transcripción o el texto de una nota de voz, y obtienes un acta con el resumen, las decisiones, las tareas (acción, responsable, fecha) y las preguntas abiertas y riesgos. Un título, una fecha o un asistente que las notas no dan se marca como no indicado, y una tarea sin responsable se marca como sin asignar, nunca se adivina. El acta ocupa más o menos una página; pide un acta completa si la quieres.',
      examples: ['Convierte esta transcripción de la reunión en un acta, quiero la lista de tareas', 'Estas son mis notas de la llamada de hoy con el cliente: lista las decisiones y quién hace qué', 'Redacta un acta completa y añade al final un mensaje de seguimiento para todos']
    }
  },
  proofread: {
    'zh-TW': {
      about: '貼上文字，它只修正拼字、文法、標點與用詞，保留你原本的意思、語氣和用字習慣（繁體或簡體、英式或美式等都不會被換掉），並列出改了什麼，讓你逐項決定要不要採用。預設只修錯誤；想把笨拙的句子也順一順，可以說「潤飾」。它不翻譯，也不查內容是否正確。',
      examples: ['幫我校對這封要寄給客戶的信', '這段英文文法有沒有錯？只改錯的，不要重寫', '幫我潤飾這段自我介紹，保留我的語氣']
    },
    en: {
      about: 'Paste a text and it fixes only the spelling, grammar, punctuation and wording, keeping your meaning, voice and choices (it does not switch between Traditional and Simplified Chinese, British and American English, and so on), and lists what it changed so you can decide on each change. By default it fixes mistakes only; say “polish” if you also want clumsy sentences smoothed. It does not translate and does not check whether the content is true.',
      examples: ['Proofread this email I am about to send to a customer', 'Is the grammar of this paragraph right? Fix only what is wrong, do not rewrite it', 'Polish this self-introduction and keep my voice']
    },
    fr: {
      about: 'Collez un texte et elle ne corrige que l’orthographe, la grammaire, la ponctuation et les tournures, en gardant votre sens, votre ton et vos choix (elle ne change pas de variante : chinois traditionnel ou simplifié, anglais britannique ou américain, etc.), et liste ce qu’elle a changé pour que vous décidiez de chaque modification. Par défaut elle ne corrige que les fautes ; dites « peaufiner » si vous voulez aussi alléger les phrases maladroites. Elle ne traduit pas et ne vérifie pas si le contenu est vrai.',
      examples: ['Relis cet e-mail que je vais envoyer à un client', 'La grammaire de ce paragraphe est-elle correcte ? Corrige seulement les erreurs, sans réécrire', 'Peaufine cette présentation de moi en gardant mon ton']
    },
    ru: {
      about: 'Вставьте текст, и он исправит только орфографию, грамматику, пунктуацию и формулировки, сохранив ваш смысл, стиль и выбор слов (он не меняет вариант языка: традиционные или упрощённые иероглифы, британский или американский английский и так далее), и перечислит, что изменено, чтобы вы решали по каждой правке. По умолчанию исправляются только ошибки; скажите «отшлифуй», если нужно сгладить и неуклюжие предложения. Он не переводит и не проверяет, правдив ли текст.',
      examples: ['Вычитай это письмо, которое я собираюсь отправить клиенту', 'Правильна ли грамматика в этом абзаце? Исправь только ошибки, не переписывай', 'Отшлифуй этот рассказ о себе, сохранив мой стиль']
    },
    es: {
      about: 'Pega un texto y solo corrige la ortografía, la gramática, la puntuación y la redacción, manteniendo tu sentido, tu tono y tus decisiones (no cambia de variante: chino tradicional o simplificado, inglés británico o americano, etc.), y enumera lo que cambió para que decidas sobre cada cambio. Por defecto solo corrige errores; di «pulir» si también quieres suavizar frases torpes. No traduce ni comprueba si el contenido es cierto.',
      examples: ['Corrige este correo que voy a enviar a un cliente', '¿Está bien la gramática de este párrafo? Corrige solo lo que esté mal, sin reescribir', 'Pule esta presentación personal y mantén mi tono']
    }
  },
  'fact-check': {
    'zh-TW': {
      about: '貼上文字或一段說法，它會把事實主張一項一項拆開，逐項給出判定（有根據、部分正確、有矛盾、已過時、無法查證）、證據與來源，最後說明哪些沒有查、哪些無法查證。它查的是「說法是否屬實」，不是文字寫得好不好。',
      examples: ['幫我查核這篇文章裡的數字和日期', '「長城從太空看得見」這是真的嗎？', '這段新聞稿的說法哪些有根據、哪些查不到？']
    },
    en: {
      about: 'Paste a text or a claim and it takes the factual claims one by one, giving each a verdict (supported, partly true, contradicted, outdated, cannot verify) with the evidence and the source, and ends by saying what was not checked or could not be verified. It checks whether what is said is true, not how well the text is written.',
      examples: ['Fact-check the numbers and dates in this article', 'Is it true that the Great Wall is visible from space?', 'Which claims in this press release are supported and which cannot be found?']
    },
    fr: {
      about: 'Collez un texte ou une affirmation et elle prend les affirmations factuelles une à une, avec pour chacune un verdict (étayée, en partie vraie, contredite, dépassée, invérifiable), les preuves et la source, et termine en disant ce qui n’a pas été vérifié ou ne peut pas l’être. Elle vérifie si ce qui est dit est vrai, pas la qualité de l’écriture.',
      examples: ['Vérifie les chiffres et les dates de cet article', 'Est-il vrai que la Grande Muraille est visible depuis l’espace ?', 'Quelles affirmations de ce communiqué sont étayées et lesquelles restent introuvables ?']
    },
    ru: {
      about: 'Вставьте текст или утверждение, и оно разберёт фактические утверждения по одному: для каждого — вердикт (подтверждено, частично верно, опровергнуто, устарело, проверить нельзя), доказательства и источник; в конце сказано, что не проверялось или не поддаётся проверке. Проверяется, правда ли сказанное, а не то, как хорошо написан текст.',
      examples: ['Проверь цифры и даты в этой статье', 'Правда ли, что Великую Китайскую стену видно из космоса?', 'Какие утверждения в этом пресс-релизе подтверждены, а какие найти не удаётся?']
    },
    es: {
      about: 'Pega un texto o una afirmación y toma las afirmaciones factuales una a una, con un veredicto para cada una (respaldada, parcialmente cierta, contradicha, desactualizada, no verificable), la evidencia y la fuente, y termina diciendo qué no se comprobó o no se pudo verificar. Comprueba si lo que se dice es cierto, no lo bien escrito que está el texto.',
      examples: ['Verifica las cifras y las fechas de este artículo', '¿Es cierto que la Gran Muralla se ve desde el espacio?', '¿Qué afirmaciones de este comunicado están respaldadas y cuáles no se encuentran?']
    }
  },
  storyline: {
    'zh-TW': {
      about: '給它主題、筆記或粗略素材，它會先弄清楚聽眾、目標和時間，寫下一句核心訊息，再給逐頁大綱：每頁標題直接講出重點、這一頁需要什麼證據，並估計時間。它做的是大綱，不是簡報檔。問題問得少：缺的資訊會先做合理的假設，並說明假設了什麼。',
      examples: ['我要向主管提案導入新的客服系統，幫我排簡報大綱', '10 分鐘的專題報告，主題是校園節電，幫我想故事線', '我有一份季度數據，要向董事會報告，怎麼安排？']
    },
    en: {
      about: 'Give it a topic, notes or rough material, and it first works out the audience, the goal and the time, writes the one key message, then gives a slide-by-slide outline: a title that makes the point, the evidence each slide needs, and the timing. It makes the outline, not the slide file. It asks few questions: when something is missing it assumes something sensible and says what it assumed.',
      examples: ['I need to propose a new customer-service system to my manager, plan the deck outline', 'A 10-minute project talk on saving energy on campus, help me find the storyline', 'I have quarterly figures to present to the board, how should I structure it?']
    },
    fr: {
      about: 'Donnez-lui un sujet, des notes ou une matière brute, et elle cerne d’abord le public, l’objectif et la durée, écrit le message clé, puis propose un plan diapositive par diapositive : un titre qui énonce le propos, les preuves dont chaque diapositive a besoin, et le temps. Elle fait le plan, pas le fichier de présentation. Elle pose peu de questions : quand une information manque, elle fait une hypothèse raisonnable et dit laquelle.',
      examples: ['Je dois proposer un nouveau système de service client à mon responsable, prépare le plan de la présentation', 'Un exposé de 10 minutes sur les économies d’énergie sur le campus, aide-moi à trouver le fil conducteur', 'J’ai des chiffres trimestriels à présenter au conseil, comment les structurer ?']
    },
    ru: {
      about: 'Дайте тему, заметки или черновой материал, и она сначала выяснит аудиторию, цель и время, сформулирует главную мысль, а затем даст план по слайдам: заголовок, который сам выражает мысль, какие доказательства нужны каждому слайду и время. Это план, а не файл презентации. Вопросов она задаёт мало: если чего-то не хватает, делает разумное допущение и говорит, какое.',
      examples: ['Мне нужно предложить руководителю новую систему поддержки клиентов, составь план презентации', 'Доклад на 10 минут об экономии энергии в кампусе, помоги найти сюжет', 'У меня квартальные цифры для совета директоров, как их выстроить?']
    },
    es: {
      about: 'Dale un tema, notas o material en bruto, y primero averigua el público, el objetivo y el tiempo, escribe el mensaje clave y luego da un esquema diapositiva por diapositiva: un título que exprese la idea, la evidencia que necesita cada diapositiva y el tiempo. Hace el esquema, no el archivo de la presentación. Pregunta poco: cuando falta algo, hace una suposición razonable y dice cuál.',
      examples: ['Tengo que proponer a mi jefe un nuevo sistema de atención al cliente, prepara el esquema de la presentación', 'Una charla de 10 minutos sobre ahorro de energía en el campus, ayúdame a encontrar la historia', 'Tengo cifras trimestrales para presentar al consejo, ¿cómo las estructuro?']
    }
  },
  'email-writer': {
    'zh-TW': {
      about: '說出要寫給誰、想達成什麼，它會判斷目的、對象和語氣，給你可以直接寄的草稿；電子郵件、聊天訊息和正式信函各用合適的格式。語言會跟著收件人（回信就用對方的語言），稱呼與結尾也照該語言的習慣。它不會替你編造期限或事實，缺的資料會提醒你補上。它只寫草稿，不會幫你寄出。',
      examples: ['幫我回這封客戶來信，語氣禮貌但要堅定拒絕延期', '寫一則 LINE 訊息向同事道歉，我昨天忘了回覆', '把這封信縮短一半，語氣再溫和一點']
    },
    en: {
      about: 'Say who it is for and what you want, and it works out the purpose, the reader and the tone, then gives you a draft that is ready to send; an email, a chat message and a formal letter each get their own format. The language follows the recipient (a reply uses the language of the email), with that language’s greeting and closing. It does not invent deadlines or facts, and asks you for what is missing. It writes the draft; it never sends anything.',
      examples: ['Reply to this customer email, politely but firmly refusing the extension', 'Write a LINE message apologizing to a colleague, I forgot to reply yesterday', 'Make this email half as long and a bit softer']
    },
    fr: {
      about: 'Dites pour qui et ce que vous voulez, et elle cerne l’objectif, le destinataire et le ton, puis vous donne un brouillon prêt à envoyer ; un e-mail, un message de chat et une lettre formelle ont chacun leur format. La langue suit le destinataire (une réponse reprend la langue de l’e-mail), avec les formules d’appel et de politesse de cette langue. Elle n’invente ni échéances ni faits, et vous demande ce qui manque. Elle écrit le brouillon ; elle n’envoie jamais rien.',
      examples: ['Réponds à cet e-mail de client, poliment mais en refusant fermement le délai supplémentaire', 'Écris un message WhatsApp pour m’excuser auprès d’un collègue, j’ai oublié de répondre hier', 'Raccourcis cet e-mail de moitié et adoucis un peu le ton']
    },
    ru: {
      about: 'Скажите, кому и чего вы хотите, и она определит цель, адресата и тон, а затем даст готовый к отправке черновик; для письма, сообщения в чате и официального письма — свой формат. Язык подбирается по получателю (ответ — на языке письма), с обращением и завершением, принятыми в этом языке. Она не выдумывает сроки и факты и спрашивает, чего не хватает. Она пишет черновик и никогда ничего не отправляет.',
      examples: ['Ответь на это письмо клиента: вежливо, но твёрдо откажи в переносе срока', 'Напиши сообщение в мессенджере с извинениями коллеге: я вчера забыл ответить', 'Сократи это письмо вдвое и сделай тон мягче']
    },
    es: {
      about: 'Di para quién es y qué quieres, y averigua el propósito, el lector y el tono, y te da un borrador listo para enviar; un correo, un mensaje de chat y una carta formal tienen cada uno su formato. El idioma sigue al destinatario (una respuesta usa el idioma del correo), con los saludos y despedidas de ese idioma. No inventa plazos ni datos, y te pide lo que falta. Escribe el borrador; nunca envía nada.',
      examples: ['Responde a este correo de un cliente, con cortesía pero rechazando con firmeza la prórroga', 'Escribe un mensaje de WhatsApp para disculparme con un compañero, ayer olvidé responder', 'Acorta este correo a la mitad y suaviza un poco el tono']
    }
  },
  'research-brief': {
    'zh-TW': {
      about: '給它一個主題或問題，它會研究後寫成簡報：先給答案，再列證據、各種觀點（依支持程度分配篇幅）、不確定之處和來源。它會說明實際查了什麼、有哪些限制，查不到的就說查不到，不會用猜的補上。',
      examples: ['幫我研究固態電池目前的商業化進度', '想了解台灣寵物食品市場的現況，要附來源', '整理 WebGPU 和 WebGL 的差異與各自適用的情況']
    },
    en: {
      about: 'Give it a topic or a question and it researches it and writes a brief: the answer first, then the evidence, the viewpoints in proportion to their support, what is uncertain, and the sources. It says what it actually looked at and what the limits are, and says so when it cannot find something instead of filling the gap with a guess.',
      examples: ['Research how far solid-state batteries have come toward being sold', 'I want to understand the pet food market in Taiwan, with sources', 'Summarize the differences between WebGPU and WebGL and when each is used']
    },
    fr: {
      about: 'Donnez-lui un sujet ou une question et elle fait la recherche et rédige une note : la réponse d’abord, puis les preuves, les points de vue en proportion de leur soutien, ce qui est incertain et les sources. Elle dit ce qu’elle a réellement consulté et quelles sont les limites, et indique quand elle ne trouve pas quelque chose au lieu de combler le vide par une supposition.',
      examples: ['Recherche où en est la commercialisation des batteries à électrolyte solide', 'Je veux comprendre le marché de la nourriture pour animaux à Taïwan, avec les sources', 'Résume les différences entre WebGPU et WebGL et quand utiliser chacun']
    },
    ru: {
      about: 'Дайте тему или вопрос, и она проведёт исследование и напишет справку: сначала ответ, затем доказательства, точки зрения в пропорции к их обоснованности, то, что остаётся неясным, и источники. Она говорит, что действительно просмотрела и каковы ограничения, и прямо пишет, если чего-то найти не удалось, а не заполняет пробел догадкой.',
      examples: ['Исследуй, как далеко продвинулась коммерциализация твердотельных аккумуляторов', 'Хочу разобраться в рынке кормов для животных на Тайване, с источниками', 'Сформулируй различия между WebGPU и WebGL и когда что применяют']
    },
    es: {
      about: 'Dale un tema o una pregunta y lo investiga y redacta un informe: primero la respuesta, luego la evidencia, los puntos de vista en proporción a su respaldo, lo que es incierto y las fuentes. Dice qué consultó realmente y cuáles son los límites, y avisa cuando no encuentra algo en lugar de rellenar el hueco con una suposición.',
      examples: ['Investiga cuánto han avanzado las baterías de estado sólido hacia su comercialización', 'Quiero entender el mercado de comida para mascotas en Taiwán, con fuentes', 'Resume las diferencias entre WebGPU y WebGL y cuándo se usa cada uno']
    }
  },
  'source-compare': {
    'zh-TW': {
      about: '給它兩份以上的文章、報告或研究（貼上或指名都可以），它會整理它們的共同結論、互相矛盾之處與可能的原因，並分別評估每個來源在不同面向的可靠程度，而不是只給一個總分。來源很多時會先分組再比較；需要時可以用外部證據來驗證來源。',
      examples: ['比較這三篇關於遠距工作生產力的研究，哪個比較可信？', '這兩份報告的結論互相矛盾，幫我找出原因', '我貼了兩則報導同一件事的新聞，幫我交叉比對']
    },
    en: {
      about: 'Give it two or more articles, reports or studies (pasted or named) and it sets out what they agree on, where they conflict and why, and how reliable each source is on each point, not as one overall score. With many sources it groups them before comparing, and it can use outside evidence to check a source when that is needed.',
      examples: ['Compare these three studies on remote-work productivity, which is more trustworthy?', 'These two reports contradict each other, help me find out why', 'I pasted two news stories about the same event, cross-check them']
    },
    fr: {
      about: 'Donnez-lui au moins deux articles, rapports ou études (collés ou nommés) et elle expose ce sur quoi ils s’accordent, où ils divergent et pourquoi, et la fiabilité de chaque source selon les points, sans note globale unique. Avec beaucoup de sources, elle les regroupe avant de comparer, et peut s’appuyer sur des preuves extérieures pour vérifier une source si besoin.',
      examples: ['Compare ces trois études sur la productivité en télétravail, laquelle est la plus fiable ?', 'Ces deux rapports se contredisent, aide-moi à comprendre pourquoi', 'J’ai collé deux articles sur le même événement, recoupe-les']
    },
    ru: {
      about: 'Дайте два или больше источников — статей, отчётов или исследований (вставленных или названных), и она покажет, в чём они сходятся, где расходятся и почему, и насколько надёжен каждый источник по разным пунктам, а не одной общей оценкой. Если источников много, она сначала группирует их, а при необходимости проверяет источник по внешним данным.',
      examples: ['Сравни эти три исследования о продуктивности на удалёнке: какому можно верить больше?', 'Эти два отчёта противоречат друг другу, помоги понять почему', 'Я вставил две новости об одном событии, сопоставь их']
    },
    es: {
      about: 'Dale dos o más artículos, informes o estudios (pegados o nombrados) y expone en qué coinciden, dónde discrepan y por qué, y qué fiabilidad tiene cada fuente en cada aspecto, sin una única nota global. Con muchas fuentes las agrupa antes de comparar, y puede usar evidencia externa para comprobar una fuente cuando hace falta.',
      examples: ['Compara estos tres estudios sobre productividad en teletrabajo, ¿cuál es más fiable?', 'Estos dos informes se contradicen, ayúdame a averiguar por qué', 'Pegué dos noticias sobre el mismo suceso, contrástalas']
    }
  },
  'concept-explainer': {
    'zh-TW': {
      about: '問它一個觀念、理論或原理，它會依你的程度用白話說明：先用一句話講清楚是什麼、為什麼重要，再用具體的例子和小步驟拆開，最後提醒常見的誤解和說法的限制。簡單的問題只會得到簡短的回答；如果你說太難或太簡單，它會換個角度重講。不適合用來問安裝設定的步驟或排除某個錯誤。',
      examples: ['用國中生聽得懂的方式解釋什麼是複利', 'Supabase 的 row-level security 到底怎麼運作？', '我是工程師，快速講一下貝氏定理的直覺']
    },
    en: {
      about: 'Ask it about an idea, a theory or how something works and it explains in plain words at your level: one plain sentence on what it is and why it matters, then a concrete example and small steps, and at the end the usual misunderstandings and where the simple picture stops being true. A simple question gets a short answer, and if you say it is too hard or too easy it tries another angle. It is not for setup steps or fixing a specific error.',
      examples: ['Explain compound interest the way a middle-school student would understand', 'How does Supabase row-level security actually work?', 'I am an engineer, give me the intuition for Bayes’ theorem quickly']
    },
    fr: {
      about: 'Posez-lui une question sur une idée, une théorie ou le fonctionnement de quelque chose et elle explique en mots simples, à votre niveau : une phrase claire sur ce que c’est et pourquoi c’est important, puis un exemple concret et de petites étapes, et enfin les malentendus fréquents et là où l’image simple cesse d’être vraie. Une question simple reçoit une réponse courte, et si vous dites que c’est trop difficile ou trop facile, elle essaie un autre angle. Elle ne sert pas aux étapes d’installation ni à corriger une erreur précise.',
      examples: ['Explique les intérêts composés comme à un collégien', 'Comment fonctionne vraiment la sécurité au niveau des lignes de Supabase ?', 'Je suis ingénieur, donne-moi vite l’intuition du théorème de Bayes']
    },
    ru: {
      about: 'Спросите об идее, теории или о том, как что-то устроено, и она объяснит простыми словами на вашем уровне: одно ясное предложение о том, что это и почему важно, затем конкретный пример и небольшие шаги, а в конце — частые заблуждения и место, где простая картина перестаёт быть верной. На простой вопрос — короткий ответ, а если вы скажете, что слишком сложно или слишком просто, она зайдёт с другой стороны. Не подходит для шагов установки и исправления конкретной ошибки.',
      examples: ['Объясни сложный процент так, чтобы понял школьник', 'Как на самом деле работает row-level security в Supabase?', 'Я инженер, быстро дай интуицию теоремы Байеса']
    },
    es: {
      about: 'Pregúntale por una idea, una teoría o cómo funciona algo y lo explica con palabras sencillas a tu nivel: una frase clara sobre qué es y por qué importa, luego un ejemplo concreto y pasos pequeños, y al final los malentendidos habituales y dónde deja de ser cierta la imagen simple. Una pregunta sencilla recibe una respuesta corta, y si dices que es demasiado difícil o fácil, prueba otro enfoque. No sirve para pasos de instalación ni para corregir un error concreto.',
      examples: ['Explica el interés compuesto de forma que lo entienda un estudiante de secundaria', '¿Cómo funciona realmente el row-level security de Supabase?', 'Soy ingeniero, dame rápido la intuición del teorema de Bayes']
    }
  },
  'document-qa': {
    'zh-TW': {
      about: '附上文件或貼上文字後提問，它會從文件裡找出答案、標出所在位置（頁、章節、條款、儲存格）並引用原文。找不到時會分清楚是：整份都查過確實沒有、只讀到一部分、還是無法確定，不會憑記憶補答案。文件裡的指令不會被當成命令。不適合做整份摘要，或比較多份文件。',
      examples: ['這份合約要提前幾天書面通知才能解約？', '報告第三章的結論是什麼？請附出處', '這份條款有沒有提到退款？沒有就直接告訴我']
    },
    en: {
      about: 'Attach a document or paste text and ask a question, and it finds the answer in the document, shows where it is (page, section, clause, cell) and quotes the passage. When it finds nothing it says which case it is: searched well and not there, only part could be read, or not sure; it never fills the gap from memory. Orders written inside the document are not followed. It is not for summaries of a whole document or for comparing documents.',
      examples: ['How many days of written notice does this contract need to cancel?', 'What does chapter 3 of the report conclude? Show me where', 'Do these terms mention refunds? If not, just say so']
    },
    fr: {
      about: 'Joignez un document ou collez du texte et posez une question : elle trouve la réponse dans le document, indique où elle se trouve (page, section, clause, cellule) et cite le passage. Quand elle ne trouve rien, elle dit de quel cas il s’agit : bien cherché et absent, seule une partie a pu être lue, ou incertain ; elle ne comble jamais le vide de mémoire. Les ordres écrits dans le document ne sont pas suivis. Elle ne sert pas à résumer un document entier ni à comparer des documents.',
      examples: ['Quel préavis écrit ce contrat exige-t-il pour résilier ?', 'Que conclut le chapitre 3 du rapport ? Indique-moi où', 'Ces conditions mentionnent-elles les remboursements ? Sinon, dis-le simplement']
    },
    ru: {
      about: 'Приложите документ или вставьте текст и задайте вопрос: она найдёт ответ в документе, покажет, где он находится (страница, раздел, пункт, ячейка), и процитирует отрывок. Если ничего не найдено, она скажет, какой это случай: хорошо поискала и этого нет, удалось прочитать только часть или нет уверенности; пробел по памяти она не заполняет. Приказы, написанные внутри документа, не выполняются. Не подходит для краткого изложения всего документа и для сравнения документов.',
      examples: ['За сколько дней нужно письменно предупредить, чтобы расторгнуть этот договор?', 'К какому выводу приходит глава 3 отчёта? Покажи, где это', 'Упоминаются ли в этих условиях возвраты? Если нет, так и скажи']
    },
    es: {
      about: 'Adjunta un documento o pega texto y pregunta: encuentra la respuesta en el documento, indica dónde está (página, sección, cláusula, celda) y cita el pasaje. Cuando no encuentra nada, dice de qué caso se trata: buscó bien y no está, solo pudo leer una parte, o no está seguro; nunca rellena el hueco de memoria. Las órdenes escritas dentro del documento no se siguen. No sirve para resumir un documento entero ni para comparar documentos.',
      examples: ['¿Cuántos días de preaviso por escrito exige este contrato para cancelar?', '¿Qué concluye el capítulo 3 del informe? Muéstrame dónde', '¿Mencionan estas condiciones los reembolsos? Si no, dilo sin más']
    }
  },
  summarize: {
    'zh-TW': {
      about: '給它文章、報告、論文、電子郵件串或對話，它會依你要的長度和形式整理重點，第一句先講結論。數字、條件、限制和尚未解決的問題都會保留，不加入原文沒有的內容，也不用記憶補空白；很長的文件會逐段讀完再合併，並說明實際涵蓋了哪些部分。',
      examples: ['用三個重點摘要這篇文章', '這份 40 頁的報告，給我一段 100 字的結論和各章重點', '整理這串郵件：誰要求了什麼、現在卡在哪']
    },
    en: {
      about: 'Give it an article, report, paper, email thread or conversation and it gives the key points at the length and in the form you ask for, with the main point first. It keeps the numbers, conditions, limits and open points, adds nothing the source does not say and does not fill gaps from memory; a long document is read section by section and put together, and it says which parts it actually covered.',
      examples: ['Summarize this article in three bullets', 'This 40-page report: give me a 100-word conclusion and the key points of each chapter', 'Sum up this email thread: who asked for what, and where it is stuck now']
    },
    fr: {
      about: 'Donnez-lui un article, un rapport, un article scientifique, un fil d’e-mails ou une conversation et elle donne les points clés à la longueur et sous la forme voulues, l’essentiel en premier. Elle garde les chiffres, les conditions, les limites et les points ouverts, n’ajoute rien que la source ne dise et ne comble pas les vides de mémoire ; un long document est lu section par section puis assemblé, et elle indique quelles parties elle a réellement couvertes.',
      examples: ['Résume cet article en trois points', 'Ce rapport de 40 pages : donne-moi une conclusion de 100 mots et les points clés de chaque chapitre', 'Résume ce fil d’e-mails : qui a demandé quoi et où ça bloque']
    },
    ru: {
      about: 'Дайте статью, отчёт, научную работу, переписку или беседу, и она изложит главное в нужной вам длине и форме, начиная с главного. Цифры, условия, ограничения и нерешённые вопросы сохраняются, ничего сверх сказанного в источнике не добавляется, пробелы по памяти не заполняются; длинный документ читается по разделам и собирается воедино, и она говорит, какие части действительно охвачены.',
      examples: ['Перескажи эту статью в трёх пунктах', 'Этот отчёт на 40 страниц: дай вывод в 100 слов и главное по каждой главе', 'Подведи итог этой переписки: кто что просил и на чём всё застряло']
    },
    es: {
      about: 'Dale un artículo, informe, estudio, hilo de correos o conversación y te da los puntos clave con la extensión y la forma que pidas, con lo principal primero. Conserva las cifras, condiciones, límites y puntos abiertos, no añade nada que la fuente no diga y no rellena huecos de memoria; un documento largo se lee sección por sección y se junta, y dice qué partes cubrió realmente.',
      examples: ['Resume este artículo en tres puntos', 'Este informe de 40 páginas: dame una conclusión de 100 palabras y los puntos clave de cada capítulo', 'Resume este hilo de correos: quién pidió qué y dónde está atascado']
    }
  }
});
