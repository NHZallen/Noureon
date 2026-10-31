// The instructions of a project (a folder of the workspace, docs/superpowers/specs/2026-10-31-projects-design.md): every conversation in the project carries them. The reply puts them
// together with the rest of its system instruction (reply/stream-api-call.js), after the Noura, the learning mode and the memory, so inside the project they are the last word.

export const PROJECT_INSTRUCTIONS_MAX = 4000;

let readFolders = () => [];

/** The page tells where the folders are (one line in the shell). */
export function setProjectFoldersReader(reader) {
  readFolders = typeof reader === 'function' ? reader : () => [];
}

const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The project a conversation is in, or null: not for a temporary chat, a deleted conversation or a project that is gone. */
export function projectOf(conversation) {
  if (!conversation?.folderId || conversation.retentionMode === 'ephemeral' || conversation.deletedAt) return null;
  const folders = readFolders();
  const folder = Array.isArray(folders) ? folders.find((item) => item?.id === conversation.folderId && !item.deletedAt) : null;
  return folder || null;
}

/** The text added to the system instruction of a reply in a conversation of a project ('' when there is nothing to add). */
export function projectInstructionTextFor(conversation) {
  const folder = projectOf(conversation);
  const text = String(folder?.instructions || '').trim().slice(0, PROJECT_INSTRUCTIONS_MAX);
  if (!text) return '';
  const name = oneLine(folder.name, 80);
  return `Project instructions${name ? ` (this chat is in the project "${name}")` : ''}. Follow them in every reply of this chat; where they conflict with the general instructions above, these win:\n\n${text}`;
}
