export function getFolderUiStateStorageKey(username) {
  return username ? `chatFolderUiState_v1_${username}` : null;
}

export function createFolderUiStatePersistence({
  getUsername,
  getItem,
  setItem
} = {}) {
  const getKey = () => getFolderUiStateStorageKey(getUsername?.());

  return {
    async save(folders = []) {
      const key = getKey();
      if (!key || typeof setItem !== 'function') return false;
      const state = Object.fromEntries(
        folders
          .filter(folder => folder?.id)
          .map(folder => [folder.id, Boolean(folder.isOpen)])
      );
      await setItem(key, JSON.stringify(state));
      return true;
    },

    async restore(folders = []) {
      const key = getKey();
      if (!key || typeof getItem !== 'function') return folders;
      const saved = await getItem(key);
      if (!saved) return folders;
      let state;
      try {
        state = JSON.parse(saved);
      } catch {
        return folders;
      }
      for (const folder of folders) {
        if (folder?.id && Object.prototype.hasOwnProperty.call(state, folder.id)) {
          folder.isOpen = Boolean(state[folder.id]);
        }
      }
      return folders;
    }
  };
}

