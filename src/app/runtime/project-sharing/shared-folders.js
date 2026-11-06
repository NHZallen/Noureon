// The shared projects of the person, as the page keeps them for the replies (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §6 and §7): a folder of someone else is not in the workspace
// of the person, but a conversation made in it (`sharedProject: { id, ownerId }`) is answered with the instructions of the project and its sources, and with the memory of the project only,
// as a conversation of a folder of the person's own is. Each project is a folder-shaped record { id, name, instructions, memoryScope: 'project', sources } that lives in the browser (it is read again
// while the project is open and when the page starts). The sources come with their text but are not kept in the browser (they can be big): they are read again when the page starts.

const KEY = 'noureon:shared-project-folders';
const NAME_MAX = 80;
const INSTRUCTIONS_MAX = 8000;

export const sharedFolderOf = (project = {}) => ({
  id: String(project.id || ''), name: String(project.name || '').slice(0, NAME_MAX), instructions: String(project.instructions || '').slice(0, INSTRUCTIONS_MAX),
  icon: project.icon || 'default', color: project.color || 'gray', role: String(project.role || ''), memoryScope: 'project', sources: Array.isArray(project.sources) ? project.sources : [], shared: true
});

export function createSharedFolders({ storage = null } = {}) {
  const folders = new Map();
  const owned = new Set();
  const load = () => {
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || '{}');
      for (const item of Array.isArray(saved) ? saved : saved.folders || []) if (item?.id) folders.set(item.id, { ...sharedFolderOf(item), sources: [] });
    } catch { /* nothing kept */ }
  };
  const save = () => { try { storage?.setItem(KEY, JSON.stringify({ folders: [...folders.values()].map(({ sources, ...rest }) => rest) })); } catch { /* a full storage: the next reading puts it back */ } };
  load();
  return {
    list: () => [...folders.values()],
    set(project) { const folder = sharedFolderOf(project); if (folder.id) { folders.set(folder.id, folder); save(); } return folder; },
    /** The role of the person in the project ('owner' | 'editor' | 'chat'), '' when it is not known yet. */
    roleOf: (id) => folders.get(id)?.role || '',
    forget(id) { if (folders.delete(id)) save(); },
    /** The projects of the person's own that are shared (set when the page starts and when one is shared). */
    setOwned(ids) { owned.clear(); for (const id of ids || []) owned.add(String(id)); },
    addOwned: (id) => { owned.add(String(id)); },
    /** Whether the folder is a project of the person's own that is shared (known once the page has read the list of them). */
    isOwned: (id) => owned.has(id)
  };
}
