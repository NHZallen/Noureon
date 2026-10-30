// The notes of a local account when it is linked to a cloud account (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.1): the notes of a local account are kept in the browser
// only. Linking moves the workspace to the cloud account (auth/account-linking.js), and this moves the notes with it: they are copied under the name of the cloud account, and the memory of
// that account takes them up the next time it is opened (notes-memory.js), joined with the notes it has already, then the copy is removed. Nothing is lost if the page is closed in between:
// the copy stays until it was taken up. No `window`: the page gives the storage ({ getItem, setItem, removeItem }, the browser's localStorage).

import { noteFromRow, mergeNotes } from '../memory-notes/records.js';

const LOCAL_KEY = (who) => `noureon.memoryNotes.v1.${who}`;
const CARRY_KEY = (who) => `noureon.memoryNotes.carry.${who}`;

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Copies the notes of the local account `source` for the cloud account `target`. Returns how many rows were copied. Never throws. */
export function carryLocalNotes({ source, target, storage }) {
  try {
    if (!source || !target || source === target || !storage) return 0;
    const saved = storage.getItem(LOCAL_KEY(source));
    const data = parse(saved);
    if (!saved || data?.version !== 1 || !Array.isArray(data.rows) || !data.rows.length) return 0;
    storage.setItem(CARRY_KEY(target), JSON.stringify({ version: 1, rows: data.rows.filter((row) => String(row?.record_key || '').startsWith('note:')) }));
    return data.rows.length;
  } catch {
    return 0;
  }
}

/** The notes waiting for the cloud account named `name`, or []. */
export function carriedNotes({ name, storage, now }) {
  try {
    const data = parse(storage?.getItem(CARRY_KEY(name)));
    return data?.version === 1 && Array.isArray(data.rows) ? data.rows.map((row) => noteFromRow(row, { now })).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function clearCarried({ name, storage }) {
  try {
    storage?.removeItem(CARRY_KEY(name));
  } catch { /* The copy is taken up again next time and joins with itself. */ }
}

/** The notes of the memory joined with the carried ones (a note that is in both is joined as two devices' versions are). */
export function joinCarried(notes, carried) {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const out = [...notes];
  for (const note of carried) {
    const known = byId.get(note.id);
    if (known) out[out.indexOf(known)] = mergeNotes(known, note);
    else out.push(note);
  }
  return out;
}
