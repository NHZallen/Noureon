// The memory of notes as one scope sees it, on the server (src/app/runtime/memory-notes/scope.js; docs/superpowers/specs/2026-10-31-projects-design.md, §14). A reply in a chat of a project that
// keeps its notes for itself reads and writes only the notes of that project; every other reply (scope '') leaves those notes out. The notes are read from the table as ever and filtered; what is
// written is tagged with the scope when it is new, so the rest of the table is never touched.

import { noteScopeOf, notesInScope } from '../src/app/runtime/memory-notes/scope.js';

export function scopedMemory(memory, scopeId = '', projectId = '') {
  if (!memory) return memory;
  return {
    ...memory,
    scopeId,
    load: async (...args) => {
      const state = await memory.load(...args);
      return { ...state, notes: notesInScope(state.notes, scopeId) };
    },
    saveWrite: (userId, args) => {
      const known = new Set((args.before?.notes || []).map((note) => note.id));
      const notes = (args.result?.notes || [])
        .filter((note) => noteScopeOf(note) === scopeId || !known.has(note.id))
        .map((note) => (scopeId && !known.has(note.id) && typeof note.projectId !== 'string' ? { ...note, projectId: scopeId } : note));
      return memory.saveWrite(userId, { ...args, result: { ...args.result, notes } });
    },
    history: memory.history ? { ...memory.history, forReply: (options) => memory.history.forReply({ ...options, scopeId, projectId }) } : memory.history
  };
}
