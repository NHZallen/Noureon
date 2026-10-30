// The one memory of notes of the page, as a reference (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §8 P3): made by start-notes-memory.js after the page has loaded, asked for by the
// code that makes a request. A tiny module on its own so that asking for it does not load the memory itself. No `window`, no `document`.

let shared = null;

export const getNotesMemory = () => shared;
export const setNotesMemory = (memory) => { shared = memory; return shared; };
