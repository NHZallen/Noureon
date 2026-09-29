// Runs Pyodide for the sandbox page (host.js). Before anything else it cuts
// the worker off from the network: fetch only reaches the pinned Pyodide
// files and the sandbox's own files, and the other ways out are removed.
// Python's `js` module only sees timers and a few constructors. The CSP of
// the sandbox origin blocks the same things again.

import { LIMITS, MESSAGE_TYPES, PYODIDE_CDN, WHEEL_ORIGIN_PLACEHOLDER, isAllowedFetchUrl } from './protocol.js';
import { FOLDERS, clearFolders, collectOutput, configureChartFonts, mountInputFiles, prepareFolders, runCode, snapshotOutput } from './runtime.js';

const scope = globalThis;
const origin = scope.location.origin;
const nativeFetch = scope.fetch.bind(scope);
const post = scope.postMessage.bind(scope);

let downloadedBytes = 0;
const reportDownload = (bytes) => {
  downloadedBytes += bytes;
  post({ type: MESSAGE_TYPES.progress, stage: 'download', bytes: downloadedBytes });
};

// Counts bytes as a response is read, so the app can show download progress.
const tracked = (response) => {
  if (!response.body || response.headers.get('x-sandbox-cache') === 'hit') return response;
  const reader = response.body.getReader();
  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else {
        reportDownload(value.byteLength);
        controller.enqueue(value);
      }
    },
    cancel: (reason) => reader.cancel(reason)
  });
  return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
};

const guardedFetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input?.url ?? String(input), scope.location.href).href;
  if (!isAllowedFetchUrl(url, origin)) return Promise.reject(new TypeError('Network access is disabled in the sandbox.'));
  return nativeFetch(input, init).then(tracked);
};

// Removes a global from the worker and every prototype that defines it, then
// pins the replacement so it cannot be put back.
const replaceGlobal = (name, value) => {
  for (let object = scope; object; object = Object.getPrototypeOf(object)) {
    if (Object.prototype.hasOwnProperty.call(object, name)) {
      try {
        delete object[name];
      } catch {
        // Not deletable; the pinned own property below shadows it.
      }
    }
  }
  Object.defineProperty(scope, name, { value, writable: false, configurable: false, enumerable: false });
};

replaceGlobal('fetch', guardedFetch);
for (const name of [
  'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'BroadcastChannel',
  'Worker', 'SharedWorker', 'importScripts', 'indexedDB', 'caches', 'RTCPeerConnection'
]) {
  replaceGlobal(name, undefined);
}

// What Python's `js` module sees. Pyodide itself only needs the timers (for
// asyncio) and these constructors (for conversions).
const jsglobals = Object.freeze({
  setTimeout: scope.setTimeout.bind(scope),
  clearTimeout: scope.clearTimeout.bind(scope),
  setInterval: scope.setInterval.bind(scope),
  clearInterval: scope.clearInterval.bind(scope),
  Object, Array, Map, Set, Date, Promise, WeakRef, Uint8Array, ArrayBuffer, JSON, Math
});

let pyodidePromise = null;
let globals = null;
let settings = { language: 'zh-TW' };
let fontsWaiter = null;
const FONTS_TIMEOUT_MS = 30_000;

const loadLockFile = async () => {
  const response = await guardedFetch(new URL('./pyodide/pyodide-lock.json', import.meta.url).href);
  if (!response.ok) throw new Error(`The package list could not be loaded (${response.status}).`);
  return (await response.text()).replaceAll(WHEEL_ORIGIN_PLACEHOLDER, origin);
};

const ensurePyodide = () => {
  pyodidePromise ||= (async () => {
    post({ type: MESSAGE_TYPES.progress, stage: 'runtime' });
    const { loadPyodide } = await import('./pyodide/pyodide.mjs');
    const pyodide = await loadPyodide({
      indexURL: PYODIDE_CDN,
      packageBaseUrl: PYODIDE_CDN,
      lockFileContents: loadLockFile(),
      jsglobals,
      env: { HOME: FOLDERS.work, MPLBACKEND: 'Agg' },
      stdout: () => {},
      stderr: () => {}
    });
    prepareFolders(pyodide);
    globals = pyodide.globals.get('dict')();
    globals.set('__name__', '__main__');
    return pyodide;
  })();
  return pyodidePromise;
};

// Fonts come from the app (through the page) the first time code uses a
// package that draws text itself; without them charts use matplotlib's own
// fonts and PDFs cannot show Chinese.
const FONT_USERS = Object.freeze(['matplotlib', 'reportlab', 'fpdf2']);

const requestFonts = () => new Promise((resolve) => {
  const timer = setTimeout(() => resolve([]), FONTS_TIMEOUT_MS);
  fontsWaiter = (fonts) => {
    clearTimeout(timer);
    fontsWaiter = null;
    resolve(fonts);
  };
  post({ type: MESSAGE_TYPES.fontsRequest });
});

let chartFontNames = null;
let chartsConfigured = false;

const loadFonts = async (pyodide) => {
  if (!chartFontNames && FONT_USERS.some((name) => pyodide.loadedPackages[name])) {
    chartFontNames = [];
    const fonts = await requestFonts();
    fonts.slice(0, 12).forEach((font, index) => {
      if (!(font?.bytes instanceof Uint8Array) || !font.bytes.byteLength) return;
      // The names the model is told (NotoSansTC-Bold.ttf …).
      const name = /^[\w-]{1,60}\.ttf$/.test(String(font.name || '')) ? font.name : `font-${index}.ttf`;
      pyodide.FS.writeFile(`${FOLDERS.fonts}/${name}`, font.bytes);
      chartFontNames.push(name);
    });
  }
  if (!chartsConfigured && chartFontNames && pyodide.loadedPackages.matplotlib) {
    chartsConfigured = true;
    try {
      configureChartFonts(pyodide, chartFontNames, settings.language);
    } catch {
      // Charts fall back to matplotlib's own fonts.
    }
  }
};

const describeError = (error) => String(error?.message || error || 'Unknown error').slice(0, 2000);

const handlers = {
  async [MESSAGE_TYPES.init](message) {
    settings = { language: typeof message.language === 'string' ? message.language : 'zh-TW' };
    await ensurePyodide();
    post({ type: MESSAGE_TYPES.ready, downloadedBytes });
  },
  async [MESSAGE_TYPES.fonts](message) {
    fontsWaiter?.(Array.isArray(message.fonts) ? message.fonts : []);
  },
  async [MESSAGE_TYPES.clear](message) {
    const pyodide = await ensurePyodide();
    clearFolders(pyodide);
    globals.destroy?.();
    globals = pyodide.globals.get('dict')();
    globals.set('__name__', '__main__');
    post({ type: MESSAGE_TYPES.result, id: message.id, cleared: true });
  },
  async [MESSAGE_TYPES.mount](message) {
    const pyodide = await ensurePyodide();
    const result = mountInputFiles(pyodide, Array.isArray(message.files) ? message.files : []);
    post({ type: MESSAGE_TYPES.result, id: message.id, mounted: result.mounted, skippedInputs: result.skipped });
  },
  async [MESSAGE_TYPES.run](message) {
    const code = String(message.code || '');
    if (code.length > LIMITS.codeChars) {
      post({ type: MESSAGE_TYPES.result, id: message.id, error: `The code is longer than ${LIMITS.codeChars} characters.` });
      return;
    }
    const pyodide = await ensurePyodide();
    post({ type: MESSAGE_TYPES.progress, id: message.id, stage: 'packages' });
    let packageError = null;
    await pyodide.loadPackagesFromImports(code, {
      messageCallback: () => {},
      errorCallback: (text) => { packageError = String(text); }
    }).catch((error) => { packageError = describeError(error); });
    await loadFonts(pyodide);
    post({ type: MESSAGE_TYPES.progress, id: message.id, stage: 'running' });
    const before = snapshotOutput(pyodide);
    // What the code prints is sent on while it runs, at most ten times a second.
    const pending = { stdout: '', stderr: '' };
    let lastSent = 0;
    const sendOutput = () => {
      for (const stream of ['stdout', 'stderr']) {
        if (pending[stream]) post({ type: MESSAGE_TYPES.progress, id: message.id, stage: 'output', stream, text: pending[stream] });
        pending[stream] = '';
      }
      lastSent = Date.now();
    };
    const run = await runCode(pyodide, code, globals, {
      onOutput: (stream, text) => {
        pending[stream] += text;
        if (Date.now() - lastSent >= 100) sendOutput();
      }
    });
    sendOutput();
    const output = collectOutput(pyodide, before);
    const transfer = output.files.map((file) => file.bytes.buffer);
    post({
      type: MESSAGE_TYPES.result,
      id: message.id,
      stdout: run.stdout,
      stderr: run.stderr,
      error: run.error,
      packageError,
      elapsedMs: run.elapsedMs,
      files: output.files,
      skippedFiles: output.skipped
    }, transfer);
  }
};

scope.addEventListener('message', async (event) => {
  const message = event.data || {};
  const handler = handlers[message.type];
  if (!handler) return;
  try {
    await handler(message);
  } catch (error) {
    post({ type: MESSAGE_TYPES.failure, id: message.id, stage: message.type, message: describeError(error) });
  }
});
