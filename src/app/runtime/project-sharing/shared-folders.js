// The shared projects of the person, as the page keeps them for the replies (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §7): a folder of someone else is not in the workspace
// of the person, but a conversation made in it (`sharedProject: { id, ownerId }`) is answered with the instructions of the project and with the memory of the project only, as a conversation of a folder
// of the person's own is. Each project is a folder-shaped record { id, name, instructions, memoryScope: 'project', sources: [] } that lives in the browser (it is read again each time the project is opened).

const KEY = 'noureon:shared-project-folders';
const NAME_MAX = 80;
const INSTRUCTIONS_MAX = 8000;

export const sharedFolderOf = (project = {}) => ({
  id: String(project.id || ''), name: String(project.name || '').slice(0, NAME_MAX), instructions: String(project.instructions || '').slice(0, INSTRUCTIONS_MAX),
  icon: project.icon || 'default', color: project.color || 'gray', memoryScope: 'project', sources: [], shared: true
});

export function createSharedFolders({ storage = null } = {}) {
  const folders = new Map();
  const load = () => {
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || '[]');
      for (const item of Array.isArray(saved) ? saved : []) if (item?.id) folders.set(item.id, sharedFolderOf(item));
    } catch { /* nothing kept */ }
  };
  const save = () => { try { storage?.setItem(KEY, JSON.stringify([...folders.values()])); } catch { /* a full storage: the next opening reads it again */ } };
  load();
  return {
    list: () => [...folders.values()],
    set(project) { const folder = sharedFolderOf(project); if (folder.id) { folders.set(folder.id, folder); save(); } return folder; },
    forget(id) { if (folders.delete(id)) save(); }
  };
}
