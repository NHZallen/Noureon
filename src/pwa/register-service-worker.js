let isUpdateNotificationShown = false;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
      })
      .catch((error) => {
        console.warn('Service Worker registration failed:', error);
      });
  });

  navigator.serviceWorker.addEventListener('message', async (event) => {
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
        window.location.reload();
      }
      return;
    }

    console.info('A new Noureon version is active.');
  });
}
