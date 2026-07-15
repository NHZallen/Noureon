const DEFAULT_IDLE_TIMEOUT_MS = 15000;
const DEFAULT_FALLBACK_DELAY_MS = 2000;

function waitForServiceWorkerControl(serviceWorker) {
  if (serviceWorker.controller) {
    return Promise.resolve(serviceWorker.controller);
  }
  if (typeof serviceWorker.addEventListener !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const handleControllerChange = () => {
      if (!serviceWorker.controller) return;
      serviceWorker.removeEventListener?.('controllerchange', handleControllerChange);
      resolve(serviceWorker.controller);
    };

    serviceWorker.addEventListener('controllerchange', handleControllerChange);
    // Do not miss control being acquired between the first check and listener setup.
    handleControllerChange();
  });
}

function waitForIdle(windowTarget, { idleTimeoutMs, fallbackDelayMs }) {
  return new Promise((resolve) => {
    if (typeof windowTarget?.requestIdleCallback === 'function') {
      windowTarget.requestIdleCallback(resolve, { timeout: idleTimeoutMs });
      return;
    }

    const schedule = typeof windowTarget?.setTimeout === 'function'
      ? windowTarget.setTimeout.bind(windowTarget)
      : globalThis.setTimeout;
    schedule(resolve, fallbackDelayMs);
  });
}

export function scheduleArchiveVendorPrewarm({
  navigatorTarget = globalThis.navigator,
  windowTarget = globalThis.window,
  loadArchiveVendor,
  logger = console,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  fallbackDelayMs = DEFAULT_FALLBACK_DELAY_MS
} = {}) {
  const serviceWorker = navigatorTarget?.serviceWorker;
  if (!serviceWorker || typeof loadArchiveVendor !== 'function') {
    return Promise.resolve({ prewarmed: false, reason: 'unsupported' });
  }

  return Promise.resolve()
    .then(() => serviceWorker.ready)
    .then((registration) => {
      if (!registration?.active) return null;
      return waitForServiceWorkerControl(serviceWorker);
    })
    .then(async (controller) => {
      if (!controller) return { prewarmed: false, reason: 'not-controlled' };

      await waitForIdle(windowTarget, { idleTimeoutMs, fallbackDelayMs });
      await loadArchiveVendor();
      return { prewarmed: true };
    })
    .catch((error) => {
      try {
        logger?.warn?.('Archive support could not be prepared for offline use:', error);
      } catch {
        // Diagnostics must never turn optional prewarming into an app failure.
      }
      return { prewarmed: false, reason: 'prewarm-failed' };
    });
}
