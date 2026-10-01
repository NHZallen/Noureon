// The chats whose last message is under its automatic visual check. Such a chat cannot send until the check is done or
// stopped (vision-check-scheduler.js keeps this up to date; the composer reads it in
// settings-update-input-state-helper.js).
export const chatsUnderVisionCheck = new Set();
