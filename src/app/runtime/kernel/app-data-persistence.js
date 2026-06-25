export function createLegacyRuntimeAppDataPersistence({
  getCurrentUser,
  getAppData,
  getAppDataKey,
  setItem
} = {}) {
  async function saveAppData() {
    const currentUser = getCurrentUser();
    if (currentUser) {
      await setItem(getAppDataKey(), JSON.stringify(getAppData()));
    }
  }

  return {
    saveAppData
  };
}
