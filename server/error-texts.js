// What the message says when the server could not make a reply, in the language of the page that asked: the same words the page
// uses for an error of its own (its "Sorry, an error occurred:"), so a reply that failed while the page was closed reads the same.
// The text a provider itself gave is kept as it is.

const PREFIX = {
  'zh-TW': '抱歉，發生錯誤：',
  en: 'Sorry, an error occurred: ',
  fr: 'Désolé, une erreur est survenue : ',
  ru: 'Извините, произошла ошибка: ',
  es: 'Lo sentimos, ocurrió un error: '
};

const OWN = {
  time_limit: {
    'zh-TW': '這則回覆花的時間太久，已被停止。',
    en: 'This reply took too long and was stopped.',
    fr: 'Cette réponse a pris trop de temps et a été arrêtée.',
    ru: 'Этот ответ шёл слишком долго и был остановлен.',
    es: 'Esta respuesta tardó demasiado y se detuvo.'
  },
  server_restarted: {
    'zh-TW': '伺服器更新時中斷了這則回覆，請再試一次。',
    en: 'The server was updated and this reply was interrupted. Please try again.',
    fr: 'Le serveur a été mis à jour et cette réponse a été interrompue. Veuillez réessayer.',
    ru: 'Сервер обновлялся, и этот ответ прервался. Попробуйте ещё раз.',
    es: 'El servidor se actualizó y esta respuesta se interrumpió. Inténtalo de nuevo.'
  },
  sandbox_unavailable: {
    'zh-TW': 'Python 沙盒暫時不能用，這則回覆沒能完成，請再試一次。',
    en: 'The Python sandbox is not available right now, so this reply could not be finished. Please try again.',
    fr: 'Le bac à sable Python n’est pas disponible pour le moment ; cette réponse n’a pas pu être terminée. Veuillez réessayer.',
    ru: 'Песочница Python сейчас недоступна, поэтому ответ не удалось завершить. Попробуйте ещё раз.',
    es: 'El entorno aislado de Python no está disponible ahora, así que no se pudo terminar esta respuesta. Inténtalo de nuevo.'
  },
  internal_error: {
    'zh-TW': '伺服器沒能完成這則回覆。',
    en: 'The server could not finish this reply.',
    fr: 'Le serveur n’a pas pu terminer cette réponse.',
    ru: 'Сервер не смог завершить этот ответ.',
    es: 'El servidor no pudo terminar esta respuesta.'
  }
};

export function errorText(language, failure) {
  const lang = PREFIX[language] ? language : 'en';
  const own = OWN[failure?.code];
  return `${PREFIX[lang]}${own ? own[lang] : failure?.message || OWN.internal_error[lang]}`;
}
