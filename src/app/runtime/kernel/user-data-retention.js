export const STORAGE_OWNER_KEY = 'chat_storageOwnerUser';

export function getStoredUserWorkspaceKeys(username) {
  if (!username) return [];
  return [
    `chatUser_${username}`,
    `chatConfig_v_v8.6_${username}`,
    `chatAppData_v8.6_${username}`,
    `chatSensitiveConfig_v1_${username}`,
    `chatSyncVault_v1_${username}`,
    `chatRecoveryBackup_v1_${username}`
  ];
}

export async function removeStoredUserWorkspace({
  username,
  removeItem,
  storageAdapter
} = {}) {
  if (!username || typeof removeItem !== 'function') return;
  for (const key of getStoredUserWorkspaceKeys(username)) {
    await removeItem(key);
  }
  await storageAdapter?.removeItemsByPrefix?.(`generatedImage:${username}:`);
}

export async function reconcileStoredWorkspaceOwner({
  nextUsername,
  getItem,
  setItem,
  removeItem,
  storageAdapter
} = {}) {
  if (!nextUsername || typeof getItem !== 'function' || typeof setItem !== 'function') return;
  const previousUsername = await getItem(STORAGE_OWNER_KEY);
  if (previousUsername && previousUsername !== nextUsername) {
    await removeStoredUserWorkspace({
      username: previousUsername,
      removeItem,
      storageAdapter
    });
  }
  await setItem(STORAGE_OWNER_KEY, nextUsername);
}
