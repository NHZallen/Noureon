// "Copy to my conversations" of a share that can be continued (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §6): the page reads the snapshot (the same database function the
// viewer uses), brings the files back from the public bucket and makes a new conversation of it in the person's own workspace, with the mark that it came from a share. Their own keys and model
// continue it; nothing of the sharer's conversation is touched. When the person's cloud space cannot hold the files, only the text is copied.

import { hydrateSharedSnapshot } from '../../share-page/share-assets.js';

const FILE_KEYS = ['inlineData', 'fileData', 'sandboxFile', 'generatedImage', 'video_url', 'image_url', 'file'];
const MARKER = '__astraSharedAsset';

/** The bytes the files of a snapshot take (the sizes the server wrote beside each marker). */
export function snapshotFileBytes(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + snapshotFileBytes(item), 0);
  if (!value || typeof value !== 'object') return 0;
  if (value[MARKER]) return Number(value[MARKER].size) || 0;
  return Object.values(value).reduce((sum, item) => sum + snapshotFileBytes(item), 0);
}

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

// A picture a model drew was kept by the sharer's page under its own key; here it becomes a picture attached to the message.
async function pictureAsAttachment(part, fetchImpl) {
  const image = part.generatedImage;
  const url = image?.cloudAsset?.url;
  if (!url) return null;
  try {
    const response = await fetchImpl(url, { referrerPolicy: 'no-referrer' });
    if (!response.ok) return null;
    const mimeType = image.mediaType || image.cloudAsset.mimeType || 'image/png';
    return { inlineData: { mimeType, name: `${String(image.title || 'image').slice(0, 60)}.${mimeType.split('/')[1]?.split('+')[0] || 'png'}`, data: bytesToBase64(new Uint8Array(await response.arrayBuffer())) } };
  } catch {
    return null;
  }
}

/**
 * Makes the new conversation of a share: resolves { ok: true, conversation, textOnly } or { ok: false, code: 'gone' | 'failed' }.
 * `read(code)` gives the share as `get_shared_conversation` does; `quota()` gives { usedBytes, quotaBytes } (usedBytes null when unknown); `defaults` has the model for the new conversation.
 */
export async function importSharedConversation({ code, read, quota = async () => null, fetchImpl, baseUrl, defaults, uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  let share;
  try { share = await read(code); } catch { return { ok: false, code: 'failed' }; }
  // A share that is only to be read cannot be continued, whatever the link says.
  if (!share?.snapshot || share.mode !== 'continue') return { ok: false, code: 'gone' };
  const messages = Array.isArray(share.snapshot.messages) ? share.snapshot.messages : [];
  let textOnly = false;
  const filesBytes = snapshotFileBytes(messages);
  if (filesBytes > 0) {
    try {
      const space = await quota();
      textOnly = Boolean(space && space.usedBytes !== null && space.usedBytes + filesBytes > space.quotaBytes);
    } catch { textOnly = false; }
  }
  let parts;
  let missing = 0;
  if (textOnly) {
    parts = messages.map((message) => (message.parts || []).filter((part) => part && !FILE_KEYS.some((key) => key in part)));
  } else {
    const hydrated = await hydrateSharedSnapshot({ messages }, { baseUrl, fetchImpl });
    missing = hydrated.missing;
    parts = [];
    for (const message of hydrated.snapshot.messages) {
      const kept = [];
      for (const part of message.parts || []) {
        if (part?.generatedImage) { const picture = await pictureAsAttachment(part, fetchImpl); if (picture) kept.push(picture); else missing += 1; } else kept.push(part);
      }
      parts.push(kept);
    }
  }
  const at = now();
  const conversation = {
    id: uuid(),
    title: String(share.snapshot.title || share.title || '').slice(0, 200) || 'Shared conversation',
    messages: messages.map((message, index) => ({ id: uuid(), role: message.role === 'user' ? 'user' : 'model', parts: parts[index], createdAt: message.createdAt || at, status: 'complete' })).filter((message) => message.parts.length > 0),
    model: defaults.model,
    provider: defaults.provider,
    archived: false,
    createdAt: at,
    lastUpdatedAt: at,
    stateUpdatedAt: at,
    genConfig: defaults.genConfig,
    imageConfig: { aspectRatio: '1:1', resolution: '1K' },
    council: defaults.council,
    isRenamed: true,
    folderId: null,
    astrasId: null,
    isWebSearchEnabled: false,
    pinned: false,
    isTemporary: false,
    isNaming: false,
    deletedAt: null,
    unsentMessage: '',
    // For good: the tag "From a share" is drawn from it (share-ref.js), and it travels with the conversation to the other devices.
    sharedFrom: { at, name: String(share.ownerName || '').slice(0, 100) }
  };
  return { ok: true, conversation, textOnly: textOnly || missing > 0 };
}
