export function getCouncilRuntimeTexts(uiLanguage) {
  if (uiLanguage === 'en') {
    return {
      visualOnly: 'visual participants',
      skipped: 'skipped',
      noVisionParticipants: 'At least one participant model must support images for this council request',
      skippedVisualReason: 'Skipped because this model does not support the attached image/video',
      sharedSearch: 'Shared search packet',
      searchRunning: 'Searching once for shared council context',
      searchDone: 'Shared search packet ready',
      searchFailed: 'Shared search failed; continuing without it',
      firstRound: 'Council members are thinking',
      deliberation: 'Council members are revising',
      synthesis: 'Synthesizer is combining the council',
      completed: 'Council completed',
      pending: 'Waiting',
      running: 'Thinking',
      done: 'Done',
      failed: 'Failed',
      skippedStatus: 'Skipped',
      activeVisionNote: 'Only image-capable members will answer this image request.',
      comparisonToggle: 'Summarize agreements and differences',
      retrying: 'Retrying once',
      councilLocked: 'Council is running; settings are locked until this reply finishes.',
      searchManualNotice: 'Council mode does not enable Search automatically. Turn on Search before sending if this question needs current web information.',
      searchEnabledNote: 'Search is on: the council will use one shared search packet.'
    };
  }
  if (uiLanguage === 'fr') {
    return {
      visualOnly: 'participants visuels',
      skipped: 'ignore',
      noVisionParticipants: 'Au moins un modele participant doit prendre en charge les images pour cette demande du conseil',
      skippedVisualReason: 'Ignore car ce modele ne prend pas en charge l image ou la video jointe',
      sharedSearch: 'Paquet de recherche partage',
      searchRunning: 'Recherche unique pour le contexte commun du conseil',
      searchDone: 'Paquet de recherche partage pret',
      searchFailed: 'La recherche partagee a echoue; poursuite sans celle-ci',
      firstRound: 'Les membres du conseil reflechissent',
      deliberation: 'Les membres du conseil revisent',
      synthesis: 'Le modele de synthese combine le conseil',
      completed: 'Conseil termine',
      pending: 'En attente',
      running: 'Reflexion',
      done: 'Termine',
      failed: 'Echec',
      skippedStatus: 'Ignore',
      activeVisionNote: 'Seuls les membres compatibles avec les images repondront a cette demande.',
      comparisonToggle: 'Resumer les accords et les differences',
      retrying: 'Nouvelle tentative',
      councilLocked: 'Le conseil est en cours; les reglages sont verrouilles jusqu a la fin de cette reponse.',
      searchManualNotice: 'Le mode Conseil n active pas automatiquement la recherche. Activez la recherche avant l envoi si cette question requiert des informations web actuelles.',
      searchEnabledNote: 'La recherche est activee: le conseil utilisera un paquet de recherche partage.'
    };
  }
  if (uiLanguage === 'ru') {
    return {
      visualOnly: 'участники с поддержкой изображений', skipped: 'пропущено',
      noVisionParticipants: 'Для этого запроса хотя бы одна модель-участник должна поддерживать изображения',
      skippedVisualReason: 'Пропущено: модель не поддерживает прикреплённое изображение или видео',
      sharedSearch: 'Общие результаты поиска', searchRunning: 'Выполняется общий поиск для совета',
      searchDone: 'Общие результаты поиска готовы', searchFailed: 'Общий поиск не удался; продолжаем без него',
      firstRound: 'Участники совета обдумывают ответ', deliberation: 'Участники совета уточняют ответы',
      synthesis: 'Итоговая модель объединяет ответы', completed: 'Работа совета завершена',
      pending: 'Ожидание', running: 'Обдумывание', done: 'Готово', failed: 'Ошибка', skippedStatus: 'Пропущено',
      activeVisionNote: 'На запрос с изображением ответят только модели, которые поддерживают изображения.',
      comparisonToggle: 'Обобщить совпадения и различия', retrying: 'Повторная попытка',
      councilLocked: 'Совет работает; настройки будут доступны после завершения ответа.',
      searchManualNotice: 'Режим совета не включает поиск автоматически. Если нужны актуальные данные из интернета, включите поиск перед отправкой.',
      searchEnabledNote: 'Поиск включён: совет будет использовать общие результаты поиска.'
    };
  }
  if (uiLanguage === 'es') {
    return {
      visualOnly: 'participantes con visión', skipped: 'omitido',
      noVisionParticipants: 'Al menos un modelo participante debe admitir imágenes para esta solicitud',
      skippedVisualReason: 'Omitido porque este modelo no admite la imagen o el vídeo adjuntos',
      sharedSearch: 'Resultados de búsqueda compartidos', searchRunning: 'Buscando contexto compartido para el consejo',
      searchDone: 'Los resultados de búsqueda compartidos están listos', searchFailed: 'La búsqueda compartida falló; se continuará sin ella',
      firstRound: 'Los miembros del consejo están reflexionando', deliberation: 'Los miembros del consejo están revisando',
      synthesis: 'El modelo de síntesis está combinando las respuestas', completed: 'Consejo completado',
      pending: 'En espera', running: 'Reflexionando', done: 'Listo', failed: 'Error', skippedStatus: 'Omitido',
      activeVisionNote: 'Solo los miembros compatibles con imágenes responderán a esta solicitud.',
      comparisonToggle: 'Resumir coincidencias y diferencias', retrying: 'Reintentando',
      councilLocked: 'El consejo está trabajando; la configuración se desbloqueará al terminar la respuesta.',
      searchManualNotice: 'El modo Consejo no activa la búsqueda automáticamente. Actívala antes de enviar si necesitas información web actualizada.',
      searchEnabledNote: 'La búsqueda está activada: el consejo utilizará resultados compartidos.'
    };
  }
  return {
    visualOnly: '支援圖片的成員',
    skipped: '已略過',
    noVisionParticipants: '這次理事會請求至少需要一個支援圖片的參與模型',
    skippedVisualReason: '此模型不支援目前附加的圖片或影片，已略過',
    sharedSearch: '理事會共用搜尋資料包',
    searchRunning: '正在為理事會建立共用搜尋資料',
    searchDone: '理事會共用搜尋資料已就緒',
    searchFailed: '共用搜尋失敗，將不使用搜尋資料繼續',
    firstRound: '理事會成員正在思考',
    deliberation: '理事會成員正在修正',
    synthesis: '統整模型正在整合理事會結果',
    completed: '理事會已完成',
    pending: '等待中',
    running: '思考中',
    done: '完成',
    failed: '失敗',
    skippedStatus: '已略過',
    activeVisionNote: '只有支援圖片的成員會回覆這次圖片請求。',
    comparisonToggle: '整理共識與差異',
    retrying: '正在重試一次',
    councilLocked: '理事會正在執行，這次回覆完成前設定會暫時鎖定。',
    searchManualNotice: '理事會模式不會自動開啟搜索。若這個問題需要最新網路資訊，請在送出前手動開啟搜索。',
    searchEnabledNote: '搜索已開啟：理事會會使用一份共用搜尋資料包。'
  };
}
