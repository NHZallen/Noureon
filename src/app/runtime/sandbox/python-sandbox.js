// Entry point for the app: one Python sandbox per page, created on first
// use. Chart fonts are prepared (sandbox-fonts.js) only when the sandbox
// asks for them, the first time code uses matplotlib.

import { PYTHON_READY_KEY } from './file-mode.js';
import { SandboxError, createSandboxClient } from './sandbox-client.js';
import { browserSupportsSandbox, resolveSandboxOrigin } from './sandbox-protocol.js';

let shared = null;

export function getPythonSandbox({
  document = globalThis.document,
  window = globalThis.window,
  language = 'zh-TW',
  onProgress = () => {}
} = {}) {
  if (!browserSupportsSandbox(window)) {
    throw new SandboxError('This browser cannot run Python.', { stage: 'support', code: 'browser-unsupported' });
  }
  const origin = resolveSandboxOrigin(window.location, import.meta.env?.VITE_SANDBOX_ORIGIN || '');
  if (!origin) {
    throw new SandboxError('No sandbox origin is available here.', { stage: 'origin', code: 'sandbox-load-failed' });
  }
  if (!shared) {
    const listeners = new Set();
    const client = createSandboxClient({
      document,
      window,
      origin,
      language,
      loadFonts: () => import('./sandbox-fonts.js').then((module) => module.prepareChartFonts()),
      onProgress: (message) => listeners.forEach((listener) => listener(message))
    });
    shared = { client, listeners };
    client.prepare().then(() => {
      try {
        window.localStorage?.setItem(PYTHON_READY_KEY, '1');
      } catch {
        // Only the picker's note depends on it.
      }
    }, () => {});
  }
  shared.listeners.clear();
  shared.listeners.add(onProgress);
  return shared.client;
}

export function disposePythonSandbox() {
  shared?.client.dispose();
  shared = null;
}
