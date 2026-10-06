// The split workspace store (workspace-store-v2.js) that this tab uses for the signed-in user, or nothing when the user's workspace is
// still the old single item. The code that loads the workspace sets it; the cloud sync, which builds its own storage adapter, asks for it
// here, so that one tab never has two store objects for the same user (the store orders its own operations and remembers which records
// it could not read).

let active = null;

export function setActiveWorkspaceStore(username, store) {
  active = username && store ? { username, store } : null;
}

export function getActiveWorkspaceStore(username) {
  return active && active.username === username ? active.store : null;
}
