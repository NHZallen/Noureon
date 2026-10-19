// Whether the note of a visual check still offers to check its files again (the 重試 button of the note, vision-retry.js): a check that failed or
// was stopped (server/vision-check.js and ui/files/vision/vision-check.js write the note), as long as nothing later in the conversation checked
// all those files again. The setting of the automatic check is asked by the caller; a reply that is gone is told of on the press.

export function visionRetryOffered(conversation, message) {
  const note = message?.metadata?.visionCheck;
  if (note?.note !== 'failed' && note?.note !== 'stopped') return false;
  const messages = conversation?.messages || [];
  const at = messages.findIndex((entry) => entry.id === message.id);
  const files = note.fileIds || [];
  const checked = new Set(messages.find((entry) => entry.id === note.sourceMessageId)?.metadata?.visionChecked);
  for (const later of messages.slice(at + 1)) {
    const check = later.metadata?.visionCheck;
    // A note written before notes named their files: any later check was its retry.
    if (check && !files.length) return false;
    if (check?.sourceMessageId === note.sourceMessageId) [check.sourceFileId, ...(check.fileIds || [])].forEach((id) => checked.add(id));
  }
  return at >= 0 && !(files.length && files.every((id) => checked.has(id)));
}
