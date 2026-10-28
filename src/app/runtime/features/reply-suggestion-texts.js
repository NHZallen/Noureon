// The words of the suggested reply in the app's five languages: the label of the arrow in the message box, and the setting (a switch in the replies card of the settings).

export const REPLY_SUGGESTION_TEXTS = Object.freeze({
  'zh-TW': {
    use: '使用這句回覆',
    setting: '回覆建議',
    hint: '模型回答完、而且在問你問題或等你決定時，輸入框會用半透明的字顯示你可能會說的一句話；點旁邊的箭頭（電腦上按 Tab）就會變成一般文字，可以修改或直接送出。每次需要用到一次記憶模型的小請求，會把模型最後一則回覆與你的最後一句話送給它；不會儲存。'
  },
  en: {
    use: 'Use this reply',
    setting: 'Suggested reply',
    hint: 'When the model has answered and is asking you something or waiting for your decision, the message box shows a likely reply in faint letters; tap the arrow beside it (Tab on a computer) to make it normal text you can change or send. It takes one small request to the memory model each time, which gets the last reply of the model and your last message; nothing is kept.'
  },
  fr: {
    use: 'Utiliser cette réponse',
    setting: 'Réponse suggérée',
    hint: 'Quand le modèle a répondu et vous pose une question ou attend votre décision, la zone de message affiche en grisé une réponse probable ; touchez la flèche à côté (Tab sur ordinateur) pour en faire un texte normal que vous pouvez modifier ou envoyer. Cela demande à chaque fois une petite requête au modèle de mémoire, qui reçoit la dernière réponse du modèle et votre dernier message ; rien n’est conservé.'
  },
  ru: {
    use: 'Использовать этот ответ',
    setting: 'Подсказка ответа',
    hint: 'Когда модель ответила и задаёт вам вопрос или ждёт вашего решения, в поле сообщения бледными буквами показывается вероятный ответ; нажмите стрелку рядом (Tab на компьютере), и он станет обычным текстом, который можно изменить или отправить. Каждый раз это один небольшой запрос к модели памяти, которая получает последний ответ модели и ваше последнее сообщение; ничего не сохраняется.'
  },
  es: {
    use: 'Usar esta respuesta',
    setting: 'Respuesta sugerida',
    hint: 'Cuando el modelo ha respondido y te pregunta algo o espera tu decisión, el cuadro de mensaje muestra en tenue una respuesta probable; toca la flecha de al lado (Tab en un ordenador) para convertirla en texto normal que puedes cambiar o enviar. Cada vez cuesta una pequeña petición al modelo de memoria, que recibe la última respuesta del modelo y tu último mensaje; no se guarda nada.'
  }
});

/** One text in a language (English when the language lacks it). */
export function replySuggestionText(language, key) {
  return REPLY_SUGGESTION_TEXTS[language]?.[key] ?? REPLY_SUGGESTION_TEXTS.en[key] ?? key;
}
