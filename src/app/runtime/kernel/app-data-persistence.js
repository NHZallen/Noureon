export function createLegacyRuntimeAppDataPersistence({
  getCurrentUser,
  getAppData,
  getAppDataKey,
  setItem,
  onSaved = () => {}
} = {}) {
  async function saveAppData() {
    const currentUser = getCurrentUser();
    if (currentUser) {
      await setItem(getAppDataKey(), JSON.stringify(getAppData()));
      await onSaved();
    }
  }

  return {
    saveAppData
  };
}
