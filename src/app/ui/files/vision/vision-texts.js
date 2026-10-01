export const VISION_TEXTS = Object.freeze({
  'zh-TW': {
    ledgerTitle: '自動看圖檢查', renderedSlides: '已畫出 {total} 頁投影片', sheetsDone: '已拼成 {total} 張聯絡表', reviewedBy: '看完了',
    slideProgress: '正在畫第 {n} / {total} 頁', sheetsProgress: '已拼好 {n} / {total} 張圖', reviewingSheets: '正在看 {count} 張圖', issuesFound: '發現 {count} 個問題',
    fixing: '正在重新製作簡報', freeHeading: '看圖檢查完成：發現 {found} 個問題，已請 AI 重新製作簡報。', freeNoFile: 'AI 沒有產生修正後的簡報檔案。',
    preparing: '正在檢查簡報版面…', rendering: '正在把頁面轉成圖片', reviewing: '正在看圖檢查', applying: '正在套用修正', stop: '停止',
    heading: '看圖檢查完成：發現 {found} 個問題，已修正 {fixed} 個。', slide: '第 {number} 頁', notFixed: '（未修正）', partial: '只檢查了前 {count} 頁。',
    clean: '看圖檢查完成，沒有發現需要修正的地方。', failed: '看圖檢查沒有完成：{reason}', setting: '自動看圖檢查簡報',
    hint: '支援看圖的模型寫完簡報後，會把頁面轉成圖片再檢查一輪並修正。每份會多用一些 token。',
    sendLocked: '自動看圖檢查進行中，完成或按「停止」後才能傳送訊息', sendLockedNotice: '看圖檢查還沒結束，請等它完成，或先按「停止」。',
    categories: { text: '文字', layout: '版面', image: '圖片', chart: '圖表', consistency: '一致性' }
  },
  en: {
    ledgerTitle: 'Automatic visual check', renderedSlides: 'Drew {total} slides', sheetsDone: 'Made {total} contact sheets', reviewedBy: 'Finished looking',
    slideProgress: 'Drawing slide {n} of {total}', sheetsProgress: 'Sheet {n} of {total} ready', reviewingSheets: 'Looking at {count} pictures', issuesFound: '{count} issues found',
    fixing: 'Redoing the presentation', freeHeading: 'Visual check done: {found} issues found, and the presentation was redone.', freeNoFile: 'The AI did not produce a corrected presentation file.',
    preparing: 'Checking the slide layout…', rendering: 'Turning slides into images', reviewing: 'Reviewing the slides', applying: 'Applying the fixes', stop: 'Stop',
    heading: 'Visual check done: {found} issues found, {fixed} fixed.', slide: 'Slide {number}', notFixed: '(not fixed)', partial: 'Only the first {count} slides were checked.',
    clean: 'Visual check done: nothing needs fixing.', failed: 'The visual check did not finish: {reason}', setting: 'Check presentations visually',
    hint: 'After a model that can see images writes a presentation, its slides are checked as images once and fixed. Uses extra tokens for each deck.',
    sendLocked: 'The visual check is running. You can send again when it finishes or after you press Stop', sendLockedNotice: 'The visual check has not finished. Wait for it, or press Stop first.',
    categories: { text: 'Text', layout: 'Layout', image: 'Image', chart: 'Chart', consistency: 'Consistency' }
  },
  fr: {
    ledgerTitle: 'Vérification visuelle automatique', renderedSlides: '{total} diapositives dessinées', sheetsDone: '{total} planches créées', reviewedBy: 'Examen terminé',
    slideProgress: 'Diapositive {n} sur {total}', sheetsProgress: 'Planche {n} sur {total} prête', reviewingSheets: 'Examen de {count} images', issuesFound: '{count} problèmes trouvés',
    fixing: 'Refonte de la présentation', freeHeading: 'Vérification visuelle terminée : {found} problèmes trouvés, la présentation a été refaite.', freeNoFile: 'L’IA n’a pas produit de présentation corrigée.',
    preparing: 'Vérification de la mise en page…', rendering: 'Conversion des diapositives en images', reviewing: 'Examen des diapositives', applying: 'Application des corrections', stop: 'Arrêter',
    heading: 'Vérification visuelle terminée : {found} problèmes trouvés, {fixed} corrigés.', slide: 'Diapositive {number}', notFixed: '(non corrigé)', partial: 'Seules les {count} premières diapositives ont été vérifiées.',
    clean: 'Vérification visuelle terminée : rien à corriger.', failed: 'La vérification visuelle n’a pas abouti : {reason}', setting: 'Vérifier visuellement les présentations',
    hint: 'Après qu’un modèle capable de voir les images a rédigé une présentation, ses diapositives sont vérifiées une fois en images et corrigées. Consomme des jetons supplémentaires.',
    sendLocked: 'La vérification visuelle est en cours. Vous pourrez envoyer à sa fin ou après avoir appuyé sur Arrêter', sendLockedNotice: 'La vérification visuelle n’est pas terminée. Attendez-la ou appuyez d’abord sur Arrêter.',
    categories: { text: 'Texte', layout: 'Mise en page', image: 'Image', chart: 'Graphique', consistency: 'Cohérence' }
  },
  ru: {
    ledgerTitle: 'Автоматическая визуальная проверка', renderedSlides: 'Нарисовано слайдов: {total}', sheetsDone: 'Создано листов: {total}', reviewedBy: 'Просмотр завершён',
    slideProgress: 'Слайд {n} из {total}', sheetsProgress: 'Лист {n} из {total} готов', reviewingSheets: 'Просмотр изображений: {count}', issuesFound: 'Найдено проблем: {count}',
    fixing: 'Переделка презентации', freeHeading: 'Визуальная проверка завершена: найдено проблем — {found}, презентация переделана.', freeNoFile: 'ИИ не создал исправленный файл презентации.',
    preparing: 'Проверка макета слайдов…', rendering: 'Преобразование слайдов в изображения', reviewing: 'Проверка слайдов', applying: 'Применение исправлений', stop: 'Остановить',
    heading: 'Визуальная проверка завершена: найдено проблем — {found}, исправлено — {fixed}.', slide: 'Слайд {number}', notFixed: '(не исправлено)', partial: 'Проверены только первые {count} слайдов.',
    clean: 'Визуальная проверка завершена: исправлять нечего.', failed: 'Визуальная проверка не завершена: {reason}', setting: 'Визуально проверять презентации',
    hint: 'После того как модель с поддержкой изображений создаст презентацию, слайды один раз проверяются как изображения и исправляются. Требует дополнительных токенов.',
    sendLocked: 'Идёт визуальная проверка. Отправка станет доступна после её завершения или после нажатия «Остановить»', sendLockedNotice: 'Визуальная проверка ещё не завершена. Дождитесь её окончания или сначала нажмите «Остановить».',
    categories: { text: 'Текст', layout: 'Макет', image: 'Изображение', chart: 'Диаграмма', consistency: 'Единообразие' }
  },
  es: {
    ledgerTitle: 'Revisión visual automática', renderedSlides: '{total} diapositivas dibujadas', sheetsDone: '{total} hojas creadas', reviewedBy: 'Revisión terminada',
    slideProgress: 'Diapositiva {n} de {total}', sheetsProgress: 'Hoja {n} de {total} lista', reviewingSheets: 'Revisando {count} imágenes', issuesFound: '{count} problemas encontrados',
    fixing: 'Rehaciendo la presentación', freeHeading: 'Revisión visual terminada: {found} problemas encontrados y la presentación se rehizo.', freeNoFile: 'La IA no produjo una presentación corregida.',
    preparing: 'Revisando el diseño de las diapositivas…', rendering: 'Convirtiendo las diapositivas en imágenes', reviewing: 'Revisando las diapositivas', applying: 'Aplicando las correcciones', stop: 'Detener',
    heading: 'Revisión visual terminada: {found} problemas encontrados, {fixed} corregidos.', slide: 'Diapositiva {number}', notFixed: '(sin corregir)', partial: 'Solo se revisaron las primeras {count} diapositivas.',
    clean: 'Revisión visual terminada: no hay nada que corregir.', failed: 'La revisión visual no terminó: {reason}', setting: 'Revisar visualmente las presentaciones',
    hint: 'Cuando un modelo que puede ver imágenes escribe una presentación, sus diapositivas se revisan una vez como imágenes y se corrigen. Usa tokens adicionales.',
    sendLocked: 'La revisión visual está en curso. Podrás enviar al terminar o tras pulsar Detener', sendLockedNotice: 'La revisión visual no ha terminado. Espera a que acabe o pulsa Detener primero.',
    categories: { text: 'Texto', layout: 'Diseño', image: 'Imagen', chart: 'Gráfico', consistency: 'Consistencia' }
  }
});

export const visionText = (language, key, values = {}) => {
  const template = VISION_TEXTS[language]?.[key] || VISION_TEXTS.en[key] || '';
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
};
