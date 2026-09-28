// The app's side of the Python sandbox protocol. The sandbox page keeps its
// own copy (public/sandbox/protocol.js); tests keep the two equal.

export const PROTOCOL_VERSION = 1;
export const PRODUCTION_SANDBOX_ORIGIN = 'https://run.noureon.com';
export const PRODUCTION_APP_ORIGINS = Object.freeze(['https://noureon.com', 'https://www.noureon.com']);

export const MESSAGE_TYPES = Object.freeze({
  init: 'init',
  mount: 'mount',
  run: 'run',
  clear: 'clear',
  reset: 'reset',
  fonts: 'fonts',
  fontsRequest: 'fonts-request',
  ready: 'ready',
  progress: 'progress',
  result: 'result',
  failure: 'failure'
});

export const SANDBOX_LIMITS = Object.freeze({
  runTimeoutMs: 60_000,
  inputTotalBytes: 100 * 1024 * 1024
});

// Where the sandbox page lives for an app on `location`: run.noureon.com in
// production; in development the other local host name on the same port, so
// the two are different origins. Null where no sandbox origin exists (for
// example a preview deployment or a phone reaching the dev server by IP).
export function resolveSandboxOrigin(location, override = '') {
  if (override) return String(override).replace(/\/+$/, '');
  if (!location) return null;
  if (PRODUCTION_APP_ORIGINS.includes(location.origin)) return PRODUCTION_SANDBOX_ORIGIN;
  if (location.protocol === 'http:' && location.hostname === 'localhost') return `http://127.0.0.1:${location.port}`;
  if (location.protocol === 'http:' && location.hostname === '127.0.0.1') return `http://localhost:${location.port}`;
  return null;
}

// Whether this browser can run the sandbox at all.
export function browserSupportsSandbox(window) {
  return Boolean(window
    && typeof window.WebAssembly === 'object'
    && typeof window.Worker === 'function'
    && typeof window.postMessage === 'function');
}
