export function getWorkspaceRecoveryBackupKey(username) {
  return username ? `chatRecoveryBackup_v1_${username}` : null;
}

export async function ensureWorkspaceRecoveryBackup({
  storage,
  username,
  appDataKey,
  now = () => new Date().toISOString()
} = {}) {
  const backupKey = getWorkspaceRecoveryBackupKey(username);
  if (!storage || !backupKey || !appDataKey) return false;
  if (await storage.getItem(backupKey)) return false;

  const appDataJson = await storage.getItem(appDataKey);
  if (!appDataJson) return false;

  await storage.setItem(backupKey, JSON.stringify({
    version: 1,
    createdAt: now(),
    sourceKey: appDataKey,
    appDataJson
  }));
  return true;
}

