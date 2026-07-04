const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstileScript({ window, document }) {
  if (window.turnstile) return Promise.resolve(window.turnstile);

  const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
  if (existing?.dataset.loaded === 'true' && window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  return new Promise((resolve, reject) => {
    const script = existing || document.createElement('script');
    const handleLoad = () => {
      script.dataset.loaded = 'true';
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      reject(new Error('Cloudflare Turnstile did not initialize.'));
    };
    const handleError = () => reject(new Error('Cloudflare Turnstile failed to load.'));

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

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
  siteKey = import.meta.env?.VITE_TURNSTILE_SITE_KEY?.trim() || ''
} = {}) {
  const widgets = new Map();

  async function mount(name, anchorElement) {
    if (!siteKey || !anchorElement) return false;
    if (widgets.has(name)) return true;

    const container = document.createElement('div');
    container.className = 'turnstile-widget flex justify-center my-3';
    container.dataset.turnstileName = name;
    anchorElement.before(container);

    const state = { container, token: '', widgetId: null };
    widgets.set(name, state);

    try {
      const turnstile = await loadTurnstileScript({ window, document });
      state.widgetId = turnstile.render(container, {
        sitekey: siteKey,
        theme: 'auto',
        callback: (token) => {
          state.token = token;
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
    reset
  };
}
