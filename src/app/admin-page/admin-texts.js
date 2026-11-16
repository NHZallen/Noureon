// The words around the admin page (noureon.com/admin): its name and the names of its parts, in the five languages. The words inside each part belong to that part
// (share-page/share-admin-texts.js for the reports, browser-admin/browser-admin-texts.js for the browser agent).

export const ADMIN_PAGE_TEXTS = {
  'zh-TW': { title: '後台管理', reports: '檢舉審核', browser: '瀏覽器代理' },
  en: { title: 'Admin', reports: 'Report review', browser: 'Browser agent' },
  fr: { title: 'Administration', reports: 'Examen des signalements', browser: 'Agent navigateur' },
  ru: { title: 'Администрирование', reports: 'Проверка жалоб', browser: 'Браузерный агент' },
  es: { title: 'Administración', reports: 'Revisión de denuncias', browser: 'Agente de navegador' }
};

export const adminPageText = (language, key) => String((ADMIN_PAGE_TEXTS[language] || ADMIN_PAGE_TEXTS.en)[key] ?? ADMIN_PAGE_TEXTS.en[key] ?? key);
