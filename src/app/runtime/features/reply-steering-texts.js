// The words of the choice "what Send does while a reply is running" and of the line that says a message waits (docs/superpowers/specs/2026-10-26-reply-steering-design.md), in the five languages.

const TEXTS = Object.freeze({
  'zh-TW': Object.freeze({
    setting: '回覆進行中按「傳送」時',
    hint: '模型還在回答時，輸入框有字再按傳送：「引導」把訊息交給正在進行的回覆，模型下一次用完工具時看到（沒有用工具的回覆會改成立刻送出）；「排隊」等這則回覆結束再送出；「立刻送出」中止回覆再送出。沒有字時，按鈕是「中斷」。',
    steer: '引導',
    queue: '排隊',
    sendNow: '立刻送出',
    queued: '回覆結束後送出',
    cancelQueue: '取消排隊'
  }),
  en: Object.freeze({
    setting: 'When you press Send while a reply is running',
    hint: 'While the model is still answering, with text in the box: "Steer" hands the message to the running reply, and the model sees it the next time it has used a tool (a reply with no tools sends it at once); "Queue" sends it when the reply ends; "Send now" stops the reply, then sends. With an empty box the button is "Stop".',
    steer: 'Steer',
    queue: 'Queue',
    sendNow: 'Send now',
    queued: 'Sends when the reply ends',
    cancelQueue: 'Cancel'
  }),
  fr: Object.freeze({
    setting: 'Quand vous appuyez sur Envoyer pendant une réponse',
    hint: 'Pendant que le modèle répond, avec du texte dans la zone : « Guider » confie le message à la réponse en cours, que le modèle voit après son prochain outil (sans outil, envoi immédiat) ; « File d’attente » envoie à la fin de la réponse ; « Envoyer maintenant » arrête la réponse puis envoie. Avec une zone vide, le bouton est « Arrêter ».',
    steer: 'Guider',
    queue: 'File d’attente',
    sendNow: 'Envoyer maintenant',
    queued: 'Envoi à la fin de la réponse',
    cancelQueue: 'Annuler'
  }),
  ru: Object.freeze({
    setting: 'Когда вы нажимаете «Отправить» во время ответа',
    hint: 'Пока модель отвечает, если в поле есть текст: «Направить» передаёт сообщение идущему ответу, модель увидит его после следующего инструмента (без инструментов — отправка сразу); «В очередь» отправит после ответа; «Отправить сейчас» остановит ответ и отправит. Если поле пустое, кнопка — «Остановить».',
    steer: 'Направить',
    queue: 'В очередь',
    sendNow: 'Отправить сейчас',
    queued: 'Отправится после ответа',
    cancelQueue: 'Отменить'
  }),
  es: Object.freeze({
    setting: 'Al pulsar Enviar mientras responde',
    hint: 'Mientras el modelo responde, con texto en la caja: «Guiar» entrega el mensaje a la respuesta en curso y el modelo lo ve tras su próxima herramienta (sin herramientas se envía al instante); «En cola» envía al terminar la respuesta; «Enviar ya» detiene la respuesta y envía. Con la caja vacía el botón es «Detener».',
    steer: 'Guiar',
    queue: 'En cola',
    sendNow: 'Enviar ya',
    queued: 'Se enviará al terminar la respuesta',
    cancelQueue: 'Cancelar'
  })
});

export const replySteeringText = (language, key) => (TEXTS[language] || TEXTS.en)[key] ?? TEXTS.en[key] ?? key;
