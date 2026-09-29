export const VISION_TEXTS = Object.freeze({
  'zh-TW': {
    fixing: '{model} 正在重新製作簡報', freeHeading: '看圖檢查完成：發現 {found} 個問題，已請 AI 重新製作簡報。', freeNoFile: 'AI 沒有產生修正後的簡報檔案。',
    preparing: '正在檢查簡報版面…', rendering: '正在把頁面轉成圖片', reviewing: '{model} 正在看圖檢查', applying: '正在套用修正', stop: '停止',
    heading: '看圖檢查完成：發現 {found} 個問題，已修正 {fixed} 個。', slide: '第 {number} 頁', notFixed: '（未修正）', partial: '只檢查了前 {count} 頁。',
    clean: '看圖檢查完成，沒有發現需要修正的地方。', failed: '看圖檢查沒有完成：{reason}', setting: '自動看圖檢查簡報',
    hint: '支援看圖的模型寫完簡報後，會把頁面轉成圖片再檢查一輪並修正。每份會多用一些 token。',
    categories: { text: '文字', layout: '版面', image: '圖片', chart: '圖表', consistency: '一致性' }
  },
  en: {
    fixing: '{model} is redoing the presentation', freeHeading: 'Visual check done: {found} issues found, and the presentation was redone.', freeNoFile: 'The AI did not produce a corrected presentation file.',
    preparing: 'Checking the slide layout…', rendering: 'Turning slides into images', reviewing: '{model} is reviewing the slides', applying: 'Applying the fixes', stop: 'Stop',
    heading: 'Visual check done: {found} issues found, {fixed} fixed.', slide: 'Slide {number}', notFixed: '(not fixed)', partial: 'Only the first {count} slides were checked.',
    clean: 'Visual check done: nothing needs fixing.', failed: 'The visual check did not finish: {reason}', setting: 'Check presentations visually',
    hint: 'After a model that can see images writes a presentation, its slides are checked as images once and fixed. Uses extra tokens for each deck.',
    categories: { text: 'Text', layout: 'Layout', image: 'Image', chart: 'Chart', consistency: 'Consistency' }
  },
  fr: {
    fixing: '{model} refait la présentation', freeHeading: 'Vérification visuelle terminée : {found} problèmes trouvés, la présentation a été refaite.', freeNoFile: 'L’IA n’a pas produit de présentation corrigée.',
    preparing: 'Vérification de la mise en page…', rendering: 'Conversion des diapositives en images', reviewing: '{model} examine les diapositives', applying: 'Application des corrections', stop: 'Arrêter',
    heading: 'Vérification visuelle terminée : {found} problèmes trouvés, {fixed} corrigés.', slide: 'Diapositive {number}', notFixed: '(non corrigé)', partial: 'Seules les {count} premières diapositives ont été vérifiées.',
    clean: 'Vérification visuelle terminée : rien à corriger.', failed: 'La vérification visuelle n’a pas abouti : {reason}', setting: 'Vérifier visuellement les présentations',
    hint: 'Après qu’un modèle capable de voir les images a rédigé une présentation, ses diapositives sont vérifiées une fois en images et corrigées. Consomme des jetons supplémentaires.',
    categories: { text: 'Texte', layout: 'Mise en page', image: 'Image', chart: 'Graphique', consistency: 'Cohérence' }
  },
  ru: {
    fixing: '{model} переделывает презентацию', freeHeading: 'Визуальная проверка завершена: найдено проблем — {found}, презентация переделана.', freeNoFile: 'ИИ не создал исправленный файл презентации.',
    preparing: 'Проверка макета слайдов…', rendering: 'Преобразование слайдов в изображения', reviewing: '{model} проверяет слайды', applying: 'Применение исправлений', stop: 'Остановить',
    heading: 'Визуальная проверка завершена: найдено проблем — {found}, исправлено — {fixed}.', slide: 'Слайд {number}', notFixed: '(не исправлено)', partial: 'Проверены только первые {count} слайдов.',
    clean: 'Визуальная проверка завершена: исправлять нечего.', failed: 'Визуальная проверка не завершена: {reason}', setting: 'Визуально проверять презентации',
    hint: 'После того как модель с поддержкой изображений создаст презентацию, слайды один раз проверяются как изображения и исправляются. Требует дополнительных токенов.',
    categories: { text: 'Текст', layout: 'Макет', image: 'Изображение', chart: 'Диаграмма', consistency: 'Единообразие' }
  },
  es: {
    fixing: '{model} está rehaciendo la presentación', freeHeading: 'Revisión visual terminada: {found} problemas encontrados y la presentación se rehizo.', freeNoFile: 'La IA no produjo una presentación corregida.',
    preparing: 'Revisando el diseño de las diapositivas…', rendering: 'Convirtiendo las diapositivas en imágenes', reviewing: '{model} está revisando las diapositivas', applying: 'Aplicando las correcciones', stop: 'Detener',
    heading: 'Revisión visual terminada: {found} problemas encontrados, {fixed} corregidos.', slide: 'Diapositiva {number}', notFixed: '(sin corregir)', partial: 'Solo se revisaron las primeras {count} diapositivas.',
    clean: 'Revisión visual terminada: no hay nada que corregir.', failed: 'La revisión visual no terminó: {reason}', setting: 'Revisar visualmente las presentaciones',
    hint: 'Cuando un modelo que puede ver imágenes escribe una presentación, sus diapositivas se revisan una vez como imágenes y se corrigen. Usa tokens adicionales.',
    categories: { text: 'Texto', layout: 'Diseño', image: 'Imagen', chart: 'Gráfico', consistency: 'Consistencia' }
  }
});

export const visionText = (language, key, values = {}) => {
  const template = VISION_TEXTS[language]?.[key] || VISION_TEXTS.en[key] || '';
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};
