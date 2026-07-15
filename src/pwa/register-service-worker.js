let isUpdateNotificationShown = false;

export function registerServiceWorker({
  windowTarget = globalThis.window,
  navigatorTarget = globalThis.navigator,
  development = import.meta.env?.DEV === true,
  logger = console
} = {}) {
  if (!navigatorTarget || !('serviceWorker' in navigatorTarget) || development) {
    return;
  }

  const install = () => navigatorTarget.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        logger.log('Service Worker registered:', registration);
        return registration;
      })
      .catch((error) => {
        logger.warn('Service Worker registration failed:', error);
        return null;
      });
  if (windowTarget?.document?.readyState === 'complete') {
    void install();
  } else {
    windowTarget?.addEventListener('load', install, { once: true });
  }

  navigatorTarget.serviceWorker.addEventListener('message', async (event) => {
    if (!event.data || event.data.type !== 'NEW_VERSION_ACTIVATED' || isUpdateNotificationShown) {
      return;
    }

    isUpdateNotificationShown = true;
    const dialog = globalThis.__astraShowUpdateDialog;

    if (typeof dialog === 'function') {
      const shouldReload = await dialog({
        title: 'New version available',
        message: 'A new Noureon version is ready. Reload to update.',
        buttons: [
          { text: 'Later', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false },
          { text: 'Reload', class: 'px-4 py-2 rounded-md btn-primary', value: () => true }
        ]
      });

      if (shouldReload) {
        windowTarget.location.reload();
      }
      return;
    }

    logger.info('A new Noureon version is active.');
  });
}
