// The shares of the signed-in person as the page knows them: loaded once the cloud account is on, changed by the dialog and the settings card, and told to the sidebar (the tag "Shared") and the
// delete warning. Nothing here talks to the network; share-controller.js fills it.

export function createShareState() {
  let items = [];
  let loaded = false;
  const listeners = new Set();
  const emit = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* a listener that fails must not stop the others */ } } };
  return {
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    isLoaded: () => loaded,
    all: () => items,
    /** The shares that work (the conversation is still there and the share is not paused), newest first. */
    active: () => items.filter((item) => !item.deleted && !item.suspended && !item.removed),
    activeFor: (conversationId) => items.filter((item) => !item.deleted && !item.suspended && !item.removed && item.conversationId === conversationId),
    replace(next) { items = Array.isArray(next) ? next : []; loaded = true; emit(); },
    upsert(item) { items = [item, ...items.filter((existing) => existing.id !== item.id)]; emit(); },
    remove(id) { items = items.filter((item) => item.id !== id); emit(); },
    clear() { items = []; loaded = false; emit(); }
  };
}
