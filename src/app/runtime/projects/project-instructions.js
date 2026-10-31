// The instructions of a project (a folder of the workspace, docs/superpowers/specs/2026-10-31-projects-design.md): every conversation in the project carries them. The reply puts them
// together with the rest of its system instruction (reply/stream-api-call.js), after the Noura, the learning mode and the memory, so inside the project they are the last word.

import { scopeOfConversation } from '../memory-notes/scope.js';
import { projectSourcesFor } from './project-source-prompt.js';

export const PROJECT_INSTRUCTIONS_MAX = 8000;

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

/** The text added to the system instruction of a reply in a conversation of a project: its instructions, then its sources ('' when there is nothing to add). */
export function projectInstructionTextFor(conversation) {
  const folder = projectOf(conversation);
  const text = String(folder?.instructions || '').trim().slice(0, PROJECT_INSTRUCTIONS_MAX);
  const name = oneLine(folder?.name, 80);
  const instructions = text ? `Project instructions${name ? ` (this chat is in the project "${name}")` : ''}. Follow them in every reply of this chat; where they conflict with the general instructions above, these win:\n\n${text}` : '';
  // The sources of the project come after the instructions, in the same place of the system instruction.
  return [instructions, folder ? projectSourcesFor(folder).text : ''].filter(Boolean).join('\n\n');
}

/** The scope of the notes of a conversation: the id of its project when that keeps its notes for itself, '' for every other chat (memory-notes/scope.js). */
export const memoryScopeOf = (conversation) => scopeOfConversation(conversation, readFolders());

/** Tells which scope each conversation id has, for the searches over the past conversations: a function from the id of a conversation to its scope. */
export function conversationScopeReader(getConversations) {
  return (conversationId) => {
    const conversation = (getConversations() || []).find((entry) => entry?.id === conversationId);
    return conversation ? memoryScopeOf(conversation) : '';
  };
}

/** The name of a project that keeps its notes for itself, by its id; '' when there is no such project any more (its notes are then not shown). */
export function memoryProjectName(projectId) {
  const folders = readFolders();
  const folder = Array.isArray(folders) ? folders.find((item) => item?.id === projectId && !item.deletedAt && item.memoryScope === 'project') : null;
  return folder ? oneLine(folder.name, 80) : '';
}
