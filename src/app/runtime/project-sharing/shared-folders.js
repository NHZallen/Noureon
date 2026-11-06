// The shared projects of the person, as the page keeps them for the replies (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §6 and §7): a folder of someone else is not in the workspace
// of the person, but a conversation made in it (`sharedProject: { id, ownerId }`) is answered with the instructions of the project, its notes and its sources, and with the memory of the project only,
// as a conversation of a folder of the person's own is. Each project is a folder-shaped record { id, name, instructions, memoryScope: 'project', sources } that lives in the browser (it is read again
// while the project is open and when the page starts). The notes of the memory (one list for all the people of the project) are put after the instructions. The sources come with their text but are not
// kept in the browser (they can be big): they are read again when the page starts. The projects of the person's own that are shared get their notes the same way (`decorate`).

const KEY = 'noureon:shared-project-folders';
const NAME_MAX = 80;
const INSTRUCTIONS_MAX = 8000;
const NOTES_MAX = 300;

/** The instructions and then the notes, as one text for the system instruction. */
export function instructionsWithNotes(instructions, notes) {
  const list = (Array.isArray(notes) ? notes : []).map((note) => String(note?.text || '').trim()).filter(Boolean).slice(0, NOTES_MAX);
  const head = String(instructions || '').slice(0, INSTRUCTIONS_MAX);
  return list.length ? `${head}${head ? '\n\n' : ''}Notes of this project (what its people want remembered, the same for everyone in it):\n${list.map((line) => `- ${line}`).join('\n')}` : head;
}

export const sharedFolderOf = (project = {}) => ({
  id: String(project.id || ''), name: String(project.name || '').slice(0, NAME_MAX), instructions: instructionsWithNotes(project.instructions, project.notes),
  icon: project.icon || 'default', color: project.color || 'gray', memoryScope: 'project', sources: Array.isArray(project.sources) ? project.sources : [], shared: true
});

export function createSharedFolders({ storage = null } = {}) {
  const folders = new Map();
  const ownNotes = new Map();
  const load = () => {
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || '{}');
      for (const item of Array.isArray(saved) ? saved : saved.folders || []) if (item?.id) folders.set(item.id, { ...sharedFolderOf(item), instructions: String(item.instructions || '').slice(0, INSTRUCTIONS_MAX * 2), sources: [] });
      for (const [id, notes] of Object.entries(saved.ownNotes || {})) ownNotes.set(id, notes);
    } catch { /* nothing kept */ }
  };
  const save = () => { try { storage?.setItem(KEY, JSON.stringify({ folders: [...folders.values()].map(({ sources, ...rest }) => rest), ownNotes: Object.fromEntries(ownNotes) })); } catch { /* a full storage: the next reading puts it back */ } };
  load();
  return {
    list: () => [...folders.values()],
    set(project) { const folder = sharedFolderOf(project); if (folder.id) { folders.set(folder.id, folder); save(); } return folder; },
    forget(id) { if (folders.delete(id)) save(); },
    /** The notes of a project of the person's own that is shared (set when the page starts and when they change). */
    setOwnNotes(id, notes) { ownNotes.set(id, (Array.isArray(notes) ? notes : []).map((note) => ({ id: note.id, text: String(note.text || '').slice(0, 500) })).slice(0, NOTES_MAX)); save(); },
    /** A folder of the person's own as the replies see it: with the notes of its project when it is shared. */
    decorate: (folder) => (ownNotes.get(folder?.id)?.length ? { ...folder, instructions: instructionsWithNotes(folder.instructions, ownNotes.get(folder.id)) } : folder)
  };
}
