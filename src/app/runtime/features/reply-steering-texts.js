// The words of the choice "what Send does while a reply is running" and of the line that says a message waits (docs/superpowers/specs/2026-10-26-reply-steering-design.md), in the five languages.

const TEXTS = Object.freeze({
  'zh-TW': Object.freeze({
    setting: '回覆進行中按「傳送」時',
    hint: '模型還在回答時，輸入框有字再按傳送要怎麼處理；沒有字時，按鈕是「中斷」。',
    steer: '引導（模型下一次用工具時看到；沒用工具就立刻送出）',
    queue: '排隊（等這則回覆結束再送出）',
    sendNow: '立刻送出（中止這則回覆再送出）',
    queued: '回覆結束後送出',
    cancelQueue: '取消排隊'
  }),
  en: Object.freeze({
    setting: 'When you press Send while a reply is running',
    hint: 'With text in the box, Send does this while the model is still answering; with an empty box the button is "Stop".',
    steer: 'Steer (the model sees it at its next tool use; with no tools it is sent at once)',
    queue: 'Queue (send when this reply ends)',
    sendNow: 'Send now (stop this reply, then send)',
    queued: 'Sends when the reply ends',
    cancelQueue: 'Cancel'
  }),
  fr: Object.freeze({
    setting: 'Quand vous appuyez sur Envoyer pendant une réponse',
    hint: 'Avec du texte dans la zone, Envoyer fait ceci pendant que le modèle répond ; avec une zone vide, le bouton est « Arrêter ».',
    steer: 'Guider (le modèle le voit à sa prochaine utilisation d’un outil ; sans outil, envoi immédiat)',
    queue: 'File d’attente (envoyer à la fin de cette réponse)',
    sendNow: 'Envoyer maintenant (arrêter cette réponse, puis envoyer)',
    queued: 'Envoi à la fin de la réponse',
    cancelQueue: 'Annuler'
  }),
  ru: Object.freeze({
    setting: 'Когда вы нажимаете «Отправить» во время ответа',
    hint: 'Если в поле есть текст, «Отправить» делает это, пока модель отвечает; если поле пустое, кнопка — «Остановить».',
    steer: 'Направить (модель увидит это при следующем вызове инструмента; без инструментов отправляется сразу)',
    queue: 'В очередь (отправить, когда этот ответ закончится)',
    sendNow: 'Отправить сейчас (остановить этот ответ и отправить)',
    queued: 'Отправится после ответа',
    cancelQueue: 'Отменить'
  }),
  es: Object.freeze({
    setting: 'Al pulsar Enviar mientras responde',
    hint: 'Con texto en la caja, Enviar hace esto mientras el modelo responde; con la caja vacía el botón es «Detener».',
    steer: 'Guiar (el modelo lo ve en su próximo uso de una herramienta; sin herramientas se envía al instante)',
    queue: 'En cola (enviar cuando termine esta respuesta)',
    sendNow: 'Enviar ya (detener esta respuesta y enviar)',
    queued: 'Se enviará al terminar la respuesta',
    cancelQueue: 'Cancelar'
  })
});

export const replySteeringText = (language, key) => (TEXTS[language] || TEXTS.en)[key] ?? TEXTS.en[key] ?? key;
