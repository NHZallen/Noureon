// After a new version is deployed, a page that was opened before it still asks
// for the old build's files by their old names, and they are gone: loading a
// piece of the app fails ("Failed to fetch dynamically imported module").
// This recognises that failure, says it plainly instead of a raw browser error,
// and offers to reload the page once (never in a loop).

const PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i
];

const TEXTS = Object.freeze({
  'zh-TW': { message: 'Noureon 剛更新了新版本，這個頁面還是舊的。請重新載入頁面後再試一次。', title: '有新版本', reload: '重新載入', later: '稍後' },
  en: { message: 'Noureon was just updated and this page is still the old version. Reload the page and try again.', title: 'New version available', reload: 'Reload', later: 'Later' },
  fr: { message: 'Noureon vient d’être mis à jour et cette page est encore l’ancienne version. Rechargez la page et réessayez.', title: 'Nouvelle version disponible', reload: 'Recharger', later: 'Plus tard' },
  ru: { message: 'Noureon только что обновился, а эта страница ещё старой версии. Перезагрузите страницу и повторите попытку.', title: 'Доступна новая версия', reload: 'Перезагрузить', later: 'Позже' },
  es: { message: 'Noureon se acaba de actualizar y esta página sigue en la versión anterior. Recarga la página e inténtalo de nuevo.', title: 'Nueva versión disponible', reload: 'Recargar', later: 'Más tarde' }
});

const RELOAD_KEY = 'noureon:stale-chunk-reload';
const RELOAD_COOLDOWN_MS = 60_000;

export const isStaleChunkError = (error) => {
  if (error && typeof error === 'object' && error.staleChunk === true) return true;
  const message = String(error?.message ?? error ?? '');
  return PATTERNS.some((pattern) => pattern.test(message));
};

// The page's language, else the browser's (the app's own setting is not reachable from here).
const languageOf = (documentTarget) => {
  const tag = String(documentTarget?.documentElement?.lang || globalThis.navigator?.language || '').toLowerCase();
  if (tag.startsWith('zh')) return 'zh-TW';
  return TEXTS[tag.slice(0, 2)] ? tag.slice(0, 2) : 'zh-TW';
};

export const staleChunkMessage = (documentTarget = globalThis.document) => TEXTS[languageOf(documentTarget)].message;

// Asks once, with the app's own dialog, whether to reload. Reloading twice in a
// minute is refused, so a file that is really missing cannot loop the page.
export async function offerReloadForNewVersion({
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  now = () => Date.now()
} = {}) {
  const storage = (() => {
    try {
      return windowTarget?.sessionStorage || null;
    } catch {
      return null;
    }
  })();
  const last = Number(storage?.getItem(RELOAD_KEY) || 0);
  if (last && now() - last < RELOAD_COOLDOWN_MS) return false;
  const language = languageOf(documentTarget);
  const words = TEXTS[language];
  const dialog = globalThis.__astraShowUpdateDialog;
  if (typeof dialog !== 'function') return false;
  const shouldReload = await dialog({
    title: words.title,
    message: words.message,
    buttons: [
      { text: words.later, class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false },
      { text: words.reload, class: 'px-4 py-2 rounded-md btn-primary', value: () => true }
    ]
  });
  if (shouldReload) {
    try {
      storage?.setItem(RELOAD_KEY, String(now()));
    } catch {
      // Without storage the cooldown is simply not remembered.
    }
    windowTarget.location.reload();
  }
  return Boolean(shouldReload);
}

// Any part of the app that fails to load for this reason, wherever it was
// asked for, leads to the same offer.
export function installStaleChunkRecovery({ windowTarget = globalThis.window, documentTarget = globalThis.document } = {}) {
  if (!windowTarget?.addEventListener) return () => {};
  // One offer at a time: the same failure can arrive here twice (as a preload error, then as a rejection nobody caught).
  let offering = null;
  const offer = () => {
    if (offering) return;
    offering = offerReloadForNewVersion({ windowTarget, documentTarget }).finally(() => { offering = null; });
  };
  const onPreloadError = (event) => {
    // The failure is NOT swallowed (no preventDefault): Vite would then hand `undefined` to the code that asked for the piece, and that
    // code would fail with a puzzling "cannot read properties of undefined" instead. The import rejects, with words a person can use.
    const error = event?.payload;
    if (error && typeof error === 'object') {
      try {
        error.staleChunk = true;
        error.message = staleChunkMessage(documentTarget);
      } catch {
        // An error whose message cannot be changed keeps its own.
      }
    }
    offer();
  };
  const onRejection = (event) => {
    if (isStaleChunkError(event?.reason)) {
      event.preventDefault?.();
      offer();
    }
  };
  windowTarget.addEventListener('vite:preloadError', onPreloadError);
  windowTarget.addEventListener('unhandledrejection', onRejection);
  return () => {
    windowTarget.removeEventListener('vite:preloadError', onPreloadError);
    windowTarget.removeEventListener('unhandledrejection', onRejection);
  };
}
