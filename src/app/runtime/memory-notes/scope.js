// Where the notes of a chat are kept (docs/superpowers/specs/2026-10-31-projects-design.md, §14). A project can keep its notes for itself ("project memory"): the chats of that project then
// read only the notes that carry the project's id (`projectId`), the notes they learn carry it too, and no other chat sees them. Every other chat has the scope '' (the memory of the account),
// which leaves the notes of such projects out. A scope is chosen when the project is made and never changes, so a note never moves between scopes.
// Shared by the page and the server: no window, no document, no browser storage.

export const MEMORY_SCOPES = Object.freeze(['default', 'project']);

/** The scope a note belongs to: the id of the project, or '' for the memory of the account. */
export const noteScopeOf = (note) => (typeof note?.projectId === 'string' ? note.projectId : '');

/** The scope of a folder: its id when it keeps its notes to itself, '' otherwise. */
export const scopeOfFolder = (folder) => (folder && !folder.deletedAt && folder.memoryScope === 'project' && typeof folder.id === 'string' ? folder.id : '');

/**
 * The scope of a conversation: the id of its project when that keeps its notes to itself, '' for every other chat (also a chat whose project is gone or that is temporary).
 * `folders` is the list of folders of the workspace.
 */
export function scopeOfConversation(conversation, folders) {
  if (!conversation?.folderId || conversation.retentionMode === 'ephemeral' || conversation.deletedAt) return '';
  const folder = Array.isArray(folders) ? folders.find((item) => item?.id === conversation.folderId) : null;
  return scopeOfFolder(folder);
}

/** The notes of one scope. */
export const notesInScope = (notes, scopeId = '') => (Array.isArray(notes) ? notes : []).filter((note) => noteScopeOf(note) === scopeId);

/** The scopes the notes are in, the memory of the account ('') first, then each project that has notes (`keep(id)` leaves out the ones to skip). */
export function scopesOfNotes(notes, keep = () => true) {
  const ids = new Set();
  for (const note of Array.isArray(notes) ? notes : []) {
    const id = noteScopeOf(note);
    if (id && keep(id)) ids.add(id);
  }
  return ['', ...ids];
}

/** When the notes of a scope were last tidied (the settings keep one time for the account and one for each project). */
export const consolidatedAtOf = (settings, scopeId = '') => (scopeId ? settings?.consolidatedScopes?.[scopeId] || null : settings?.consolidatedAt || null);

/** The change to the settings that says the notes of a scope were tidied at `at`. */
export const consolidatedPatch = (settings, scopeId, at) => (scopeId ? { consolidatedScopes: { ...(settings?.consolidatedScopes || {}), [scopeId]: at } } : { consolidatedAt: at });

/** `note` as it is kept in the scope: a note with no scope of its own takes the scope given; a note that has one keeps it. */
function tagged(note, scopeId, known) {
  if (!scopeId || known.has(note.id) || typeof note.projectId === 'string') return note;
  return { ...note, projectId: scopeId };
}

/**
 * The memory store as one scope sees it: it reads the notes of that scope only, and what is written is tagged with the scope (the notes that are new) and written into the same store, so
 * nothing outside the scope is read, changed or lost. Everything else (the settings, the cursors of the conversations, the events) is the store's own.
 */
export function scopedView(store, scopeId = '') {
  if (!store) return store;
  const knownIds = () => new Set(store.getNotes().map((note) => note.id));
  const tagAll = (notes) => {
    const known = knownIds();
    return (Array.isArray(notes) ? notes : []).filter((note) => noteScopeOf(note) === scopeId || !known.has(note.id)).map((note) => tagged(note, scopeId, known));
  };
  return {
    ...store,
    scopeId,
    getNotes: () => notesInScope(store.getNotes(), scopeId),
    commitNotes: (next) => store.commitNotes(mergeIntoStore(store.getNotes(), tagAll(next))),
    clearAll: (options = {}) => store.clearAll({ ...options, scopeId }),
    commitWrite: (result, options) => store.commitWrite({ ...result, notes: mergeIntoStore(store.getNotes(), tagAll(result?.notes)) }, options)
  };
}

// The store writes the notes of the list it is given that are new or different (it never takes one away), so the list of a scope is joined with the notes that are outside it.
function mergeIntoStore(all, scoped) {
  const byId = new Map(scoped.map((note) => [note.id, note]));
  const held = new Set(all.map((note) => note.id));
  return [...all.map((note) => byId.get(note.id) || note), ...scoped.filter((note) => !held.has(note.id))];
}
