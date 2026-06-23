import { Window } from 'happy-dom';

const GLOBAL_KEYS = [
  'window',
  'document',
  'HTMLElement',
  'CustomEvent',
  'Event',
  'MouseEvent',
  'Node'
];

export const createDom = (html = '') => {
  const previousDescriptors = new Map(
    GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  const window = new Window({ url: 'http://localhost/' });
  window.document.body.innerHTML = html;

  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: window },
    document: { configurable: true, writable: true, value: window.document },
    HTMLElement: { configurable: true, writable: true, value: window.HTMLElement },
    CustomEvent: { configurable: true, writable: true, value: window.CustomEvent },
    Event: { configurable: true, writable: true, value: window.Event },
    MouseEvent: { configurable: true, writable: true, value: window.MouseEvent },
    Node: { configurable: true, writable: true, value: window.Node }
  });

  const cleanup = () => {
    window.close();
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  };

  return { window, document: window.document, cleanup };
};
