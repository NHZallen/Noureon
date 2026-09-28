// Text the Word and PDF generators write themselves, in the UI languages.

export const TOC_LABELS = Object.freeze({ 'zh-TW': '目錄', en: 'Contents', fr: 'Table des matières', ru: 'Содержание', es: 'Índice' });
export const IMAGE_LABELS = Object.freeze({ 'zh-TW': '圖片', en: 'Image', fr: 'Image', ru: 'Изображение', es: 'Imagen' });
export const CHART_TABLE_LABELS = Object.freeze({
  'zh-TW': { label: '項目', value: '數值', x: 'X', y: 'Y', size: '大小', source: '來源', target: '目標', start: '開始', end: '結束', count: '次數', min: '最小值', max: '最大值' },
  en: { label: 'Item', value: 'Value', x: 'X', y: 'Y', size: 'Size', source: 'Source', target: 'Target', start: 'Start', end: 'End', count: 'Count', min: 'Min', max: 'Max' },
  fr: { label: 'Élément', value: 'Valeur', x: 'X', y: 'Y', size: 'Taille', source: 'Source', target: 'Cible', start: 'Début', end: 'Fin', count: 'Nombre', min: 'Min', max: 'Max' },
  ru: { label: 'Элемент', value: 'Значение', x: 'X', y: 'Y', size: 'Размер', source: 'Источник', target: 'Цель', start: 'Начало', end: 'Конец', count: 'Количество', min: 'Мин.', max: 'Макс.' },
  es: { label: 'Elemento', value: 'Valor', x: 'X', y: 'Y', size: 'Tamaño', source: 'Origen', target: 'Destino', start: 'Inicio', end: 'Fin', count: 'Recuento', min: 'Mín.', max: 'Máx.' }
});
