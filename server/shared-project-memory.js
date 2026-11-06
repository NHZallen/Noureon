// The memory of a shared project on the server (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §7 and §18.5): a reply of a person in a shared project reads and writes the notes of the
// project, which are the project notes of its OWNER (the rows of the owner that carry the id of the project); what belongs to the person who writes (the settings, how far the conversation was read,
// the events) stays in the person's own rows. Only the owner and the editors may write: the server asks the database for the role (`server_project_memory_access`), never the page.
// It is used under `scopedMemory(…, projectId)`, which leaves every note that is not of the project out and tags what is new, so the owner's other notes are never reached.

import { noteKey } from '../src/app/runtime/memory-notes/records.js';
import { noteScopeOf } from '../src/app/runtime/memory-notes/scope.js';

/** `memory` is createMemoryRecords(...). */
export function sharedProjectMemory(memory, { ownerId, projectId }) {
  return {
    ...memory,
    load: async (userId, options) => {
      const [mine, project] = await Promise.all([memory.load(userId, options), memory.load(ownerId, options)]);
      const notes = project.notes.filter((note) => noteScopeOf(note) === projectId);
      const versions = new Map(mine.versions);
      for (const note of notes) versions.set(noteKey(note.id), project.versions.get(noteKey(note.id)));
      return { ...mine, notes, versions };
    },
    saveWrite: async (userId, { before, result, conversationId = '' }) => {
      const written = await memory.saveWrite(ownerId, { before: { notes: before.notes, versions: before.versions, cursor: before.cursor }, result: { notes: result.notes || [] }, conversationId: '' });
      const rest = { events: result.events, opId: result.opId, ...(result.event ? { event: result.event } : {}), notes: [] };
      return written + (await memory.saveWrite(userId, { before: { notes: [], versions: before.versions, cursor: before.cursor }, result: rest, conversationId }));
    },
    // The notes a reply looked up count as used in the owner's rows (when and how often); that is all a reader changes there.
    markUsed: (userId, ids) => memory.markUsed(ownerId, ids),
    history: memory.history ? { ...memory.history, forReply: (options) => memory.history.forReply({ ...options, sharedProject: projectId }) } : memory.history
  };
}
