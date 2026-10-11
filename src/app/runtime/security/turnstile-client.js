const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstileScript({
  window,
  document,
  timeoutMs,
  scheduleTimeout,
  clearScheduledTimeout
}) {
  if (window.turnstile) return Promise.resolve(window.turnstile);

  const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
  if (existing?.dataset.loaded === 'true' && window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  return new Promise((resolve, reject) => {
    const script = existing || document.createElement('script');
    let settled = false;
    let timeoutId;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearScheduledTimeout(timeoutId);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      callback(value);
    };
    const handleLoad = () => {
      script.dataset.loaded = 'true';
      if (window.turnstile) {
        settle(resolve, window.turnstile);
        return;
      }
      settle(reject, new Error('Cloudflare Turnstile did not initialize.'));
    };
    const handleError = () => settle(reject, new Error('Cloudflare Turnstile failed to load.'));

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    timeoutId = scheduleTimeout(
      () => settle(reject, new Error('Cloudflare Turnstile timed out while loading.')),
      timeoutMs
    );

    if (!existing) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

export function createTurnstileClient({
  window,
  document,
  siteKey = import.meta.env?.VITE_TURNSTILE_SITE_KEY?.trim() || '',
  scriptTimeoutMs = 8000,
  scheduleTimeout = globalThis.setTimeout,
  clearScheduledTimeout = globalThis.clearTimeout
} = {}) {
  const widgets = new Map();

  async function mount(name, anchorElement) {
    if (!siteKey || !anchorElement) return false;
    if (widgets.has(name)) return true;

    const container = document.createElement('div');
    container.className = 'turnstile-widget flex justify-center my-3';
    container.dataset.turnstileName = name;
    anchorElement.before(container);

    const state = { container, token: '', widgetId: null, waiters: [] };
    widgets.set(name, state);

    try {
      const turnstile = await loadTurnstileScript({
        window,
        document,
        timeoutMs: scriptTimeoutMs,
        scheduleTimeout,
        clearScheduledTimeout
      });
      state.widgetId = turnstile.render(container, {
        sitekey: siteKey,
        theme: 'auto',
        callback: (token) => {
          state.token = token;
          for (const waiter of state.waiters.splice(0)) waiter(token);
        },
        'expired-callback': () => {
          state.token = '';
        },
        'error-callback': () => {
          state.token = '';
        }
      });
      return true;
    } catch (error) {
      widgets.delete(name);
      container.remove();
      throw error;
    }
  }

  function getToken(name) {
    return widgets.get(name)?.token || '';
  }

  // The token of a widget is good for one request only (Cloudflare refuses a second use: "timeout-or-duplicate"). After a request has used it and the widget is reset,
  // this waits until the widget has made a new one ('' when it has not within `timeoutMs`: the person has to do the check again).
  function waitForToken(name, timeoutMs = 8000) {
    const state = widgets.get(name);
    if (!state) return Promise.resolve('');
    if (state.token) return Promise.resolve(state.token);
    return new Promise((resolve) => {
      let timer;
      const done = (token) => {
        clearScheduledTimeout(timer);
        resolve(token);
      };
      state.waiters.push(done);
      timer = scheduleTimeout(() => {
        const at = state.waiters.indexOf(done);
        if (at >= 0) state.waiters.splice(at, 1);
        resolve('');
      }, timeoutMs);
    });
  }

  function reset(name) {
    const state = widgets.get(name);
    if (!state) return;
    state.token = '';
    if (state.widgetId !== null && window.turnstile) {
      window.turnstile.reset(state.widgetId);
    }
  }

  return {
    enabled: Boolean(siteKey),
    mount,
    getToken,
    waitForToken,
    reset
  };
}
