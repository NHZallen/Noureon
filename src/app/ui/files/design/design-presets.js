// The 20 design templates. Each is only a complete set of design parameters
// (see design-params.js); the model or the user can change any of them, and
// "AI tuning" produces combinations that are none of these presets.
//
// `reference` records which vendor designs a preset studies. It is internal
// documentation and never shown in the product; names avoid brand names.

const preset = (reference, params, text) => Object.freeze({ reference, params: Object.freeze(params), text: Object.freeze(text) });
const t = (zhTW, en, fr, ru, es) => Object.freeze({ 'zh-TW': zhTW, en, fr, ru, es });

export const DESIGN_PRESETS = Object.freeze({
  keynote: preset('Apple product keynotes', {
    mode: 'dark', accent: '#2997FF', accent2: '#BF5AF2', background: 'neutral', colorUse: 'restrained', fonts: 'modern', headingWeight: 700, headingCase: 'normal', tracking: 'tight', typeScale: 1.5, titleSize: 'huge', density: 'airy', align: 'center', cover: 'type', section: 'rule', imageShape: 'rounded', motifs: [], labels: 'text', numbers: 'plain', bullets: 'dot', cards: 'flat', radius: 20, icons: 'line', chart: 'accent', imagery: 'rich'
  }, {
    name: t('發表會', 'Launch', 'Lancement', 'Запуск', 'Lanzamiento'),
    feature: t('純黑底、超大置中標題、一頁一句話', 'Pure black, huge centred headlines, one idea per slide', 'Fond noir, très grands titres centrés, une idée par diapositive', 'Чёрный фон, крупные заголовки по центру, одна мысль на слайд', 'Fondo negro, titulares enormes centrados, una idea por diapositiva'),
    fit: t('產品發表、主題演講', 'Product launches, keynotes', 'Lancements, conférences', 'Запуски продуктов, выступления', 'Lanzamientos, conferencias')
  }),
  whitespace: preset('Apple Keynote "Basic White"', {
    mode: 'light', accent: '#0071E3', accent2: null, background: 'neutral', colorUse: 'restrained', fonts: 'modern', headingWeight: 500, headingCase: 'normal', tracking: 'tight', typeScale: 1.35, titleSize: 'large', density: 'airy', align: 'left', cover: 'type', section: 'rule', imageShape: 'inset', motifs: [], labels: 'text', numbers: 'plain', bullets: 'dot', cards: 'flat', radius: 12, icons: 'none', chart: 'accent', imagery: 'some'
  }, {
    name: t('留白', 'Whitespace', 'Épuré', 'Простор', 'Espacio'),
    feature: t('白底、大量留白、沒有裝飾', 'White, generous space, no decoration', 'Fond blanc, beaucoup d’espace, sans décoration', 'Белый фон, много воздуха, без украшений', 'Fondo blanco, mucho espacio, sin adornos'),
    fit: t('通用、內部分享', 'Everyday use, internal updates', 'Usage courant, points internes', 'Повседневные и внутренние презентации', 'Uso diario, reuniones internas')
  }),
  consulting: preset('McKinsey and BCG slide standards', {
    mode: 'light', accent: '#1B3A8C', accent2: '#00A3E0', background: 'neutral', colorUse: 'restrained', fonts: 'consulting', headingWeight: 500, headingCase: 'normal', tracking: 'normal', typeScale: 1.2, titleSize: 'regular', density: 'compact', align: 'left', cover: 'band', section: 'rule', imageShape: 'inset', motifs: ['rules', 'meta'], labels: 'text', numbers: 'padded', bullets: 'square', cards: 'line', radius: 0, icons: 'none', chart: 'duo', imagery: 'none'
  }, {
    name: t('顧問報告', 'Consulting', 'Conseil', 'Консалтинг', 'Consultoría'),
    feature: t('結論式標題、細線、段落追蹤、灰色加重點色的圖表', 'Action titles, fine rules, section tracker, grey charts with one highlight', 'Titres-messages, filets fins, repère de section, graphiques gris avec un accent', 'Заголовки-выводы, тонкие линии, трекер раздела, серые графики с одним акцентом', 'Títulos con conclusión, filetes finos, indicador de sección, gráficos grises con un acento'),
    fit: t('策略報告、董事會', 'Strategy reports, board meetings', 'Rapports stratégiques, conseils d’administration', 'Стратегические отчёты, совет директоров', 'Informes estratégicos, consejos de administración')
  }),
  swiss: preset('Figma Community "Design Review" and "Product Roadmap"', {
    mode: 'dark', accent: '#FF4D2E', accent2: null, background: 'neutral', colorUse: 'restrained', fonts: 'tight', headingWeight: 500, headingCase: 'normal', tracking: 'tight', typeScale: 1.5, titleSize: 'huge', density: 'balanced', align: 'left', cover: 'type', section: 'number', imageShape: 'bleed', motifs: ['meta', 'rules'], labels: 'text', numbers: 'padded', bullets: 'dash', cards: 'line', radius: 0, icons: 'none', chart: 'duo', imagery: 'some'
  }, {
    name: t('瑞士網格', 'Swiss Grid', 'Grille suisse', 'Швейцарская сетка', 'Retícula suiza'),
    feature: t('黑底、緊湊無襯線字、四角小型資訊、細線', 'Black, tight grotesque type, corner labels, hairlines', 'Fond noir, linéale serrée, mentions dans les coins, filets', 'Чёрный фон, плотный гротеск, подписи по углам, тонкие линии', 'Fondo negro, grotesca compacta, datos en las esquinas, filetes'),
    fit: t('設計評審、產品路線圖', 'Design reviews, product roadmaps', 'Revues de design, feuilles de route', 'Дизайн-ревью, дорожные карты', 'Revisiones de diseño, hojas de ruta')
  }),
  editorial: preset('Pitch "Editorial"', {
    mode: 'light', accent: '#1F3D2B', accent2: null, background: 'warm', colorUse: 'balanced', fonts: 'editorial', headingWeight: 400, headingCase: 'upper', tracking: 'tight', typeScale: 1.5, titleSize: 'huge', density: 'balanced', align: 'center', cover: 'bleed', section: 'split', imageShape: 'bleed', motifs: ['meta'], labels: 'text', numbers: 'plain', bullets: 'dash', cards: 'line', radius: 0, icons: 'none', chart: 'accent', imagery: 'rich'
  }, {
    name: t('雜誌編輯', 'Editorial', 'Éditorial', 'Журнальный', 'Editorial'),
    feature: t('紙色底、全大寫襯線大標、滿版照片封面', 'Paper tone, uppercase serif headlines, full-bleed cover photo', 'Ton papier, grands titres à empattements en capitales, photo pleine page', 'Бумажный фон, заглавные антиквенные заголовки, фото на всю обложку', 'Tono papel, titulares serif en mayúsculas, portada a sangre'),
    fit: t('品牌故事、年度回顧', 'Brand stories, annual reviews', 'Récits de marque, bilans annuels', 'Истории бренда, годовые обзоры', 'Historias de marca, resúmenes anuales')
  }),
  softlight: preset('Pitch "Scale-Up Pitch Deck"', {
    mode: 'light', accent: '#6D5EF5', accent2: '#FF9A7A', background: 'tinted', colorUse: 'restrained', fonts: 'modern', headingWeight: 400, headingCase: 'normal', tracking: 'tight', typeScale: 1.4, titleSize: 'huge', density: 'balanced', align: 'left', cover: 'type', section: 'number', imageShape: 'rounded', motifs: ['glow'], labels: 'pill', numbers: 'plain', bullets: 'dot', cards: 'glass', radius: 20, icons: 'badge', chart: 'categorical', imagery: 'some'
  }, {
    name: t('柔光募資', 'Soft Glow', 'Halo doux', 'Мягкое свечение', 'Brillo suave'),
    feature: t('淡紫底、柔光漸層、細字重大標、半透明卡片', 'Soft lilac, glowing gradients, light large headlines, frosted cards', 'Lilas doux, halos lumineux, grands titres fins, cartes givrées', 'Нежно-сиреневый фон, мягкие градиенты, тонкие крупные заголовки, матовые карточки', 'Lila suave, degradados luminosos, titulares grandes y finos, tarjetas translúcidas'),
    fit: t('新創募資、產品介紹', 'Startup fundraising, product intros', 'Levées de fonds, présentations produit', 'Привлечение инвестиций, презентации продукта', 'Rondas de inversión, presentaciones de producto')
  }),
  ainative: preset('Pitch "AI-Native Pitch Deck", Linear', {
    mode: 'dark', accent: '#8B7CFF', accent2: '#38D5F5', background: 'cool', colorUse: 'restrained', fonts: 'tight', headingWeight: 500, headingCase: 'normal', tracking: 'tight', typeScale: 1.35, titleSize: 'large', density: 'balanced', align: 'center', cover: 'type', section: 'number', imageShape: 'rounded', motifs: ['glow', 'grid'], labels: 'bracket', numbers: 'padded', bullets: 'arrow', cards: 'glass', radius: 14, icons: 'line', chart: 'categorical', imagery: 'some'
  }, {
    name: t('AI 原生', 'AI Native', 'IA native', 'ИИ-стиль', 'IA nativa'),
    feature: t('深藍黑底、紫藍柔光、格線、括號標籤', 'Deep navy, violet-blue glow, grid, bracket labels', 'Bleu nuit, halo violet-bleu, grille, étiquettes entre crochets', 'Тёмно-синий фон, фиолетово-синее свечение, сетка, метки в скобках', 'Azul noche, brillo violeta y azul, retícula, etiquetas entre corchetes'),
    fit: t('AI 產品、技術新創', 'AI products, deep-tech startups', 'Produits d’IA, startups deep tech', 'ИИ-продукты, технологические стартапы', 'Productos de IA, startups tecnológicas')
  }),
  poster: preset('Figma "Agency Pitch", Canva bold pitch decks', {
    mode: 'light', accent: '#FF5B1F', accent2: '#1A1A1A', background: 'accent', colorUse: 'vivid', fonts: 'condensed', headingWeight: 700, headingCase: 'upper', tracking: 'normal', typeScale: 1.6, titleSize: 'huge', density: 'balanced', align: 'left', cover: 'type', section: 'number', imageShape: 'bleed', motifs: [], labels: 'pill', numbers: 'padded', bullets: 'square', cards: 'outline', radius: 0, icons: 'none', chart: 'duo', imagery: 'some'
  }, {
    name: t('大字海報', 'Poster', 'Affiche', 'Плакат', 'Póster'),
    feature: t('整面橘色、壓縮全大寫標題、膠囊標籤', 'Full orange, condensed uppercase headlines, pill labels', 'Orange intégral, titres condensés en capitales, étiquettes arrondies', 'Сплошной оранжевый, узкие заглавные заголовки, метки-капсулы', 'Naranja total, titulares condensados en mayúsculas, etiquetas en píldora'),
    fit: t('提案比稿、行銷活動', 'Pitches, marketing campaigns', 'Compétitions, campagnes marketing', 'Питчи, маркетинговые кампании', 'Propuestas, campañas de marketing')
  }),
  neon: preset('Figma "Startup Pitch"', {
    mode: 'light', accent: '#DDF247', accent2: '#111111', background: 'accent', colorUse: 'vivid', fonts: 'modern', headingWeight: 500, headingCase: 'normal', tracking: 'tight', typeScale: 1.4, titleSize: 'huge', density: 'balanced', align: 'center', cover: 'type', section: 'number', imageShape: 'rounded', motifs: [], labels: 'pill', numbers: 'plain', bullets: 'dot', cards: 'outline', radius: 24, icons: 'line', chart: 'duo', imagery: 'some'
  }, {
    name: t('螢光提案', 'Neon', 'Néon', 'Неон', 'Neón'),
    feature: t('整面螢光黃、黑字、大圓角', 'Full neon yellow, black type, big rounded shapes', 'Jaune fluo intégral, texte noir, grands arrondis', 'Сплошной неоново-жёлтый, чёрный текст, крупные скругления', 'Amarillo neón total, texto negro, grandes esquinas redondeadas'),
    fit: t('新創、活動、年輕品牌', 'Startups, events, young brands', 'Startups, événements, jeunes marques', 'Стартапы, события, молодые бренды', 'Startups, eventos, marcas jóvenes')
  }),
  noir: preset('Canva black-and-white minimal, Figma "Voice of Customer"', {
    mode: 'dark', accent: '#E5282E', accent2: null, background: 'neutral', colorUse: 'restrained', fonts: 'tight', headingWeight: 700, headingCase: 'normal', tracking: 'tight', typeScale: 1.35, titleSize: 'large', density: 'airy', align: 'left', cover: 'type', section: 'rule', imageShape: 'bleed', motifs: [], labels: 'text', numbers: 'padded', bullets: 'dash', cards: 'line', radius: 0, icons: 'none', chart: 'duo', imagery: 'some'
  }, {
    name: t('黑白極簡', 'Noir', 'Noir et blanc', 'Чёрно-белый', 'Blanco y negro'),
    feature: t('黑底白字，只有一個紅色重點', 'White on black with a single red accent', 'Blanc sur noir, un seul accent rouge', 'Белое на чёрном, единственный красный акцент', 'Blanco sobre negro con un único acento rojo'),
    fit: t('研究結果、評論', 'Findings, critiques', 'Résultats d’étude, critiques', 'Результаты исследований, обзоры', 'Hallazgos, análisis críticos')
  }),
  readout: preset('Figma "Research Readout" and "Product Review"', {
    mode: 'light', accent: '#2E55D6', accent2: '#F2CE3D', background: 'tinted', colorUse: 'restrained', fonts: 'plex', headingWeight: 400, headingCase: 'normal', tracking: 'normal', typeScale: 1.35, titleSize: 'large', density: 'balanced', align: 'left', cover: 'frame', section: 'rule', imageShape: 'inset', motifs: ['frame', 'meta'], labels: 'bracket', numbers: 'padded', bullets: 'dash', cards: 'outline', radius: 4, icons: 'line', chart: 'categorical', imagery: 'some'
  }, {
    name: t('研究筆記', 'Research Notes', 'Carnet de recherche', 'Исследование', 'Cuaderno de investigación'),
    feature: t('淡藍紙底、等寬字標籤、內框、黃色重點', 'Pale blue paper, monospaced labels, inset frame, yellow highlights', 'Papier bleu pâle, étiquettes à chasse fixe, cadre intérieur, touches jaunes', 'Бледно-голубая бумага, моноширинные метки, внутренняя рамка, жёлтые акценты', 'Papel azul claro, etiquetas monoespaciadas, marco interior, toques amarillos'),
    fit: t('使用者研究、實驗報告', 'User research, experiment reports', 'Recherche utilisateur, comptes rendus d’expérience', 'Пользовательские исследования, отчёты об экспериментах', 'Investigación de usuarios, informes de experimentos')
  }),
  lecture: preset('Google Slides "Simple Light" and academic conventions', {
    mode: 'light', accent: '#7A1E3A', accent2: null, background: 'neutral', colorUse: 'restrained', fonts: 'consulting', headingWeight: 700, headingCase: 'normal', tracking: 'normal', typeScale: 1.25, titleSize: 'regular', density: 'compact', align: 'left', cover: 'type', section: 'number', imageShape: 'inset', motifs: ['rules'], labels: 'text', numbers: 'plain', bullets: 'number', cards: 'outline', radius: 0, icons: 'none', chart: 'categorical', imagery: 'some'
  }, {
    name: t('學術講堂', 'Lecture', 'Cours magistral', 'Лекция', 'Clase magistral'),
    feature: t('白底、宋體標題、編號清楚', 'White, serif headings, clear numbering', 'Fond blanc, titres à empattements, numérotation claire', 'Белый фон, антиквенные заголовки, чёткая нумерация', 'Fondo blanco, títulos serif, numeración clara'),
    fit: t('課程、研究發表', 'Courses, research talks', 'Cours, communications scientifiques', 'Лекции, научные доклады', 'Cursos, ponencias de investigación')
  }),
  material: preset('Google Material 3 Expressive', {
    mode: 'light', accent: '#6442D6', accent2: '#FF8D6B', background: 'tinted', colorUse: 'balanced', fonts: 'geometric', headingWeight: 700, headingCase: 'normal', tracking: 'normal', typeScale: 1.35, titleSize: 'large', density: 'balanced', align: 'left', cover: 'split', section: 'field', imageShape: 'rounded', motifs: ['shapes'], labels: 'tag', numbers: 'circle', bullets: 'dot', cards: 'flat', radius: 28, icons: 'badge', chart: 'categorical', imagery: 'some'
  }, {
    name: t('活潑色調', 'Tonal Play', 'Tons vifs', 'Яркие тона', 'Tonos vivos'),
    feature: t('主色淡底、大圓角、幾何形、色調卡片', 'Tinted surfaces, large radii, geometric shapes, tonal cards', 'Surfaces teintées, grands arrondis, formes géométriques, cartes tonales', 'Тонированные поверхности, крупные скругления, геометрия, тональные карточки', 'Superficies tintadas, esquinas amplias, formas geométricas, tarjetas tonales'),
    fit: t('產品教學、App 介紹', 'Product tutorials, app tours', 'Tutoriels produit, présentations d’app', 'Обучение продукту, обзоры приложений', 'Tutoriales de producto, recorridos de app')
  }),
  bauhaus: preset('Microsoft PowerPoint "Geometric color block", Bauhaus', {
    mode: 'light', accent: '#1D3FBB', accent2: '#F2B705', background: 'warm', colorUse: 'vivid', fonts: 'geometric', headingWeight: 800, headingCase: 'upper', tracking: 'tight', typeScale: 1.4, titleSize: 'large', density: 'balanced', align: 'left', cover: 'split', section: 'field', imageShape: 'arch', motifs: ['shapes'], labels: 'tag', numbers: 'circle', bullets: 'square', cards: 'flat', radius: 0, icons: 'badge', chart: 'categorical', imagery: 'some'
  }, {
    name: t('幾何色塊', 'Geometric Blocks', 'Blocs géométriques', 'Геометрия', 'Bloques geométricos'),
    feature: t('藍黃雙色、半圓與方塊、拱形圖片', 'Blue and yellow, half circles and blocks, arched photos', 'Bleu et jaune, demi-cercles et blocs, photos en arche', 'Синий и жёлтый, полукруги и блоки, фото в арке', 'Azul y amarillo, semicírculos y bloques, fotos en arco'),
    fit: t('創意提案、設計教育', 'Creative proposals, design education', 'Propositions créatives, enseignement du design', 'Креативные предложения, обучение дизайну', 'Propuestas creativas, formación en diseño')
  }),
  classic: preset('Microsoft PowerPoint "Floral flourish", Pitch "Lush Lux"', {
    mode: 'dark', accent: '#C9A962', accent2: null, background: 'warm', colorUse: 'restrained', fonts: 'classical', headingWeight: 400, headingCase: 'normal', tracking: 'wide', typeScale: 1.35, titleSize: 'large', density: 'airy', align: 'center', cover: 'frame', section: 'number', imageShape: 'arch', motifs: ['frame'], labels: 'text', numbers: 'plain', bullets: 'dash', cards: 'outline', radius: 0, icons: 'none', chart: 'accent', imagery: 'rich'
  }, {
    name: t('文藝典雅', 'Classic', 'Classique', 'Классика', 'Clásico'),
    feature: t('深色底、古典明體、金色細框、置中', 'Dark, classical serif, fine gold frame, centred', 'Fond sombre, empattements classiques, fin cadre doré, centré', 'Тёмный фон, классическая антиква, тонкая золотая рамка, по центру', 'Fondo oscuro, serif clásica, fino marco dorado, centrado'),
    fit: t('頒獎、藝文、精品', 'Awards, arts, luxury', 'Remises de prix, culture, luxe', 'Награждения, культура, премиум', 'Premios, cultura, lujo')
  }),
  humane: preset('Pitch "Infinite Hiatus", Canva cream neutral templates', {
    mode: 'light', accent: '#5B6B2E', accent2: '#C8763A', background: 'warm', colorUse: 'balanced', fonts: 'kai', headingWeight: 700, headingCase: 'normal', tracking: 'normal', typeScale: 1.35, titleSize: 'large', density: 'balanced', align: 'left', cover: 'split', section: 'split', imageShape: 'arch', motifs: [], labels: 'text', numbers: 'plain', bullets: 'dot', cards: 'flat', radius: 16, icons: 'line', chart: 'accent', imagery: 'rich'
  }, {
    name: t('溫暖人文', 'Warm Humanist', 'Chaleureux', 'Тёплый', 'Cálido'),
    feature: t('米色紙底、文楷、橄欖綠、拱形照片', 'Cream paper, warm serif, olive green, arched photos', 'Papier crème, serif chaleureux, vert olive, photos en arche', 'Кремовая бумага, тёплая антиква, оливковый, фото в арке', 'Papel crema, serif cálida, verde oliva, fotos en arco'),
    fit: t('教育訓練、非營利、生活品牌', 'Training, non-profits, lifestyle brands', 'Formation, associations, marques lifestyle', 'Обучение, НКО, лайфстайл-бренды', 'Formación, ONG, marcas de estilo de vida')
  }),
  playful: preset('Canva education templates, Pitch "Virtual Team Games"', {
    mode: 'light', accent: '#3D5AFE', accent2: '#FF6F91', background: 'tinted', colorUse: 'vivid', fonts: 'rounded', headingWeight: 400, headingCase: 'normal', tracking: 'normal', typeScale: 1.35, titleSize: 'large', density: 'airy', align: 'center', cover: 'type', section: 'field', imageShape: 'rounded', motifs: ['blob'], labels: 'pill', numbers: 'circle', bullets: 'dot', cards: 'flat', radius: 24, icons: 'badge', chart: 'categorical', imagery: 'rich'
  }, {
    name: t('童趣圓體', 'Playful', 'Ludique', 'Игривый', 'Divertido'),
    feature: t('天藍淡底、圓體字、有機形、圓圈編號', 'Sky tint, rounded type, organic shapes, circled numbers', 'Bleu ciel, police arrondie, formes organiques, numéros cerclés', 'Небесно-голубой фон, округлый шрифт, органичные формы, номера в кругах', 'Celeste suave, letra redondeada, formas orgánicas, números en círculos'),
    fit: t('兒童教學、社群活動', 'Teaching children, community events', 'Enseignement aux enfants, événements associatifs', 'Занятия с детьми, мероприятия сообществ', 'Enseñanza infantil, eventos comunitarios')
  }),
  carbon: preset('IBM Carbon Design System, Pitch "Lattice"', {
    mode: 'dark', accent: '#4589FF', accent2: '#08BDBA', background: 'neutral', colorUse: 'restrained', fonts: 'plex', headingWeight: 300, headingCase: 'normal', tracking: 'normal', typeScale: 1.35, titleSize: 'large', density: 'balanced', align: 'left', cover: 'type', section: 'number', imageShape: 'bleed', motifs: ['grid'], labels: 'text', numbers: 'padded', bullets: 'square', cards: 'flat', radius: 0, icons: 'line', chart: 'categorical', imagery: 'some'
  }, {
    name: t('科技規格', 'Tech Spec', 'Fiche technique', 'Техспецификация', 'Ficha técnica'),
    feature: t('深灰底、細字重大標、格線、方角', 'Charcoal, light-weight large headings, grid, square corners', 'Anthracite, grands titres légers, grille, angles droits', 'Графитовый фон, тонкие крупные заголовки, сетка, прямые углы', 'Grafito, titulares grandes y ligeros, retícula, esquinas rectas'),
    fit: t('技術架構、規格說明', 'Architecture, technical specs', 'Architecture technique, spécifications', 'Архитектура, технические спецификации', 'Arquitectura técnica, especificaciones')
  }),
  brandbook: preset('Figma "Brand Guidelines"', {
    mode: 'dark', accent: '#C6F432', accent2: null, background: 'tinted', colorUse: 'balanced', fonts: 'tight', headingWeight: 700, headingCase: 'normal', tracking: 'tight', typeScale: 1.45, titleSize: 'huge', density: 'balanced', align: 'left', cover: 'type', section: 'field', imageShape: 'rounded', motifs: ['meta'], labels: 'tag', numbers: 'padded', bullets: 'arrow', cards: 'flat', radius: 12, icons: 'line', chart: 'duo', imagery: 'some'
  }, {
    name: t('品牌手冊', 'Brand Book', 'Charte de marque', 'Брендбук', 'Manual de marca'),
    feature: t('深綠底配螢光綠、色塊標籤、角落資訊', 'Deep green with lime, tag labels, corner details', 'Vert profond et vert citron, étiquettes pleines, mentions dans les coins', 'Тёмно-зелёный с лаймовым, метки-плашки, подписи по углам', 'Verde oscuro con lima, etiquetas sólidas, datos en las esquinas'),
    fit: t('品牌規範、行銷簡報', 'Brand guidelines, marketing decks', 'Chartes de marque, présentations marketing', 'Брендбуки, маркетинговые презентации', 'Manuales de marca, presentaciones de marketing')
  }),
  office: preset('Microsoft Office default theme, Google Slides "Streamline"', {
    mode: 'light', accent: '#0F6CBD', accent2: null, background: 'neutral', colorUse: 'balanced', fonts: 'office', headingWeight: 700, headingCase: 'normal', tracking: 'normal', typeScale: 1.25, titleSize: 'regular', density: 'balanced', align: 'left', cover: 'band', section: 'field', imageShape: 'inset', motifs: ['rules'], labels: 'text', numbers: 'padded', bullets: 'dot', cards: 'flat', radius: 4, icons: 'none', chart: 'categorical', imagery: 'some'
  }, {
    name: t('通用相容', 'Compatible', 'Compatible', 'Совместимый', 'Compatible'),
    feature: t('白底藍色、Office 內建字型、不放字型檔', 'White and blue, built-in Office fonts, no embedded fonts', 'Blanc et bleu, polices intégrées à Office, aucune police incorporée', 'Белый и синий, встроенные шрифты Office, без внедрения шрифтов', 'Blanco y azul, fuentes integradas de Office, sin fuentes incrustadas'),
    fit: t('需要在任何電腦上編輯', 'Files that must be edited on any computer', 'Fichiers à modifier sur n’importe quel ordinateur', 'Файлы, которые правят на любом компьютере', 'Archivos que deben editarse en cualquier equipo')
  })
});

export const DESIGN_PRESET_IDS = Object.freeze(Object.keys(DESIGN_PRESETS));
export const DEFAULT_PRESET_ID = 'whitespace';

/** Localised name, feature line and use case of a preset (UI language). */
export function getPresetText(id, language = 'zh-TW') {
  const entry = DESIGN_PRESETS[id];
  if (!entry) return null;
  const pick = (field) => field[language] || field.en;
  return { name: pick(entry.text.name), feature: pick(entry.text.feature), fit: pick(entry.text.fit) };
}
