// Shared by the sandbox page, its worker and service worker, and the build
// script. The app keeps its own copy of the parts it needs
// (src/app/runtime/sandbox/sandbox-protocol.js); a test keeps them equal.
//
// The sandbox runs model-written Python on a different origin from the app,
// so it never sees the app's keys, conversations or sign-in, and its CSP
// only lets it fetch the pinned Pyodide files.

export const PROTOCOL_VERSION = 1;
export const PYODIDE_VERSION = '314.0.7';
export const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
// Our own wheels are listed in the lock file under this origin, replaced by
// the sandbox's origin when the lock file is loaded.
export const WHEEL_ORIGIN_PLACEHOLDER = 'https://sandbox.invalid';

export const PRODUCTION_SANDBOX_ORIGIN = 'https://run.noureon.com';
export const PRODUCTION_APP_ORIGINS = Object.freeze(['https://noureon.com', 'https://www.noureon.com']);
const LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1']);

export const LIMITS = Object.freeze({
  runTimeoutMs: 60_000,
  maxRunTimeoutMs: 120_000,
  outputFileCount: 10,
  outputFileBytes: 25 * 1024 * 1024,
  outputTotalBytes: 50 * 1024 * 1024,
  inputTotalBytes: 100 * 1024 * 1024,
  // Raw stdout/stderr kept per run; the app trims further for the model.
  capturedTextChars: 1_000_000,
  codeChars: 200_000
});

// Executables, installers, shortcuts and macro-enabled Office files are never
// handed to the user: the same list as the Standard mode's file types
// (src/app/ui/files/file-type-registry.js) except archives, which Python can
// build properly. Scripts stay allowed there as text, so they do here.
export const BLOCKED_OUTPUT_EXTENSIONS = Object.freeze([
  'exe', 'com', 'scr', 'pif', 'cpl', 'msc', 'msi', 'msp', 'mst', 'dll', 'sys', 'drv', 'ocx',
  'lnk', 'url', 'scf', 'inf', 'reg', 'hta', 'jar', 'jnlp', 'gadget', 'application', 'appref-ms',
  'vbe', 'jse', 'wsc', 'wsh', 'ws', 'msh', 'msh1', 'msh2', 'mshxml', 'psc1', 'psd1', 'ps1xml', 'ps2', 'ps2xml',
  'settingcontent-ms', 'library-ms', 'search-ms', 'searchconnector-ms', 'diagcab', 'xll', 'xlam', 'ppam',
  'app', 'apk', 'ipa', 'aab', 'xapk', 'deb', 'rpm', 'dmg', 'pkg', 'mpkg', 'iso', 'img', 'vhd', 'vhdx',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlsb', 'pptm', 'potm', 'ppsm', 'sldm'
].map((extension) => `.${extension}`));

export const MESSAGE_TYPES = Object.freeze({
  // app → sandbox
  init: 'init',
  mount: 'mount',
  run: 'run',
  clear: 'clear',
  reset: 'reset',
  fonts: 'fonts',
  // sandbox → app
  fontsRequest: 'fonts-request',
  ready: 'ready',
  progress: 'progress',
  result: 'result',
  failure: 'failure'
});

const parse = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isLocal = (url) => url?.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname);

// The sandbox page only runs on the sandbox origin: run.noureon.com, or in
// development a local host other than the app's (localhost ↔ 127.0.0.1).
export function isAllowedSandboxOrigin(origin) {
  if (origin === PRODUCTION_SANDBOX_ORIGIN) return true;
  return isLocal(parse(origin));
}

// Which app origins may drive a sandbox on `sandboxOrigin`. Never the
// sandbox's own origin: that would mean the app and the sandbox share storage.
export function isAllowedAppOrigin(origin, sandboxOrigin) {
  if (!origin || origin === sandboxOrigin) return false;
  if (sandboxOrigin === PRODUCTION_SANDBOX_ORIGIN) return PRODUCTION_APP_ORIGINS.includes(origin);
  const app = parse(origin);
  const sandbox = parse(sandboxOrigin);
  return isLocal(app) && isLocal(sandbox) && app.port === sandbox.port && app.hostname !== sandbox.hostname;
}

// What the worker may fetch: the pinned Pyodide files and the sandbox's own
// files. Everything else is refused before the browser's CSP would refuse it
// too.
export function isAllowedFetchUrl(value, sandboxOrigin) {
  const url = parse(value);
  if (!url) return false;
  if (url.href.startsWith(PYODIDE_CDN)) return !url.search && !url.hash;
  return url.origin === sandboxOrigin && url.pathname.startsWith('/sandbox/');
}

export function extensionOf(name) {
  const match = /\.[^./\\]+$/.exec(String(name || ''));
  return match ? match[0].toLowerCase() : '';
}

export function isBlockedOutputName(name) {
  return BLOCKED_OUTPUT_EXTENSIONS.includes(extensionOf(name));
}
