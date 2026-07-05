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
      const snapshot = getAppData();
      await setItem(getAppDataKey(), JSON.stringify(snapshot));
      onSaved(snapshot);
    }
  }

  return {
    saveAppData
  };
}
