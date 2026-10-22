// The globals of a browser page, from happy-dom, plus the storage a browser has and happy-dom does not.
import { Window } from 'happy-dom';
import { createFakeIndexedDB } from './fake-indexeddb.js';

export function installBrowserGlobals({ html = '<!doctype html><html lang="en"><head></head><body></body></html>', url = 'https://noureon.test/' } = {}) {
  const happy = new Window({ url });
  happy.document.write(html);
  happy.indexedDB = createFakeIndexedDB();
  // Everything the browser has that Node does not (the elements' classes, Image, the observers…), and the few the page reads from window that Node has its own of.
  const own = ['Event', 'CustomEvent', 'EventTarget', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'indexedDB'];
  const names = new Set([...own, ...Object.getOwnPropertyNames(happy).filter((name) => !(name in globalThis))]);
  for (const name of names) {
    if (happy[name] === undefined) continue;
    try { Object.defineProperty(globalThis, name, { value: happy[name], configurable: true, writable: true }); } catch { /* a global that cannot be replaced stays */ }
  }
  Object.defineProperty(globalThis, 'window', { value: happy, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'self', { value: happy, configurable: true, writable: true });
  return happy;
}
