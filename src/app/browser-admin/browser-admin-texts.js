// The words of the page where the owner of the service looks after the browser agent (browser-admin-page.js), in the five languages.

export const BROWSER_ADMIN_TEXTS = {
  'zh-TW': {
    title: '瀏覽器代理管理', failed: '操作失敗，請稍後再試。',
    stopTitle: '停止所有瀏覽器', stopDesc: '立即關閉所有人正在跑的瀏覽器並釋放連接埠。', stopAll: '全部停止', sure: '確定？再按一次', stopped: '已停止 {n} 個瀏覽器。',
    codesTitle: '產生邀請碼', codesDesc: '給還沒有名額的人；每組只能用一次。', make: '產生 {n} 組', copy: '複製', copied: '已複製'
  },
  en: {
    title: 'Browser agent admin', failed: 'That did not work. Please try again later.',
    stopTitle: 'Stop every browser', stopDesc: 'Closes every browser that is running for anyone and frees the ports.', stopAll: 'Stop all', sure: 'Sure? Press again', stopped: '{n} browser(s) stopped.',
    codesTitle: 'Make invite codes', codesDesc: 'For people who have no place yet; each code works once.', make: 'Make {n}', copy: 'Copy', copied: 'Copied'
  },
  fr: {
    title: 'Administration de l’agent navigateur', failed: 'Échec. Réessayez plus tard.',
    stopTitle: 'Arrêter tous les navigateurs', stopDesc: 'Ferme tous les navigateurs en cours pour tout le monde et libère les ports.', stopAll: 'Tout arrêter', sure: 'Sûr ? Appuyez encore', stopped: '{n} navigateur(s) arrêté(s).',
    codesTitle: 'Créer des codes d’invitation', codesDesc: 'Pour les personnes qui n’ont pas encore de place ; chaque code ne sert qu’une fois.', make: 'Créer {n}', copy: 'Copier', copied: 'Copié'
  },
  ru: {
    title: 'Управление браузерным агентом', failed: 'Не получилось. Попробуйте позже.',
    stopTitle: 'Остановить все браузеры', stopDesc: 'Закрывает все запущенные у всех браузеры и освобождает порты.', stopAll: 'Остановить все', sure: 'Точно? Нажмите ещё раз', stopped: 'Остановлено браузеров: {n}.',
    codesTitle: 'Создать коды приглашения', codesDesc: 'Для тех, у кого ещё нет места; каждый код работает один раз.', make: 'Создать {n}', copy: 'Копировать', copied: 'Скопировано'
  },
  es: {
    title: 'Administración del agente de navegador', failed: 'No funcionó. Inténtalo más tarde.',
    stopTitle: 'Detener todos los navegadores', stopDesc: 'Cierra todos los navegadores en marcha de cualquier persona y libera los puertos.', stopAll: 'Detener todo', sure: '¿Seguro? Pulsa otra vez', stopped: '{n} navegador(es) detenido(s).',
    codesTitle: 'Crear códigos de invitación', codesDesc: 'Para quien aún no tiene plaza; cada código sirve una vez.', make: 'Crear {n}', copy: 'Copiar', copied: 'Copiado'
  }
};

export const browserAdminText = (language, key, values = {}) => String((BROWSER_ADMIN_TEXTS[language] || BROWSER_ADMIN_TEXTS.en)[key] ?? BROWSER_ADMIN_TEXTS.en[key] ?? key)
  .replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
