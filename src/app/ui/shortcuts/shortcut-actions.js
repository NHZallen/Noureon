// What a keyboard shortcut does is registered here by the part that can do it (the rail registers the side panel and the settings, the dictation the voice input, start-shortcuts.js the rest), so the
// list of shortcuts (shortcut-registry.js) and the key handling (shortcut-dispatcher.js) need not know any part, and a part can register before or after the dispatcher starts. A handler returns
// `false` when it could not do it (nothing to press, a window is in the way): the key is then left to the page.

const handlers = new Map();

/** Registers what the shortcut `id` does. Returns a function that takes it back (only if it is still the same handler). */
export function registerShortcutAction(id, handler) {
  if (typeof handler !== 'function') return () => {};
  handlers.set(id, handler);
  return () => { if (handlers.get(id) === handler) handlers.delete(id); };
}

export const hasShortcutAction = (id) => handlers.has(id);

/** Runs it. Returns false when there is none or it did nothing. */
export function runShortcutAction(id, context) {
  const handler = handlers.get(id);
  if (!handler) return false;
  return handler(context) !== false;
}
