// Talks to the Python sandbox page (public/sandbox/) in a hidden iframe on
// the sandbox origin. The sandbox only ever receives code, the files it
// should work on and the document language, never keys, conversations or
// account data. Loaded on demand.

import { MESSAGE_TYPES, SANDBOX_LIMITS } from './sandbox-protocol.js';

const FIRST_REPLY_TIMEOUT_MS = 20_000;
// Longer than the longest run (120 s), during which the sandbox is silent.
const SILENCE_TIMEOUT_MS = 150_000;

export class SandboxError extends Error {
  constructor(message, { stage = '', code = 'sandbox-load-failed' } = {}) {
    super(message);
    this.name = 'SandboxError';
    this.stage = stage;
    this.code = code;
  }
}

const toArrayBuffer = async (bytes) => {
  if (bytes instanceof ArrayBuffer) return bytes.slice(0);
  if (ArrayBuffer.isView(bytes)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (bytes && typeof bytes.arrayBuffer === 'function') return bytes.arrayBuffer();
  return new ArrayBuffer(0);
};

export function createSandboxClient({
  document,
  window,
  origin,
  language = 'zh-TW',
  // Chart fonts, asked for the first time matplotlib is used:
  // () => Promise<[{ name, family, bytes }]>.
  loadFonts = async () => [],
  onProgress = () => {},
  createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}) {
  let iframe = null;
  let ready = null;
  const pending = new Map();
  // When the sandbox last said anything; it reports progress while loading.
  let lastHeard = 0;
  let heardAnything = false;

  const onMessage = (event) => {
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== origin) return;
    const message = event.data || {};
    lastHeard = Date.now();
    heardAnything = true;
    if (message.type === MESSAGE_TYPES.progress) {
      onProgress(message);
      return;
    }
    if (message.type === MESSAGE_TYPES.fontsRequest) {
      sendFonts();
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    window.clearInterval(entry.watchdog);
    if (message.type === MESSAGE_TYPES.failure) {
      entry.reject(new SandboxError(message.message || 'The sandbox failed.', { stage: message.stage }));
    } else {
      entry.resolve(message);
    }
  };

  const sendFonts = async () => {
    let fonts = [];
    try {
      fonts = await loadFonts();
    } catch {
      // Charts then use matplotlib's own fonts.
    }
    // Copies, so the caller's bytes stay usable.
    const copies = (fonts || []).map((font) => ({ name: font.name, family: font.family, bytes: font.bytes.slice().buffer }));
    iframe?.contentWindow.postMessage({ type: MESSAGE_TYPES.fonts, fonts: copies }, origin, copies.map((font) => font.bytes));
  };

  const failAll = (error) => {
    for (const [id, entry] of pending) {
      pending.delete(id);
      window.clearInterval(entry.watchdog);
      entry.reject(error);
    }
  };

  // Sends a request and waits for its reply. A sandbox that never answers
  // (blocked, offline without a cache) or goes silent fails the request.
  const request = (type, payload = {}, transfer = []) => new Promise((resolve, reject) => {
    const id = createId();
    const started = Date.now();
    const watchdog = window.setInterval(() => {
      const now = Date.now();
      const silentFor = now - Math.max(lastHeard, started);
      if ((!heardAnything && now - started > FIRST_REPLY_TIMEOUT_MS) || silentFor > SILENCE_TIMEOUT_MS) {
        pending.delete(id);
        window.clearInterval(watchdog);
        reject(new SandboxError('The sandbox did not respond.', { stage: type }));
      }
    }, 1000);
    pending.set(id, { resolve, reject, watchdog });
    iframe.contentWindow.postMessage({ type, id, ...payload }, origin, transfer);
  });

  const ensureFrame = () => new Promise((resolve, reject) => {
    if (iframe) {
      resolve();
      return;
    }
    iframe = document.createElement('iframe');
    iframe.src = `${origin}/sandbox/index.html`;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.setAttribute('allow', '');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('title', 'Python sandbox');
    iframe.className = 'noureon-python-sandbox';
    Object.assign(iframe.style, { position: 'fixed', width: '0', height: '0', border: '0', opacity: '0', pointerEvents: 'none', left: '-10px', top: '-10px' });
    iframe.addEventListener('load', () => resolve(), { once: true });
    iframe.addEventListener('error', () => reject(new SandboxError('The sandbox page could not be loaded.', { stage: 'frame' })), { once: true });
    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
  });

  const client = {
    origin,
    // Loads the page and Python. Downloads about 12 MB the first time.
    prepare() {
      ready ||= (async () => {
        await ensureFrame();
        return request(MESSAGE_TYPES.init, { language });
      })();
      ready.catch(() => client.dispose());
      return ready;
    },
    // Replaces /input with these files: [{ name, type, bytes }].
    async mount(files = []) {
      await client.prepare();
      const prepared = [];
      let total = 0;
      for (const file of files) {
        const bytes = await toArrayBuffer(file.bytes);
        if (total + bytes.byteLength > SANDBOX_LIMITS.inputTotalBytes) continue;
        total += bytes.byteLength;
        prepared.push({ name: String(file.name || 'file'), type: String(file.type || ''), bytes });
      }
      return request(MESSAGE_TYPES.mount, { files: prepared }, prepared.map((file) => file.bytes));
    },
    // Runs code. Aborting the signal stops it by replacing the worker.
    async run(code, { timeoutMs = SANDBOX_LIMITS.runTimeoutMs, signal } = {}) {
      await client.prepare();
      if (signal?.aborted) return { stopped: true };
      const running = request(MESSAGE_TYPES.run, { code: String(code || ''), timeoutMs });
      if (!signal) return running;
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          client.reset().catch(() => {});
          resolve({ stopped: true });
        };
        signal.addEventListener('abort', onAbort, { once: true });
        running.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
      });
    },
    // Starts over for a new reply: no variables, empty /output and /work.
    // Packages already loaded stay loaded.
    async clear() {
      await client.prepare();
      return request(MESSAGE_TYPES.clear);
    },
    // Throws the Python environment away and starts a fresh one.
    async reset() {
      if (!iframe) return null;
      await ready;
      failAll(new SandboxError('The run was stopped.', { stage: 'run', code: 'stopped' }));
      return request(MESSAGE_TYPES.reset);
    },
    dispose() {
      failAll(new SandboxError('The sandbox was closed.', { stage: 'dispose', code: 'stopped' }));
      window.removeEventListener('message', onMessage);
      iframe?.remove();
      iframe = null;
      ready = null;
    }
  };
  return client;
}
