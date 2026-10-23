// Starts the chat page in Node, the way the browser does: the page's markup, a browser's globals, a device storage, then `startPage()`.
// A scenario comes in as JSON in BOOT_SCENARIO: { seed: { key: value }, steps: [{ click: id } | { type: [id, text] } | { wait: ms }], read: [id…] }.
// What happened is printed as one line of JSON: the errors and warnings the page logged, the services it provided, the classes of the elements asked for.
import { installBrowserGlobals } from './browser-globals.js';

const scenario = JSON.parse(process.env.BOOT_SCENARIO || '{}');
const { default: appShell } = await import('/src/templates/app-shell.js');
const win = installBrowserGlobals({ html: `<!doctype html><html lang="${scenario.lang || 'en'}"><head></head><body>${appShell}</body></html>` });

const { createRuntimeStorageAdapter } = await import('/src/app/runtime/kernel/storage-adapter.js');
const storage = createRuntimeStorageAdapter();
for (const [key, value] of Object.entries(scenario.seed || {})) await storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));

const logged = [];
const saved = { error: console.error, warn: console.warn };
console.error = (...args) => logged.push(['error', args.map(String).join(' ').slice(0, 300)]);
console.warn = (...args) => logged.push(['warn', args.map(String).join(' ').slice(0, 300)]);
win.addEventListener('error', (event) => logged.push(['uncaught', String(event.message).slice(0, 300)]));
process.on('unhandledRejection', (reason) => logged.push(['unhandled', String(reason?.stack || reason).slice(0, 300)]));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shell = await import('/src/app/runtime/shell/shell.js');
const started = await Promise.race([shell.startPage().then(() => 'started', (error) => `failed: ${error?.message}`), wait(8000).then(() => 'timeout')]);
await wait(300);

const doc = win.document;
const steps = [];
for (const step of scenario.steps || []) {
  if (step.click) {
    const element = doc.getElementById(step.click);
    if (!element) { steps.push(`no element ${step.click}`); continue; }
    element.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  } else if (step.type) {
    const [id, text] = step.type;
    const element = doc.getElementById(id);
    if (!element) { steps.push(`no element ${id}`); continue; }
    element.value = text;
    element.dispatchEvent(new win.Event('input', { bubbles: true }));
  }
  await wait(step.wait ?? 150);
}

const { SERVICES, getService } = await import('/src/app/runtime/services.js');
console.error = saved.error;
console.warn = saved.warn;
const report = {
  started,
  steps,
  logged,
  provided: Object.entries(SERVICES).filter(([, name]) => getService(name)).map(([key]) => key),
  elements: Object.fromEntries((scenario.read || []).map((id) => [id, doc.getElementById(id) ? { className: doc.getElementById(id).className, value: doc.getElementById(id).value ?? null, disabled: doc.getElementById(id).disabled ?? null, children: doc.getElementById(id).children.length, text: (doc.getElementById(id).textContent || '').trim().slice(0, 120) } : null]))
};
console.log(`REPORT ${JSON.stringify(report)}`);
process.exit(0);
