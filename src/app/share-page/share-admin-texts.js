// The words of the page where the owner of the service reviews the reports of shared conversations (share-admin-page.js), in the five languages.

export const SHARE_ADMIN_TEXTS = {
  'zh-TW': {
    statusRemoved: '已下架', remove: '下架', deleteRecord: '刪除紀錄',
    restoreTakedown: '撤銷下架', contentGone: '無法撤銷：內容已在下架時清除',
    title: '被檢舉的分享', signIn: '請先登入 Noureon，再回到這個網址。', notFound: '找不到頁面。', empty: '目前沒有被檢舉的分享。', failed: '讀取失敗，請稍後再試。',
    owner: '分享者', readers: '{n} 位不同讀者檢舉', reports: '共 {n} 筆', mode: '權限', view: '唯讀', continue: '可接著聊',
    statusActive: '有效', statusSuspended: '已暫停', statusDeleted: '對話已刪除',
    open: '看內容', pause: '暫停', restore: '恢復', dismiss: '清除檢舉', delete: '刪除', sure: '確定？再按一次', reasons: '讀者寫的原因', untitled: '（沒有名稱）', done: '已完成'
  },
  en: {
    statusRemoved: 'Taken down', remove: 'Take down', deleteRecord: 'Delete record',
    restoreTakedown: 'Undo takedown', contentGone: 'Cannot undo: its content was cleared when it was taken down',
    title: 'Reported shares', signIn: 'Sign in to Noureon first, then come back to this address.', notFound: 'Page not found.', empty: 'No share is reported right now.', failed: 'Could not read. Please try again later.',
    owner: 'Shared by', readers: 'Reported by {n} different readers', reports: '{n} in all', mode: 'Permission', view: 'Read only', continue: 'Can continue',
    statusActive: 'Active', statusSuspended: 'Paused', statusDeleted: 'Conversation deleted',
    open: 'Read it', pause: 'Pause', restore: 'Restore', dismiss: 'Clear reports', delete: 'Delete', sure: 'Sure? Press again', reasons: 'What readers wrote', untitled: '(no title)', done: 'Done'
  },
  fr: {
    statusRemoved: 'Retiré', remove: 'Retirer', deleteRecord: 'Supprimer la trace',
    restoreTakedown: 'Annuler le retrait', contentGone: 'Impossible : son contenu a été effacé lors du retrait',
    title: 'Partages signalés', signIn: 'Connectez-vous d’abord à Noureon, puis revenez à cette adresse.', notFound: 'Page introuvable.', empty: 'Aucun partage n’est signalé pour le moment.', failed: 'Lecture impossible. Réessayez plus tard.',
    owner: 'Partagé par', readers: 'Signalé par {n} lecteurs différents', reports: '{n} au total', mode: 'Autorisation', view: 'Lecture seule', continue: 'Peut continuer',
    statusActive: 'Actif', statusSuspended: 'Suspendu', statusDeleted: 'Conversation supprimée',
    open: 'Lire', pause: 'Suspendre', restore: 'Rétablir', dismiss: 'Effacer les signalements', delete: 'Supprimer', sure: 'Sûr ? Appuyez encore', reasons: 'Ce que les lecteurs ont écrit', untitled: '(sans titre)', done: 'Fait'
  },
  ru: {
    statusRemoved: 'Удалена', remove: 'Удалить ссылку', deleteRecord: 'Удалить запись',
    restoreTakedown: 'Отменить удаление', contentGone: 'Нельзя отменить: содержимое было стёрто при удалении',
    title: 'Ссылки с жалобами', signIn: 'Сначала войдите в Noureon, затем вернитесь на этот адрес.', notFound: 'Страница не найдена.', empty: 'Сейчас нет ссылок с жалобами.', failed: 'Не удалось прочитать. Повторите попытку позже.',
    owner: 'Поделился(-ась)', readers: 'Жалоб от разных читателей: {n}', reports: 'Всего {n}', mode: 'Доступ', view: 'Только чтение', continue: 'Можно продолжить',
    statusActive: 'Действует', statusSuspended: 'Приостановлена', statusDeleted: 'Беседа удалена',
    open: 'Прочитать', pause: 'Приостановить', restore: 'Вернуть', dismiss: 'Снять жалобы', delete: 'Удалить', sure: 'Точно? Нажмите ещё раз', reasons: 'Что написали читатели', untitled: '(без названия)', done: 'Готово'
  },
  es: {
    statusRemoved: 'Retirado', remove: 'Retirar', deleteRecord: 'Eliminar el registro',
    restoreTakedown: 'Deshacer el retiro', contentGone: 'No se puede deshacer: su contenido se borró al retirarlo',
    title: 'Enlaces denunciados', signIn: 'Primero inicia sesión en Noureon y luego vuelve a esta dirección.', notFound: 'Página no encontrada.', empty: 'Ahora no hay enlaces denunciados.', failed: 'No se pudo leer. Inténtalo más tarde.',
    owner: 'Compartido por', readers: 'Denunciado por {n} lectores distintos', reports: '{n} en total', mode: 'Permiso', view: 'Solo lectura', continue: 'Se puede continuar',
    statusActive: 'Activo', statusSuspended: 'En pausa', statusDeleted: 'Conversación eliminada',
    open: 'Leer', pause: 'Pausar', restore: 'Restablecer', dismiss: 'Borrar denuncias', delete: 'Eliminar', sure: '¿Seguro? Pulsa otra vez', reasons: 'Lo que escribieron los lectores', untitled: '(sin título)', done: 'Hecho'
  }
};

export const shareAdminText = (language, key, values = {}) => String((SHARE_ADMIN_TEXTS[language] || SHARE_ADMIN_TEXTS.en)[key] ?? SHARE_ADMIN_TEXTS.en[key] ?? key)
  .replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
