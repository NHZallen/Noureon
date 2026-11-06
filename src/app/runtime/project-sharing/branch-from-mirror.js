// A conversation of someone else in a shared project is read, never written (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §5). The way on is a branch: a conversation of the
// person who reads, made of the messages up to one reply and put in the same project. Files of the other person are in their own storage; they are not carried yet (S3), so a branch has the words.

import { branchConversation } from '../branch/branch-conversation.js';

const FILE_KEYS = ['inlineData', 'fileData', 'sandboxFile', 'generatedImage', 'video_url', 'image_url', 'file'];
const withoutFiles = (message) => ({ ...message, parts: (message.parts || []).filter((part) => part && !FILE_KEYS.some((key) => key in part)) });

/** The new conversation (resolves null when the message is not a reply). `shared` is { id, ownerId }; `defaults` has the model, the provider and the settings of the person who branches. */
export function branchFromMirror({ chat, messageIndex, shared, title, defaults, uuid, now, by = null }) {
  const source = { id: chat.id, title: chat.title, ...defaults, messages: (chat.messages || []).map(withoutFiles) };
  const branch = branchConversation({ conversation: source, messageIndex, title, uuid, now, by: by || chat.authorName });
  if (!branch) return null;
  return { ...branch, folderId: null, astrasId: null, sharedProject: { id: shared.id, ownerId: shared.ownerId } };
}

/** An empty conversation of the person in the shared project. */
export function newSharedConversation({ shared, title = '', defaults, uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  const at = now();
  return {
    id: uuid(), title, messages: [], ...defaults, archived: false, createdAt: at, lastUpdatedAt: at, stateUpdatedAt: at, imageConfig: { aspectRatio: '1:1', resolution: '1K' },
    isRenamed: false, folderId: null, astrasId: null, isWebSearchEnabled: false, pinned: false, isTemporary: false, isNaming: false, deletedAt: null, unsentMessage: '',
    sharedProject: { id: shared.id, ownerId: shared.ownerId }
  };
}
