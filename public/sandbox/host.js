// The sandbox page, loaded by the app in a hidden iframe from the sandbox
// origin (run.noureon.com). It only talks to the app through postMessage and
// runs Python in a worker it can throw away: after a time limit, when the
// user stops, or when the worker crashes (for example out of memory).

import { LIMITS, MESSAGE_TYPES, PROTOCOL_VERSION, PYODIDE_VERSION, isAllowedAppOrigin, isAllowedSandboxOrigin } from './protocol.js';

const LOAD_TIMEOUT_MS = 5 * 60_000;
const SERVICE_WORKER_WAIT_MS = 4000;
const FATAL_ERROR = /Pyodide (?:already fatally failed|has suffered a fatal error)/;

const sandboxOrigin = window.location.origin;
let appOrigin = null;
let worker = null;
let workerLoading = null;
let settings = null;
let inputFiles = [];
let current = null;
// Chart fonts from the app, kept for later workers; workers waiting for them.
let chartFonts = null;
const fontWaiters = new Set();

const send = (message, transfer = []) => {
  if (appOrigin) window.parent.postMessage(message, appOrigin, transfer);
};

// The service worker keeps Pyodide cached (and checks its hashes); without
// one the sandbox still works, loading from the network each time.
const serviceWorkerReady = (async () => {
  const container = navigator.serviceWorker;
  if (!container) return;
  try {
    await container.register('./sw.js', { scope: './' });
    if (container.controller) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, SERVICE_WORKER_WAIT_MS);
      container.addEventListener('controllerchange', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  } catch {
    // Private windows and some browsers refuse service workers.
  }
})();

const stopWorker = () => {
  worker?.terminate();
  worker = null;
  workerLoading = null;
};

// Starts a worker, loads Pyodide in it and mounts the current input files.
const startWorker = () => {
  workerLoading ||= (async () => {
    await serviceWorkerReady;
    const next = new Worker('./worker.js', { type: 'module' });
    worker = next;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Loading Python timed out.')), LOAD_TIMEOUT_MS);
      const settle = (callback, value) => {
        clearTimeout(timer);
        next.removeEventListener('message', onMessage);
        next.removeEventListener('error', onError);
        callback(value);
      };
      const onMessage = (event) => {
        const message = event.data || {};
        if (message.type === MESSAGE_TYPES.progress) send(message);
        else if (message.type === MESSAGE_TYPES.ready) settle(resolve);
        else if (message.type === MESSAGE_TYPES.failure) settle(reject, new Error(message.message));
      };
      const onError = (event) => {
        event.preventDefault?.();
        settle(reject, new Error(event.message || 'The Python worker failed to start.'));
      };
      next.addEventListener('message', onMessage);
      next.addEventListener('error', onError);
      next.postMessage({ type: MESSAGE_TYPES.init, ...settings });
    });
    next.addEventListener('message', (event) => handleWorkerMessage(next, event.data || {}));
    next.addEventListener('error', (event) => {
      event.preventDefault?.();
      handleCrash(next, event.message);
    });
    if (inputFiles.length) await request(next, MESSAGE_TYPES.mount, { files: copyFiles(inputFiles) }, transferOf);
    return next;
  })();
  workerLoading.catch(() => stopWorker());
  return workerLoading;
};

const copyFiles = (files) => files.map((file) => ({ name: file.name, type: file.type, bytes: new Uint8Array(file.bytes.slice(0)) }));
const transferOf = (payload) => payload.files.map((file) => file.bytes.buffer);

// Internal requests (re-mounting after a restart) wait for their own reply.
let internalId = 0;
const request = (target, type, payload, transfer = () => []) => new Promise((resolve, reject) => {
  const id = `internal:${internalId += 1}`;
  const listener = (event) => {
    const message = event.data || {};
    if (message.id !== id) return;
    target.removeEventListener('message', listener);
    if (message.type === MESSAGE_TYPES.failure) reject(new Error(message.message));
    else resolve(message);
  };
  target.addEventListener('message', listener);
  target.postMessage({ type, id, ...payload }, transfer(payload));
});

const finish = (message, transfer = []) => {
  if (!current || message.id !== current.id) return;
  clearTimeout(current.timer);
  current = null;
  send(message, transfer);
};

const deliverFonts = (target) => {
  const fonts = chartFonts.map((font) => ({ name: font.name, family: font.family, bytes: font.bytes.slice() }));
  target.postMessage({ type: MESSAGE_TYPES.fonts, fonts }, fonts.map((font) => font.bytes.buffer));
};

const requestFonts = (target) => {
  if (chartFonts) {
    deliverFonts(target);
    return;
  }
  fontWaiters.add(target);
  if (fontWaiters.size === 1) send({ type: MESSAGE_TYPES.fontsRequest });
};

const receiveFonts = (fonts) => {
  chartFonts = (Array.isArray(fonts) ? fonts : [])
    .filter((font) => font && font.bytes instanceof ArrayBuffer && font.bytes.byteLength)
    .slice(0, 12)
    .map((font) => ({ name: String(font.name || ''), family: String(font.family || ''), bytes: new Uint8Array(font.bytes) }));
  for (const target of fontWaiters) if (target === worker) deliverFonts(target);
  fontWaiters.clear();
};

function handleWorkerMessage(source, message) {
  if (source !== worker || String(message.id || '').startsWith('internal:')) return;
  if (message.type === MESSAGE_TYPES.fontsRequest) {
    requestFonts(source);
  } else if (message.type === MESSAGE_TYPES.progress) {
    // The time limit covers the code, not downloading the packages it needs.
    if (message.stage === 'running' && current?.id === message.id && current.kind === MESSAGE_TYPES.run) {
      current.timer = setTimeout(() => timeOut(current.id), current.timeoutMs);
    }
    send(message);
  } else if (message.type === MESSAGE_TYPES.result && FATAL_ERROR.test(message.error || '')) {
    // Pyodide cannot recover from a fatal error (such as running out of
    // memory); the worker is replaced.
    handleCrash(source, message.error);
  } else if (message.type === MESSAGE_TYPES.result || message.type === MESSAGE_TYPES.failure) {
    finish(message, (message.files || []).map((file) => file.bytes.buffer));
  }
}

function timeOut(id) {
  if (current?.id !== id) return;
  stopWorker();
  finish({ type: MESSAGE_TYPES.result, id, error: 'TimeoutError: the code ran longer than the time limit and was stopped.', timedOut: true, restarted: true });
  startWorker().catch(() => {});
}

function handleCrash(source, reason) {
  if (source !== worker) return;
  stopWorker();
  if (current) {
    finish({ type: MESSAGE_TYPES.result, id: current.id, error: `The Python environment crashed${reason ? `: ${reason}` : ''}.`, crashed: true, restarted: true });
  }
  startWorker().catch(() => {});
}

const requireInit = () => {
  if (!settings) throw new Error('The sandbox has not been initialised.');
};

const handlers = {
  async [MESSAGE_TYPES.init](message) {
    settings = { language: typeof message.language === 'string' ? message.language : 'zh-TW' };
    await startWorker();
    send({
      type: MESSAGE_TYPES.ready,
      id: message.id,
      protocol: PROTOCOL_VERSION,
      pyodide: PYODIDE_VERSION,
      // Whether Python is kept offline-ready by the service worker.
      cached: Boolean(navigator.serviceWorker?.controller)
    });
  },
  async [MESSAGE_TYPES.mount](message) {
    requireInit();
    inputFiles = (Array.isArray(message.files) ? message.files : [])
      .filter((file) => file && typeof file.name === 'string' && file.bytes instanceof ArrayBuffer)
      .map((file) => ({ name: file.name, type: String(file.type || ''), bytes: file.bytes }));
    const target = await startWorker();
    current = { id: message.id, kind: MESSAGE_TYPES.mount };
    const payload = { files: copyFiles(inputFiles) };
    target.postMessage({ type: MESSAGE_TYPES.mount, id: message.id, ...payload }, transferOf(payload));
  },
  async [MESSAGE_TYPES.clear](message) {
    requireInit();
    const target = await startWorker();
    current = { id: message.id, kind: MESSAGE_TYPES.clear };
    target.postMessage({ type: MESSAGE_TYPES.clear, id: message.id });
  },
  async [MESSAGE_TYPES.run](message) {
    requireInit();
    const target = await startWorker();
    const timeoutMs = Math.min(Math.max(Number(message.timeoutMs) || LIMITS.runTimeoutMs, 1000), LIMITS.maxRunTimeoutMs);
    current = { id: message.id, kind: MESSAGE_TYPES.run, timeoutMs, timer: null };
    target.postMessage({ type: MESSAGE_TYPES.run, id: message.id, code: String(message.code || '') });
  },
  async [MESSAGE_TYPES.reset](message) {
    requireInit();
    if (current) {
      clearTimeout(current.timer);
      current = null;
    }
    stopWorker();
    await startWorker();
    send({ type: MESSAGE_TYPES.result, id: message.id, restarted: true });
  }
};

if (isAllowedSandboxOrigin(sandboxOrigin) && window.parent !== window) {
  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent || !isAllowedAppOrigin(event.origin, sandboxOrigin)) return;
    // The first app origin to talk to this page is the only one it answers.
    if (appOrigin && event.origin !== appOrigin) return;
    const message = event.data || {};
    if (message.type === MESSAGE_TYPES.fonts) {
      if (appOrigin) receiveFonts(message.fonts);
      return;
    }
    const handler = handlers[message.type];
    if (!handler) return;
    appOrigin = event.origin;
    // One request at a time; the app waits for each reply.
    if (current && message.type !== MESSAGE_TYPES.reset) {
      send({ type: MESSAGE_TYPES.failure, id: message.id, stage: message.type, message: 'The sandbox is busy.' });
      return;
    }
    try {
      await handler(message);
    } catch (error) {
      if (current?.id === message.id) {
        clearTimeout(current.timer);
        current = null;
      }
      send({ type: MESSAGE_TYPES.failure, id: message.id, stage: message.type, message: String(error?.message || error) });
    }
  });
}
