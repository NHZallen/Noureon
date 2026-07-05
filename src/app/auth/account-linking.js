import {
  STORAGE_OWNER_KEY,
  getStoredUserWorkspaceKeys,
  removeStoredUserWorkspace
} from '../runtime/kernel/user-data-retention.js';

export const PENDING_CLOUD_LINK_KEY = 'chat_pendingCloudLink_v1';

export async function markPendingCloudAccountLink(storage, localUser) {
  if (!localUser?.username || localUser.authProvider === 'supabase') {
    throw new TypeError('A local user is required before linking a cloud account.');
  }
  await storage.setItem(PENDING_CLOUD_LINK_KEY, JSON.stringify({
    username: localUser.username,
    createdAt: new Date().toISOString()
  }));
}

export async function clearPendingCloudAccountLink(storage) {
  await storage.removeItem(PENDING_CLOUD_LINK_KEY);
}

export async function completePendingCloudAccountLink({
  storage,
  cloudUserRecord
} = {}) {
  const savedPending = await storage.getItem(PENDING_CLOUD_LINK_KEY);
  if (!savedPending || !cloudUserRecord?.username) return false;

  const pending = JSON.parse(savedPending);
  const sourceUsername = pending?.username;
  const targetUsername = cloudUserRecord.username;
  if (!sourceUsername || sourceUsername === targetUsername) {
    await clearPendingCloudAccountLink(storage);
    return false;
  }

  const sourceKeys = getStoredUserWorkspaceKeys(sourceUsername);
  const targetKeys = getStoredUserWorkspaceKeys(targetUsername);
  for (let index = 1; index < sourceKeys.length; index += 1) {
    const value = await storage.getItem(sourceKeys[index]);
    if (value != null) await storage.setItem(targetKeys[index], value);
  }

  const imagePrefix = `generatedImage:${sourceUsername}:`;
  const imageKeys = await storage.getKeys?.() || [];
  for (const sourceKey of imageKeys.filter(key => String(key).startsWith(imagePrefix))) {
    const image = await storage.getItem(sourceKey);
    const targetKey = `generatedImage:${targetUsername}:${String(sourceKey).slice(imagePrefix.length)}`;
    if (image != null) await storage.setItem(targetKey, image);
  }

  await storage.setItem(`chatUser_${targetUsername}`, JSON.stringify(cloudUserRecord));
  await removeStoredUserWorkspace({
    username: sourceUsername,
    removeItem: (...args) => storage.removeItem(...args),
    storageAdapter: storage
  });
  await storage.setItem(STORAGE_OWNER_KEY, targetUsername);
  await storage.setItem('chat_lastUser', targetUsername);
  await clearPendingCloudAccountLink(storage);
  return true;
}
