// The 9 Word templates. Each is a complete set of document design parameters
// (see document-design.js); in AI adaptive mode the model sets them itself.
// Documents are read on paper and screens alike, so every template is light.
//
// `reference` records which vendor designs a template studies. It is internal
// documentation and never shown in the product; names avoid brand names.

const preset = (reference, params, text) => Object.freeze({ reference, params: Object.freeze(params), text: Object.freeze(text) });
const t = (zhTW, en, fr, ru, es) => Object.freeze({ 'zh-TW': zhTW, en, fr, ru, es });

export const DOCUMENT_PRESETS = Object.freeze({
  standard: preset('Microsoft Word default style (Office theme, Aptos)', {
    accent: '#0F4761', accent2: null, fonts: 'office', headingWeight: 400, headingCase: 'normal', tracking: 'normal', headingColor: 'accent', headings: 'plain', titleAlign: 'left', cover: 'none', bodySize: 12, lineSpacing: 1.15, paragraphSpacing: 8, paragraphs: 'spaced', typeScale: 1.25, tables: 'grid', margins: 'normal', pageNumber: 'footer'
  }, {
    name: t('標準', 'Standard', 'Standard', 'Стандартный', 'Estándar'),
    feature: t('Office 內建字型、藍色標題，任何電腦都能照樣編輯', 'Built-in Office fonts and blue headings; edits the same on any computer', 'Polices intégrées à Office, titres bleus ; se modifie à l’identique partout', 'Встроенные шрифты Office, синие заголовки; одинаково правится на любом компьютере', 'Fuentes integradas de Office y títulos azules; se edita igual en cualquier equipo'),
    fit: t('一般文件、需要多人編輯', 'Everyday documents, shared editing', 'Documents courants, édition partagée', 'Повседневные документы, совместная правка', 'Documentos cotidianos, edición compartida')
  }),
  elegant: preset('Word style set "Basic (Elegant)"', {
    accent: '#6B5A3A', accent2: null, fonts: 'garamond', headingWeight: 500, headingCase: 'upper', tracking: 'wide', headingColor: 'text', headings: 'rule', titleAlign: 'center', cover: 'page', bodySize: 11, lineSpacing: 1.4, paragraphSpacing: 8, paragraphs: 'spaced', typeScale: 1.22, tables: 'lines', margins: 'wide', pageNumber: 'footer'
  }, {
    name: t('典雅', 'Elegant', 'Élégant', 'Элегантный', 'Elegante'),
    feature: t('襯線字、大寫標題加寬字距、細線與置中封面', 'Serif type, spaced capitals, fine rules and a centred cover', 'Empattements, capitales espacées, filets fins et couverture centrée', 'Шрифт с засечками, разреженные прописные, тонкие линии и обложка по центру', 'Serifa, mayúsculas espaciadas, filetes finos y portada centrada'),
    fit: t('年度報告、正式提案、邀請函', 'Annual reports, formal proposals, invitations', 'Rapports annuels, propositions officielles, invitations', 'Годовые отчёты, официальные предложения, приглашения', 'Informes anuales, propuestas formales, invitaciones')
  }),
  lines: preset('Word style set "Lines (Simple)" with the "Sideline" cover', {
    accent: '#1F5C99', accent2: null, fonts: 'modern', headingWeight: 700, headingCase: 'normal', tracking: 'normal', headingColor: 'accent', headings: 'rule', titleAlign: 'left', cover: 'block', bodySize: 10.5, lineSpacing: 1.35, paragraphSpacing: 8, paragraphs: 'spaced', typeScale: 1.25, tables: 'lines', margins: 'normal', pageNumber: 'footer'
  }, {
    name: t('線條', 'Lines', 'Filets', 'Линии', 'Líneas'),
    feature: t('標題下方細線、標題區左側直線', 'A rule under each heading and beside the title', 'Un filet sous chaque titre et à côté du titre principal', 'Линия под каждым заголовком и рядом с названием', 'Una línea bajo cada título y junto al título principal'),
    fit: t('企劃書、會議紀錄、內部報告', 'Plans, meeting notes, internal reports', 'Plans, comptes rendus, rapports internes', 'Планы, протоколы встреч, внутренние отчёты', 'Planes, actas de reuniones, informes internos')
  }),
  monochrome: preset('Word style set "Black & White (Classic)"', {
    accent: '#111111', accent2: null, fonts: 'book', headingWeight: 700, headingCase: 'normal', tracking: 'normal', headingColor: 'text', headings: 'plain', titleAlign: 'center', cover: 'page', bodySize: 11, lineSpacing: 1.3, paragraphSpacing: 6, paragraphs: 'spaced', typeScale: 1.3, tables: 'lines', margins: 'normal', pageNumber: 'footer'
  }, {
    name: t('黑白', 'Monochrome', 'Noir et blanc', 'Чёрно-белый', 'Blanco y negro'),
    feature: t('純黑白、襯線字、置中封面', 'Black and white only, serif type, centred cover', 'Uniquement noir et blanc, empattements, couverture centrée', 'Только чёрный и белый, шрифт с засечками, обложка по центру', 'Solo blanco y negro, serifa, portada centrada'),
    fit: t('公文、合約、正式信函', 'Official papers, contracts, formal letters', 'Documents officiels, contrats, lettres formelles', 'Официальные бумаги, договоры, деловые письма', 'Documentos oficiales, contratos, cartas formales')
  }),
  spearmint: preset('Google Docs "Spearmint" templates', {
    accent: '#1A9E8F', accent2: null, fonts: 'modern', headingWeight: 700, headingCase: 'normal', tracking: 'normal', headingColor: 'accent', headings: 'plain', titleAlign: 'left', cover: 'block', bodySize: 10.5, lineSpacing: 1.45, paragraphSpacing: 8, paragraphs: 'spaced', typeScale: 1.28, tables: 'shaded', margins: 'normal', pageNumber: 'footer'
  }, {
    name: t('薄荷', 'Spearmint', 'Menthe', 'Мята', 'Menta'),
    feature: t('薄荷綠標題、簡潔的無襯線字、淺色表頭', 'Mint headings, clean sans-serif type, tinted table headers', 'Titres menthe, linéale nette, en-têtes de tableau teintés', 'Мятные заголовки, чистый гротеск, тонированные шапки таблиц', 'Títulos menta, sans serif limpia, encabezados de tabla tintados'),
    fit: t('提案、計畫書、產品簡介', 'Proposals, plans, product briefs', 'Propositions, plans, fiches produit', 'Предложения, планы, описания продуктов', 'Propuestas, planes, fichas de producto')
  }),
  geometric: preset('Google Docs "Geometric" templates', {
    accent: '#4F46E5', accent2: '#F59E0B', fonts: 'geometric', headingWeight: 700, headingCase: 'normal', tracking: 'normal', headingColor: 'text', headings: 'bar', titleAlign: 'left', cover: 'shapes', bodySize: 10.5, lineSpacing: 1.45, paragraphSpacing: 8, paragraphs: 'spaced', typeScale: 1.3, tables: 'shaded', margins: 'normal', pageNumber: 'footer'
  }, {
    name: t('幾何', 'Geometric', 'Géométrique', 'Геометрия', 'Geométrico'),
    feature: t('封面主色幾何色塊、標題左側色條', 'Geometric colour blocks on the cover, a colour bar beside headings', 'Blocs de couleur géométriques en couverture, barre de couleur près des titres', 'Геометрические цветные блоки на обложке, цветная полоса у заголовков', 'Bloques de color geométricos en la portada, barra de color junto a los títulos'),
    fit: t('行銷企劃、專案提案', 'Marketing plans, project proposals', 'Plans marketing, propositions de projet', 'Маркетинговые планы, проектные предложения', 'Planes de marketing, propuestas de proyecto')
  }),
  swiss: preset('Google Docs "Swiss" templates, International Typographic Style', {
    accent: '#E30613', accent2: null, fonts: 'tight', headingWeight: 700, headingCase: 'normal', tracking: 'tight', headingColor: 'text', headings: 'plain', titleAlign: 'left', cover: 'page', bodySize: 10, lineSpacing: 1.35, paragraphSpacing: 7, paragraphs: 'spaced', typeScale: 1.42, tables: 'lines', margins: 'normal', pageNumber: 'footer'
  }, {
    name: t('瑞士', 'Swiss', 'Suisse', 'Швейцарский', 'Suizo'),
    feature: t('粗體無襯線字、大字封面、紅色點綴', 'Bold grotesque type, a large-type cover, red accents', 'Linéale grasse, couverture en grands caractères, touches de rouge', 'Жирный гротеск, обложка с крупным шрифтом, красные акценты', 'Grotesca negrita, portada con letra grande, toques de rojo'),
    fit: t('設計文件、作品集說明、簡歷', 'Design documents, portfolios, CVs', 'Documents de design, portfolios, CV', 'Дизайн-документы, портфолио, резюме', 'Documentos de diseño, portafolios, currículums')
  }),
  academic: preset('Apple Pages "Essay", APA Style 7th edition', {
    accent: '#1F3864', accent2: null, fonts: 'book', headingWeight: 700, headingCase: 'normal', tracking: 'normal', headingColor: 'text', headings: 'centered', titleAlign: 'center', cover: 'title', bodySize: 12, lineSpacing: 2, paragraphSpacing: 0, paragraphs: 'indented', typeScale: 1, tables: 'lines', margins: 'normal', pageNumber: 'header'
  }, {
    name: t('學術', 'Academic', 'Académique', 'Академический', 'Académico'),
    feature: t('APA 格式：12 點襯線字、兩倍行距、首行縮排、頁碼在右上', 'APA style: 12 pt serif, double spacing, indented paragraphs, page number top right', 'Style APA : empattements 12 pt, double interligne, alinéas, numéro en haut à droite', 'Стиль APA: 12 пт с засечками, двойной интервал, абзацный отступ, номер справа вверху', 'Estilo APA: serifa de 12 pt, doble espacio, sangría, número arriba a la derecha'),
    fit: t('學期報告、論文、研究計畫', 'Term papers, theses, research proposals', 'Mémoires, thèses, projets de recherche', 'Курсовые, диссертации, исследовательские заявки', 'Trabajos, tesis, propuestas de investigación')
  }),
  technical: preset('IBM Carbon Design System (IBM Plex)', {
    accent: '#0F62FE', accent2: null, fonts: 'plex', headingWeight: 500, headingCase: 'normal', tracking: 'normal', headingColor: 'text', headings: 'plain', titleAlign: 'left', cover: 'band', bodySize: 10.5, lineSpacing: 1.45, paragraphSpacing: 8, paragraphs: 'spaced', typeScale: 1.28, tables: 'shaded', margins: 'normal', pageNumber: 'footer'
  }, {
    name: t('技術', 'Technical', 'Technique', 'Технический', 'Técnico'),
    feature: t('IBM Plex 字型、藍色封面色帶、清楚的表格與程式碼', 'IBM Plex type, a blue cover band, clear tables and code', 'Police IBM Plex, bandeau bleu en couverture, tableaux et code lisibles', 'Шрифт IBM Plex, синяя полоса на обложке, понятные таблицы и код', 'Tipografía IBM Plex, franja azul en la portada, tablas y código claros'),
    fit: t('技術規格、API 文件、操作手冊', 'Specifications, API documents, manuals', 'Spécifications, documentation d’API, manuels', 'Спецификации, документация API, руководства', 'Especificaciones, documentación de API, manuales')
  })
});

export const DOCUMENT_PRESET_IDS = Object.freeze(Object.keys(DOCUMENT_PRESETS));

/** Localised name, feature line and use case of a template (UI language). */
export function getDocumentPresetText(id, language = 'zh-TW') {
  const entry = DOCUMENT_PRESETS[id];
  if (!entry) return null;
  const pick = (field) => field[language] || field.en;
  return { name: pick(entry.text.name), feature: pick(entry.text.feature), fit: pick(entry.text.fit) };
}
