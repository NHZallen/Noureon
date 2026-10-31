// The words each icon of a project is found by in the search box of the icon picker (docs/superpowers/specs/2026-10-31-projects-design.md): a few words in each language, separated by spaces.
// The key is the key of the icon in src/app/runtime/features/folder-metadata.js. Plain text only.

export const ICON_WORDS = Object.freeze({
  default: { 'zh-TW': '資料夾 預設', en: 'folder default', fr: 'dossier défaut', ru: 'папка по умолчанию', es: 'carpeta predeterminado' },
  open: { 'zh-TW': '開啟 資料夾', en: 'open folder', fr: 'ouvert dossier', ru: 'открытая папка', es: 'abierta carpeta' },
  archive: { 'zh-TW': '封存 收納 箱子', en: 'archive box storage', fr: 'archive boîte', ru: 'архив коробка', es: 'archivo caja' },
  user: { 'zh-TW': '人 使用者 個人', en: 'person user people', fr: 'personne utilisateur', ru: 'человек пользователь', es: 'persona usuario' },
  star: { 'zh-TW': '星星 最愛 重要', en: 'star favorite important', fr: 'étoile favori', ru: 'звезда избранное', es: 'estrella favorito' },
  cloud: { 'zh-TW': '雲 雲端', en: 'cloud', fr: 'nuage', ru: 'облако', es: 'nube' },
  work: { 'zh-TW': '工作 公事 公事包', en: 'work briefcase job', fr: 'travail mallette', ru: 'работа портфель', es: 'trabajo maletín' },
  tag: { 'zh-TW': '標籤 標記', en: 'tag label', fr: 'étiquette', ru: 'тег метка', es: 'etiqueta' },
  heart: { 'zh-TW': '愛心 喜歡 健康', en: 'heart love health', fr: 'cœur amour santé', ru: 'сердце любовь здоровье', es: 'corazón amor salud' },
  lightning: { 'zh-TW': '閃電 快速 靈感', en: 'lightning fast idea', fr: 'éclair rapide idée', ru: 'молния быстро идея', es: 'rayo rápido idea' },
  book: { 'zh-TW': '書 閱讀 學習', en: 'book read study', fr: 'livre lecture étude', ru: 'книга чтение учёба', es: 'libro lectura estudio' },
  code: { 'zh-TW': '程式 程式碼 開發', en: 'code programming develop', fr: 'code programmation', ru: 'код программирование', es: 'código programación' },
  dollar: { 'zh-TW': '錢 金融 財務 預算', en: 'money finance dollar budget', fr: 'argent finance budget', ru: 'деньги финансы бюджет', es: 'dinero finanzas presupuesto' },
  graduation: { 'zh-TW': '畢業 學校 教育 課程', en: 'graduation school education course', fr: 'diplôme école éducation', ru: 'выпуск школа образование', es: 'graduación escuela educación' },
  pencil: { 'zh-TW': '鉛筆 寫作 編輯', en: 'pencil write edit', fr: 'crayon écrire', ru: 'карандаш писать', es: 'lápiz escribir' },
  music: { 'zh-TW': '音樂 歌曲 聲音', en: 'music song sound', fr: 'musique chanson', ru: 'музыка песня', es: 'música canción' },
  chart: { 'zh-TW': '圖表 數據 分析', en: 'chart data analytics', fr: 'graphique données analyse', ru: 'график данные анализ', es: 'gráfico datos análisis' },
  globe: { 'zh-TW': '地球 世界 網路 研究', en: 'globe world web research', fr: 'globe monde web recherche', ru: 'глобус мир сеть исследование', es: 'globo mundo web investigación' },
  plane: { 'zh-TW': '飛機 旅行 旅遊', en: 'plane travel trip', fr: 'avion voyage', ru: 'самолёт путешествие', es: 'avión viaje' },
  tool: { 'zh-TW': '工具 修理 設定', en: 'tool wrench repair settings', fr: 'outil réparation', ru: 'инструмент ремонт', es: 'herramienta reparación' },
  terminal: { 'zh-TW': '終端機 指令 命令列', en: 'terminal command line shell', fr: 'terminal ligne de commande', ru: 'терминал командная строка', es: 'terminal línea de comandos' },
  flask: { 'zh-TW': '燒瓶 實驗 科學', en: 'flask lab science experiment', fr: 'fiole laboratoire science', ru: 'колба лаборатория наука', es: 'matraz laboratorio ciencia' },
  notes: { 'zh-TW': '筆記 備忘 記事', en: 'notes memo notebook', fr: 'notes mémo carnet', ru: 'заметки блокнот', es: 'notas memo cuaderno' },
  home: { 'zh-TW': '家 房子 住宅', en: 'home house', fr: 'maison', ru: 'дом', es: 'casa hogar' },
  calendar: { 'zh-TW': '日曆 行事曆 日程 會議', en: 'calendar schedule meeting', fr: 'calendrier réunion', ru: 'календарь встреча', es: 'calendario reunión' },
  mail: { 'zh-TW': '信 郵件 電子郵件', en: 'mail email letter', fr: 'courrier e-mail', ru: 'почта письмо', es: 'correo carta' },
  camera: { 'zh-TW': '相機 照片 攝影', en: 'camera photo picture', fr: 'appareil photo image', ru: 'камера фото', es: 'cámara foto' },
  pin: { 'zh-TW': '圖釘 地點 位置', en: 'pin place location', fr: 'épingle lieu', ru: 'булавка место', es: 'chincheta lugar' }
});

/** Whether an icon matches what was typed: its key or one of its words, in the language in use or any other. */
export function iconMatches(key, query, language = 'en') {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  const words = ICON_WORDS[key];
  const haystack = [key, words?.[language] || '', ...Object.values(words || {})].join(' ').toLowerCase();
  return needle.split(/\s+/).every((part) => haystack.includes(part));
}
