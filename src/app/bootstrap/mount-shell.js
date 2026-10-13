export function mountAppShell(appShell) {
  const app = document.querySelector('#app');
  if (!app) {
    throw new Error('Missing #app mount node.');
  }

  const startupSkeleton = app.querySelector('[data-startup-skeleton]');
  app.innerHTML = appShell;
  if (startupSkeleton) app.append(startupSkeleton);
}

export function dismissStartupSkeleton(documentTarget = globalThis.document) {
  const skeleton = documentTarget?.querySelector?.('[data-startup-skeleton]');
  if (!skeleton) return false;
  skeleton.remove();
  return true;
}

// The app's words are not loaded when the app fails to start, so the two lines of the failure are kept here, in the language the person last used.
const STARTUP_FAILURE_TEXTS = Object.freeze({
  'zh-TW': { withMessage: '載入失敗：{message}', retry: '載入失敗，請重新整理後再試。' },
  en: { withMessage: 'Failed to load: {message}', retry: 'Failed to load. Refresh the page and try again.' },
  fr: { withMessage: 'Échec du chargement : {message}', retry: 'Échec du chargement. Actualisez la page et réessayez.' },
  ru: { withMessage: 'Не удалось загрузить: {message}', retry: 'Не удалось загрузить. Обновите страницу и повторите попытку.' },
  es: { withMessage: 'No se pudo cargar: {message}', retry: 'No se pudo cargar. Actualiza la página e inténtalo de nuevo.' }
});

const startupLanguage = () => {
  try {
    const stored = globalThis.localStorage?.getItem('noureon_login_language') || globalThis.localStorage?.getItem('noureon_ui_language');
    if (STARTUP_FAILURE_TEXTS[stored]) return stored;
    // A first visit that failed: the language of the browser, when it is one of the five.
    const wanted = globalThis.navigator?.languages?.length ? globalThis.navigator.languages : [globalThis.navigator?.language || ''];
    for (const entry of wanted) {
      const tag = String(entry || '').toLowerCase();
      if (tag.startsWith('zh')) return 'zh-TW';
      const match = Object.keys(STARTUP_FAILURE_TEXTS).find((name) => name !== 'zh-TW' && (tag === name || tag.startsWith(`${name}-`)));
      if (match) return match;
    }
    return 'zh-TW';
  } catch {
    return 'zh-TW';
  }
};

export function showStartupFailure(error, documentTarget = globalThis.document) {
  const skeleton = documentTarget?.querySelector?.('[data-startup-skeleton]');
  if (!skeleton) return false;
  const status = skeleton.querySelector('[role="status"]');
  const message = skeleton.querySelector('.startup-skeleton__message');
  skeleton.querySelector('.startup-skeleton__spinner')?.remove();
  status?.setAttribute('role', 'alert');
  status?.setAttribute('aria-busy', 'false');
  if (message) {
    const text = STARTUP_FAILURE_TEXTS[startupLanguage()];
    message.textContent = error?.message
      ? text.withMessage.replace('{message}', error.message)
      : text.retry;
  }
  return true;
}
