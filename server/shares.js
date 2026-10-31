// Sharing a conversation (docs/superpowers/specs/2026-10-31-conversation-share-design.md). The server makes the snapshot: it reads the person's conversation through the database (never the
// workspace tables directly), takes the memory out, copies the files the conversation holds to the public bucket of the share, and keeps the snapshot in `conversation_shares`.
// Whoever has the code reads it through the database function `get_shared_conversation`, which the page of the share calls itself (no sign-in, nothing of this server).

import { randomBytes, randomUUID } from 'node:crypto';
import { formatSandboxRunBlock, liftSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { MODELS } from '../src/app/runtime/shell/model-registry.js';

export const SHARE_LIMITS = Object.freeze({ shares: 30, snapshotBytes: 5 * 1024 * 1024, assetBytes: 100 * 1024 * 1024, messages: 2000 });
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CLOUD_MARKER = '__astraCloudAsset';
const SHARED_MARKER = '__astraSharedAsset';
const SWEEP_EVERY_MS = 2 * 60 * 1000;

export class ShareError extends Error {
  /** `code`: 'not_found', 'limit', 'too_large', 'not_active', 'storage', 'database'. */
  constructor(message, code, extra = {}) {
    super(message);
    this.name = 'ShareError';
    this.code = code;
    this.extra = extra;
  }
}

/** A code nobody can guess: 32 letters and digits from the system's random numbers (about 190 bits). */
export function newShareCode(random = randomBytes) {
  const out = [];
  while (out.length < 32) for (const byte of random(48)) if (byte < 248 && out.length < 32) out.push(ALPHABET[byte % 62]);
  return out.join('');
}

/** The text of a reply, with the record of what the model did (the block at its start) without the steps of the memory. Any other text is as it is. */
export function textForShare(text, role) {
  if (role !== 'model' || typeof text !== 'string') return text;
  const { run, text: rest } = liftSandboxRunBlock(text);
  if (!run) return text;
  const tools = (run.tools || []).filter((tool) => tool.kind !== 'memory');
  const { tools: ignored, ...others } = run;
  return `${formatSandboxRunBlock({ ...others, ...(tools.length ? { tools } : {}) })}${rest}`;
}

export function createShares({ db, store, log = () => {}, now = Date.now, limits = SHARE_LIMITS, setRepeat = setInterval, clearRepeat = clearInterval } = {}) {
  let repeat = null;

  /**
   * Walks a part of a message: a file the person kept (a marker with a path in their folder) is copied to the share's folder and the marker names it there; the bytes of a file that was never
   * moved to the person's folder (a base64 string where a file goes) are kept there too. `ctx` counts the bytes and remembers what was copied.
   */
  async function rewrite(value, ctx, key = '') {
    if (Array.isArray(value)) {
      const out = [];
      for (const item of value) out.push(await rewrite(item, ctx));
      return out;
    }
    if (!value || typeof value !== 'object') {
      // Where a file's data goes: the bytes as base64 (an attachment or a sandbox file whose data was not moved to the cloud).
      if (typeof value === 'string' && key === 'data' && ctx.inFile && value.length > 0) return keepBase64(value, ctx);
      return value;
    }
    if (value[CLOUD_MARKER]) {
      const marker = value[CLOUD_MARKER];
      const hash = String(marker.path || '').split('/')[1] || '';
      if (!/^[0-9a-f]{64}$/.test(hash) || !String(marker.path).startsWith(`${ctx.userId}/`)) return { [SHARED_MARKER]: { missing: true } };
      let entry = ctx.copied.get(hash);
      if (!entry) {
        let info;
        try {
          info = await store.copyUserFile({ userId: ctx.userId, shareId: ctx.shareId, hash });
        } catch (error) {
          throw new ShareError('A file could not be copied.', 'storage', { status: error?.status || 0 });
        }
        entry = info ? { size: info.size, mimeType: marker.mimeType || info.mimeType } : { missing: true };
        ctx.copied.set(hash, entry);
        if (info) ctx.bytes += info.size;
        if (ctx.bytes > limits.assetBytes) throw new ShareError('The files are too large to share.', 'too_large', { what: 'files' });
      }
      return entry.missing ? { [SHARED_MARKER]: { missing: true } } : { [SHARED_MARKER]: { path: `${ctx.shareId}/${hash}`, mimeType: entry.mimeType, encoding: marker.encoding || 'base64', size: entry.size } };
    }
    const out = {};
    for (const [name, inner] of Object.entries(value)) {
      const inFile = ctx.inFile || name === 'inlineData' || name === 'sandboxFile';
      const before = ctx.inFile;
      ctx.inFile = inFile;
      out[name] = await rewrite(inner, ctx, name);
      ctx.inFile = before;
    }
    return out;
  }

  async function keepBase64(value, ctx) {
    let bytes;
    try {
      bytes = Buffer.from(value, 'base64');
    } catch {
      return value;
    }
    if (!bytes.byteLength) return value;
    ctx.bytes += bytes.byteLength;
    if (ctx.bytes > limits.assetBytes) throw new ShareError('The files are too large to share.', 'too_large', { what: 'files' });
    let saved;
    try {
      saved = await store.putBytes({ shareId: ctx.shareId, bytes, mimeType: ctx.mimeType || 'application/octet-stream' });
    } catch (error) {
      throw new ShareError('A file could not be kept.', 'storage', { status: error?.status || 0 });
    }
    ctx.copied.set(saved.hash, { size: saved.size });
    return { [SHARED_MARKER]: { path: `${ctx.shareId}/${saved.hash}`, mimeType: ctx.mimeType || 'application/octet-stream', encoding: 'base64', size: saved.size } };
  }

  /** The snapshot of a conversation as read from the database (`read`): { snapshot, assets: [file names in the share's folder], bytes }. */
  async function buildSnapshot({ read, userId, shareId }) {
    const ctx = { userId, shareId, bytes: 0, copied: new Map(), inFile: false, mimeType: '' };
    const messages = [];
    for (const message of (read.messages || []).slice(0, limits.messages)) {
      const parts = [];
      for (const part of Array.isArray(message.parts) ? message.parts : []) {
        const clean = typeof part?.text === 'string' ? { ...part, text: textForShare(part.text, message.role) } : part;
        ctx.mimeType = String(clean?.inlineData?.mimeType || clean?.sandboxFile?.mimeType || '');
        parts.push(await rewrite(clean, ctx));
      }
      messages.push({ role: message.role, createdAt: message.created_at, parts });
    }
    const model = MODELS.find((entry) => entry.id === read.conversation.model || entry.apiId === read.conversation.model);
    const snapshot = { v: 1, title: String(read.conversation.title || ''), model: String(read.conversation.model || ''), modelName: model?.name || '', createdAt: read.conversation.created_at, messages };
    const bytes = Buffer.byteLength(JSON.stringify(snapshot));
    if (bytes > limits.snapshotBytes) throw new ShareError('The conversation is too large to share.', 'too_large', { what: 'text' });
    return { snapshot, assets: [...ctx.copied.keys()].map((hash) => `${shareId}/${hash}`), bytes };
  }

  const readConversation = async (userId, conversationId) => {
    const read = await db.rpc('server_read_conversation_for_share', { p_user_id: userId, p_conversation_id: conversationId });
    if (!read) throw new ShareError('That conversation is not there.', 'not_found');
    return read;
  };

  const cleanUp = async (userId, shareId) => {
    try {
      await db.rpc('server_drop_conversation_share', { p_user_id: userId, p_share_id: shareId });
      await store.removeAll(await store.list(shareId));
    } catch (error) {
      log('share_cleanup_failed', { name: error?.name || 'Error' });
    }
  };

  /** Makes a share of a conversation. Resolves { id, code, mode, showName, title, createdAt }. */
  async function create({ userId, conversationId, mode, showName = false, ownerName = '' }) {
    if (mode !== 'view' && mode !== 'continue') throw new ShareError('The mode is not known.', 'bad_request');
    const read = await readConversation(userId, conversationId);
    if (Number(read.active_shares) >= limits.shares) throw new ShareError('The limit of shares is reached.', 'limit', { limit: limits.shares });
    const shareId = randomUUID();
    const code = newShareCode();
    const name = String(ownerName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    try {
      await db.rpc('server_create_conversation_share', { p_share_id: shareId, p_user_id: userId, p_conversation_id: conversationId, p_code: code, p_mode: mode, p_show_name: showName === true, p_owner_name: name, p_title: read.conversation.title, p_limit: limits.shares });
    } catch (error) {
      if (/share_limit/.test(String(error?.message))) throw new ShareError('The limit of shares is reached.', 'limit', { limit: limits.shares });
      throw new ShareError('The share could not be made.', 'database');
    }
    try {
      const built = await buildSnapshot({ read, userId, shareId });
      const done = await db.rpc('server_finish_conversation_share', { p_share_id: shareId, p_user_id: userId, p_title: read.conversation.title, p_snapshot: built.snapshot, p_snapshot_bytes: built.bytes, p_show_name: null, p_owner_name: null });
      if (done !== true) throw new ShareError('The share could not be finished.', 'database');
    } catch (error) {
      await cleanUp(userId, shareId);
      throw error instanceof ShareError ? error : new ShareError('The share could not be made.', 'database');
    }
    return { id: shareId, code, mode, showName: showName === true, title: read.conversation.title, createdAt: new Date(now()).toISOString() };
  }

  /** Makes the snapshot of an active share again from the conversation as it is now (the code stays). */
  async function refresh({ userId, shareId }) {
    const share = await db.rpc('server_get_conversation_share', { p_user_id: userId, p_share_id: shareId });
    if (!share) throw new ShareError('That share is not there.', 'not_found');
    if (share.status !== 'active') throw new ShareError('That share is not active.', 'not_active');
    const read = await readConversation(userId, share.conversation_id);
    let built;
    try {
      built = await buildSnapshot({ read, userId, shareId });
      const done = await db.rpc('server_finish_conversation_share', { p_share_id: shareId, p_user_id: userId, p_title: read.conversation.title, p_snapshot: built.snapshot, p_snapshot_bytes: built.bytes, p_show_name: null, p_owner_name: null });
      if (done !== true) throw new ShareError('The share could not be finished.', 'database');
    } catch (error) {
      throw error instanceof ShareError ? error : new ShareError('The share could not be made again.', 'database');
    }
    // What the conversation no longer holds is no longer shown.
    try {
      const keep = new Set(built.assets);
      await store.removeAll((await store.list(shareId)).filter((name) => !keep.has(name)));
    } catch (error) {
      log('share_prune_failed', { name: error?.name || 'Error' });
    }
    return { id: shareId, code: share.code, mode: share.mode, showName: share.show_name === true, title: read.conversation.title, createdAt: share.created_at };
  }

  /** One pass: the files that no share points to are removed, and the shares that stayed half made are dropped. Never throws. */
  async function sweepOnce() {
    const result = { removed: 0, dropped: 0 };
    try {
      result.dropped = Number(await db.rpc('server_drop_stale_building_shares', { p_older_than: '1 hour' })) || 0;
      for (let batch = 0; batch < 10; batch += 1) {
        const rows = await db.rpc('orphan_shared_assets', { p_limit: 500 });
        const names = (Array.isArray(rows) ? rows : []).map((row) => row?.name).filter((name) => typeof name === 'string');
        if (!names.length) break;
        result.removed += await store.removeAll(names);
        if (names.length < 500) break;
      }
    } catch (error) {
      log('share_sweep_failed', { name: error?.name || 'Error', status: error?.status || 0 });
    }
    if (result.removed || result.dropped) log('share_sweep', result);
    return result;
  }

  return {
    create,
    refresh,
    sweepOnce,
    start() {
      if (!repeat) repeat = setRepeat(() => { void sweepOnce(); }, SWEEP_EVERY_MS);
      repeat?.unref?.();
    },
    stop() {
      if (repeat) clearRepeat(repeat);
      repeat = null;
    }
  };
}
