// The chats whose last message is under its automatic visual check. Such a chat cannot send until the check is done or
// stopped (vision-check-scheduler.js keeps this up to date for the checks this page makes, and server-reply/server-vision.js for the
// checks the server makes; the composer reads it in settings-update-input-state-helper.js).
export const chatsUnderVisionCheck = new Set();

const bySource = new Map();

/** Tells which chats a source of checks (this page, the server) has one running in; the lock is all of them together. */
export function setVisionLocked(source, conversationIds) {
  bySource.set(source, new Set(conversationIds));
  chatsUnderVisionCheck.clear();
  for (const ids of bySource.values()) ids.forEach((id) => chatsUnderVisionCheck.add(id));
}
