// User-facing copy for downloadable file cards. Kept separate from the main
// runtime dictionary so the feature owns its strings and their completeness
// test, and so later phases can add keys without touching shared text.

const FILE_TEXTS = Object.freeze({
  'zh-TW': {
    fileCard: '檔案',
    download: '下載',
    preview: '預覽',
    generating: '正在產生…',
    downloadAll: '全部下載（ZIP）',
    close: '關閉',
    copySource: '複製原始內容',
    copied: '已複製原始內容。',
    copyFailed: '無法複製內容。',
    writingFile: '正在撰寫檔案…',
    receivedCharacters: '已接收 {count} 字元',
    incomplete: '內容不完整：回覆在檔案結束前中斷。',
    blocked: '基於安全考量，無法提供 .{extension} 類型的檔案。',
    tooLarge: '檔案內容過大，無法產生。',
    unavailable: '此檔案格式目前尚未支援。',
    scriptWarning: '這是可執行的腳本檔，執行前請先確認內容。',
    generateFailed: '無法產生檔案：{reason}',
    downloadStarted: '已開始下載 {name}',
    previewTitle: '預覽：{name}',
    previewTruncated: '僅顯示前 {count} 行。',
    previewUnavailable: '此格式暫不支援預覽，請直接下載。',
    layoutView: '版面預覽',
    sourceView: '原始內容',
    previewLoading: '正在產生預覽…',
    previewRenderFailed: '無法顯示版面預覽（{reason}），改為顯示文字內容。',
    pageCount: '共 {count} 頁',
    previewFontNote: '版面以這台裝置上的字型繪製，換行與分頁位置可能和 Word 略有不同。',
    familyWord: 'Word 文件',
    familyExcel: 'Excel 試算表',
    familyPowerpoint: 'PowerPoint 簡報',
    familyPdf: 'PDF 文件',
    familyCsv: '表格資料',
    familyText: '文字檔',
    familyMarkdown: 'Markdown 文件',
    familyCode: '程式碼',
    familyData: '資料檔',
    familyWeb: '網頁檔',
    familyCalendar: '行事曆',
    familyContact: '聯絡人',
    familySubtitle: '字幕檔',
    familyBlocked: '不支援的檔案',
    statLines: '{count} 行',
    statRows: '{count} 列',
    statWords: '約 {count} 字',
    statSheets: '{count} 個工作表',
    statSlides: '{count} 張投影片'
  },
  en: {
    fileCard: 'File',
    download: 'Download',
    preview: 'Preview',
    generating: 'Generating…',
    downloadAll: 'Download all (ZIP)',
    close: 'Close',
    copySource: 'Copy source',
    copied: 'Source copied.',
    copyFailed: 'Could not copy the content.',
    writingFile: 'Writing file…',
    receivedCharacters: '{count} characters received',
    incomplete: 'Incomplete: the response ended before the file was finished.',
    blocked: 'For your safety, .{extension} files cannot be provided.',
    tooLarge: 'This file is too large to generate.',
    unavailable: 'This file format is not supported yet.',
    scriptWarning: 'This is an executable script. Review it before running it.',
    generateFailed: 'Could not generate the file: {reason}',
    downloadStarted: 'Downloading {name}',
    previewTitle: 'Preview: {name}',
    previewTruncated: 'Showing the first {count} lines only.',
    previewUnavailable: 'Preview is not available for this format. Download the file instead.',
    layoutView: 'Page view',
    sourceView: 'Source',
    previewLoading: 'Preparing preview…',
    previewRenderFailed: 'The page view could not be shown ({reason}). Showing the text instead.',
    pageCount: '{count} pages',
    previewFontNote: 'Pages are drawn with the fonts on this device, so line and page breaks may differ slightly from Word.',
    familyWord: 'Word document',
    familyExcel: 'Excel spreadsheet',
    familyPowerpoint: 'PowerPoint presentation',
    familyPdf: 'PDF document',
    familyCsv: 'Table data',
    familyText: 'Text file',
    familyMarkdown: 'Markdown document',
    familyCode: 'Code',
    familyData: 'Data file',
    familyWeb: 'Web file',
    familyCalendar: 'Calendar',
    familyContact: 'Contact',
    familySubtitle: 'Subtitles',
    familyBlocked: 'Unsupported file',
    statLines: '{count} lines',
    statRows: '{count} rows',
    statWords: 'About {count} words',
    statSheets: '{count} sheets',
    statSlides: '{count} slides'
  },
  fr: {
    fileCard: 'Fichier',
    download: 'Télécharger',
    preview: 'Aperçu',
    generating: 'Génération…',
    downloadAll: 'Tout télécharger (ZIP)',
    close: 'Fermer',
    copySource: 'Copier la source',
    copied: 'Source copiée.',
    copyFailed: 'Impossible de copier le contenu.',
    writingFile: 'Rédaction du fichier…',
    receivedCharacters: '{count} caractères reçus',
    incomplete: 'Incomplet : la réponse s’est arrêtée avant la fin du fichier.',
    blocked: 'Pour votre sécurité, les fichiers .{extension} ne peuvent pas être fournis.',
    tooLarge: 'Ce fichier est trop volumineux pour être généré.',
    unavailable: 'Ce format de fichier n’est pas encore pris en charge.',
    scriptWarning: 'Ce fichier est un script exécutable. Vérifiez-le avant de l’exécuter.',
    generateFailed: 'Impossible de générer le fichier : {reason}',
    downloadStarted: 'Téléchargement de {name}',
    previewTitle: 'Aperçu : {name}',
    previewTruncated: 'Seules les {count} premières lignes sont affichées.',
    previewUnavailable: 'L’aperçu n’est pas disponible pour ce format. Téléchargez le fichier.',
    layoutView: 'Mise en page',
    sourceView: 'Source',
    previewLoading: 'Préparation de l’aperçu…',
    previewRenderFailed: 'Impossible d’afficher la mise en page ({reason}). Le texte est affiché à la place.',
    pageCount: '{count} pages',
    previewFontNote: 'Les pages utilisent les polices de cet appareil ; les retours à la ligne et les sauts de page peuvent légèrement différer de Word.',
    familyWord: 'Document Word',
    familyExcel: 'Classeur Excel',
    familyPowerpoint: 'Présentation PowerPoint',
    familyPdf: 'Document PDF',
    familyCsv: 'Données tabulaires',
    familyText: 'Fichier texte',
    familyMarkdown: 'Document Markdown',
    familyCode: 'Code',
    familyData: 'Fichier de données',
    familyWeb: 'Fichier web',
    familyCalendar: 'Agenda',
    familyContact: 'Contact',
    familySubtitle: 'Sous-titres',
    familyBlocked: 'Fichier non pris en charge',
    statLines: '{count} lignes',
    statRows: '{count} lignes de données',
    statWords: 'Environ {count} mots',
    statSheets: '{count} feuilles',
    statSlides: '{count} diapositives'
  },
  ru: {
    fileCard: 'Файл',
    download: 'Скачать',
    preview: 'Просмотр',
    generating: 'Создание…',
    downloadAll: 'Скачать всё (ZIP)',
    close: 'Закрыть',
    copySource: 'Копировать исходник',
    copied: 'Исходник скопирован.',
    copyFailed: 'Не удалось скопировать содержимое.',
    writingFile: 'Создание файла…',
    receivedCharacters: 'Получено символов: {count}',
    incomplete: 'Неполный файл: ответ прервался до конца файла.',
    blocked: 'В целях безопасности файлы .{extension} недоступны.',
    tooLarge: 'Файл слишком большой для создания.',
    unavailable: 'Этот формат файла пока не поддерживается.',
    scriptWarning: 'Это исполняемый скрипт. Проверьте его перед запуском.',
    generateFailed: 'Не удалось создать файл: {reason}',
    downloadStarted: 'Скачивание {name}',
    previewTitle: 'Просмотр: {name}',
    previewTruncated: 'Показаны только первые строки: {count}.',
    previewUnavailable: 'Просмотр этого формата недоступен. Скачайте файл.',
    layoutView: 'Макет страниц',
    sourceView: 'Исходный текст',
    previewLoading: 'Подготовка просмотра…',
    previewRenderFailed: 'Не удалось показать макет страниц ({reason}). Показан текст.',
    pageCount: 'Страниц: {count}',
    previewFontNote: 'Страницы отрисованы шрифтами этого устройства, поэтому переносы строк и страниц могут немного отличаться от Word.',
    familyWord: 'Документ Word',
    familyExcel: 'Таблица Excel',
    familyPowerpoint: 'Презентация PowerPoint',
    familyPdf: 'Документ PDF',
    familyCsv: 'Табличные данные',
    familyText: 'Текстовый файл',
    familyMarkdown: 'Документ Markdown',
    familyCode: 'Код',
    familyData: 'Файл данных',
    familyWeb: 'Веб-файл',
    familyCalendar: 'Календарь',
    familyContact: 'Контакт',
    familySubtitle: 'Субтитры',
    familyBlocked: 'Неподдерживаемый файл',
    statLines: 'Строк: {count}',
    statRows: 'Строк данных: {count}',
    statWords: 'Около {count} слов',
    statSheets: 'Листов: {count}',
    statSlides: 'Слайдов: {count}'
  },
  es: {
    fileCard: 'Archivo',
    download: 'Descargar',
    preview: 'Vista previa',
    generating: 'Generando…',
    downloadAll: 'Descargar todo (ZIP)',
    close: 'Cerrar',
    copySource: 'Copiar contenido original',
    copied: 'Contenido original copiado.',
    copyFailed: 'No se pudo copiar el contenido.',
    writingFile: 'Escribiendo archivo…',
    receivedCharacters: '{count} caracteres recibidos',
    incomplete: 'Incompleto: la respuesta terminó antes de acabar el archivo.',
    blocked: 'Por tu seguridad, no se pueden proporcionar archivos .{extension}.',
    tooLarge: 'El archivo es demasiado grande para generarlo.',
    unavailable: 'Este formato de archivo aún no es compatible.',
    scriptWarning: 'Es un script ejecutable. Revísalo antes de ejecutarlo.',
    generateFailed: 'No se pudo generar el archivo: {reason}',
    downloadStarted: 'Descargando {name}',
    previewTitle: 'Vista previa: {name}',
    previewTruncated: 'Solo se muestran las primeras {count} líneas.',
    previewUnavailable: 'La vista previa no está disponible para este formato. Descarga el archivo.',
    layoutView: 'Vista de página',
    sourceView: 'Fuente',
    previewLoading: 'Preparando la vista previa…',
    previewRenderFailed: 'No se pudo mostrar la vista de página ({reason}). Se muestra el texto.',
    pageCount: '{count} páginas',
    previewFontNote: 'Las páginas se dibujan con las fuentes de este dispositivo; los saltos de línea y de página pueden variar un poco respecto a Word.',
    familyWord: 'Documento de Word',
    familyExcel: 'Hoja de cálculo de Excel',
    familyPowerpoint: 'Presentación de PowerPoint',
    familyPdf: 'Documento PDF',
    familyCsv: 'Datos tabulares',
    familyText: 'Archivo de texto',
    familyMarkdown: 'Documento Markdown',
    familyCode: 'Código',
    familyData: 'Archivo de datos',
    familyWeb: 'Archivo web',
    familyCalendar: 'Calendario',
    familyContact: 'Contacto',
    familySubtitle: 'Subtítulos',
    familyBlocked: 'Archivo no compatible',
    statLines: '{count} líneas',
    statRows: '{count} filas',
    statWords: 'Unas {count} palabras',
    statSheets: '{count} hojas',
    statSlides: '{count} diapositivas'
  }
});

export const SUPPORTED_FILE_TEXT_LANGUAGES = Object.freeze(Object.keys(FILE_TEXTS));

export function getFileTexts(language = 'zh-TW') {
  return FILE_TEXTS[language] || FILE_TEXTS['zh-TW'];
}

export function getFileText(language, key, replacements = {}) {
  let value = getFileTexts(language)[key] || FILE_TEXTS['zh-TW'][key] || key;
  Object.entries(replacements).forEach(([name, replacement]) => {
    value = value.replaceAll(`{${name}}`, String(replacement));
  });
  return value;
}

export function formatFileCount(language, count) {
  try {
    return new Intl.NumberFormat(language === 'zh-TW' ? 'zh-Hant-TW' : language).format(count);
  } catch {
    return String(count);
  }
}

export function formatFileSize(language, bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes) || 0;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || value >= 100 ? 0 : 1;
  let formatted;
  try {
    formatted = new Intl.NumberFormat(language === 'zh-TW' ? 'zh-Hant-TW' : language, {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0
    }).format(value);
  } catch {
    formatted = value.toFixed(digits);
  }
  return `${formatted} ${units[unitIndex]}`;
}
