// The words of the page of a shared conversation (share-page.js), in the five languages of the app. {x} is filled in by the code.

export const SHARE_PAGE_TEXTS = {
  'zh-TW': {
    title: '分享的對話', loading: '載入中…', goToApp: '前往 Noureon',
    sharedBy: '由 {name} 分享', sharedOn: '分享於 {date}', snapshotNote: '這是分享當時的內容，之後的新訊息不會出現在這裡。',
    notFoundTitle: '找不到這個分享', notFoundBody: '連結可能已被撤銷、對話已被刪除，或網址不完整。',
    failed: '暫時讀不到這個分享，請稍後再試。', retry: '重試',
    readOnly: '這個分享是唯讀的。', continueHint: '登入 Noureon 雲端帳號後，可以複製成自己的對話，用自己的金鑰接著聊，不影響分享者的對話。',
    continueButton: '複製到我的對話並接著聊', fileGone: '檔案已不可用',
    disclaimer: '內容由使用者分享，未經 Noureon 審核。', report: '檢舉', reportTitle: '檢舉這個分享', reportPlaceholder: '簡單說明原因（選填，最多 500 字）',
    reportSend: '送出', reportCancel: '取消', reportThanks: '已收到檢舉，謝謝。', reportFailed: '送出失敗，請稍後再試。', model: '模型'
  },
  en: {
    title: 'Shared conversation', loading: 'Loading…', goToApp: 'Go to Noureon',
    sharedBy: 'Shared by {name}', sharedOn: 'Shared on {date}', snapshotNote: 'This is the conversation as it was when it was shared. Later messages do not appear here.',
    notFoundTitle: 'This share was not found', notFoundBody: 'The link may have been revoked, the conversation deleted, or the address is incomplete.',
    failed: 'This share cannot be read right now. Please try again later.', retry: 'Try again',
    readOnly: 'This share is read only.', continueHint: 'Signed in with a Noureon cloud account, you can copy it into your own conversations and carry on with your own keys, without touching the sharer’s conversation.',
    continueButton: 'Copy to my conversations and continue', fileGone: 'File no longer available',
    disclaimer: 'Shared by a user and not reviewed by Noureon.', report: 'Report', reportTitle: 'Report this share', reportPlaceholder: 'Say briefly why (optional, up to 500 characters)',
    reportSend: 'Send', reportCancel: 'Cancel', reportThanks: 'Report received, thank you.', reportFailed: 'Could not send. Please try again later.', model: 'Model'
  },
  fr: {
    title: 'Conversation partagée', loading: 'Chargement…', goToApp: 'Aller sur Noureon',
    sharedBy: 'Partagé par {name}', sharedOn: 'Partagé le {date}', snapshotNote: 'Voici la conversation telle qu’elle était au moment du partage. Les messages suivants n’apparaissent pas ici.',
    notFoundTitle: 'Ce partage est introuvable', notFoundBody: 'Le lien a peut-être été révoqué, la conversation supprimée, ou l’adresse est incomplète.',
    failed: 'Impossible de lire ce partage pour le moment. Réessayez plus tard.', retry: 'Réessayer',
    readOnly: 'Ce partage est en lecture seule.', continueHint: 'Connecté avec un compte cloud Noureon, vous pouvez la copier dans vos conversations et la poursuivre avec vos propres clés, sans toucher à celle de la personne qui l’a partagée.',
    continueButton: 'Copier dans mes conversations et continuer', fileGone: 'Fichier plus disponible',
    disclaimer: 'Contenu partagé par un utilisateur, non vérifié par Noureon.', report: 'Signaler', reportTitle: 'Signaler ce partage', reportPlaceholder: 'Dites brièvement pourquoi (facultatif, 500 caractères au plus)',
    reportSend: 'Envoyer', reportCancel: 'Annuler', reportThanks: 'Signalement reçu, merci.', reportFailed: 'Envoi impossible. Réessayez plus tard.', model: 'Modèle'
  },
  ru: {
    title: 'Беседа по ссылке', loading: 'Загрузка…', goToApp: 'Перейти в Noureon',
    sharedBy: 'Поделился(-ась): {name}', sharedOn: 'Дата: {date}', snapshotNote: 'Это беседа в том виде, в каком ею поделились. Более поздние сообщения здесь не появятся.',
    notFoundTitle: 'Ссылка не найдена', notFoundBody: 'Возможно, ссылка отозвана, беседа удалена или адрес неполный.',
    failed: 'Сейчас не удаётся прочитать эту ссылку. Повторите попытку позже.', retry: 'Повторить',
    readOnly: 'Эта беседа доступна только для чтения.', continueHint: 'Войдя в облачную учётную запись Noureon, вы можете скопировать её в свои беседы и продолжить со своими ключами, не затрагивая беседу автора.',
    continueButton: 'Скопировать в мои беседы и продолжить', fileGone: 'Файл больше недоступен',
    disclaimer: 'Содержимым поделился пользователь, Noureon его не проверяла.', report: 'Пожаловаться', reportTitle: 'Пожаловаться на эту ссылку', reportPlaceholder: 'Коротко опишите причину (по желанию, до 500 символов)',
    reportSend: 'Отправить', reportCancel: 'Отмена', reportThanks: 'Жалоба получена, спасибо.', reportFailed: 'Не удалось отправить. Повторите попытку позже.', model: 'Модель'
  },
  es: {
    title: 'Conversación compartida', loading: 'Cargando…', goToApp: 'Ir a Noureon',
    sharedBy: 'Compartido por {name}', sharedOn: 'Compartido el {date}', snapshotNote: 'Esta es la conversación tal como estaba al compartirla. Los mensajes posteriores no aparecen aquí.',
    notFoundTitle: 'No se encuentra este enlace', notFoundBody: 'Puede que el enlace se haya revocado, la conversación se haya eliminado o la dirección esté incompleta.',
    failed: 'Ahora mismo no se puede leer este enlace. Inténtalo más tarde.', retry: 'Reintentar',
    readOnly: 'Este enlace es de solo lectura.', continueHint: 'Con una cuenta en la nube de Noureon puedes copiarla a tus conversaciones y seguir con tus propias claves, sin tocar la conversación de quien la compartió.',
    continueButton: 'Copiar a mis conversaciones y continuar', fileGone: 'Archivo ya no disponible',
    disclaimer: 'Contenido compartido por un usuario y no revisado por Noureon.', report: 'Denunciar', reportTitle: 'Denunciar este enlace', reportPlaceholder: 'Di brevemente el motivo (opcional, hasta 500 caracteres)',
    reportSend: 'Enviar', reportCancel: 'Cancelar', reportThanks: 'Denuncia recibida, gracias.', reportFailed: 'No se pudo enviar. Inténtalo más tarde.', model: 'Modelo'
  }
};

export const sharePageText = (language, key, values = {}) => String((SHARE_PAGE_TEXTS[language] || SHARE_PAGE_TEXTS.en)[key] ?? SHARE_PAGE_TEXTS.en[key] ?? key)
  .replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
