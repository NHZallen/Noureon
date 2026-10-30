// The notes in and out of a file, for the data export and import of the settings (memory-notes/notes-transfer.js has the rules). Uses the one memory of the page; when it is not loaded
// (the table cannot be read, or nobody is signed in yet) there is nothing to take out and nowhere to put in: the callers carry on without it.

import { buildNotesExport, planNotesImport } from '../memory-notes/notes-transfer.js';
import { getNotesMemory } from './memory-ref.js';

const loadedStore = async () => {
  const store = await getNotesMemory()?.ready();
  return store?.isLoaded() ? store : null;
};

/** The file of the notes as it is now, or null when the memory is not loaded. */
export async function exportNotes({ now = () => new Date().toISOString() } = {}) {
  const store = await loadedStore();
  return store ? buildNotesExport(store.getNotes(), now) : null;
}

/** Puts the notes of a file into the memory (checked as every write is). Resolves { ok, added, skipped, blocked } or { ok: false, code }. */
export async function importNotes({ data, createId = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString() }) {
  const store = await loadedStore();
  if (!store) return { ok: false, code: 'memory_not_loaded' };
  const plan = planNotesImport(store.getNotes(), data, { createId, now });
  if (plan.ok) await store.commitNotes(plan.notes);
  return plan;
}
