// A member reads a shared project (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §5 and §6): the project and the conversations of everyone in it, with their messages. The database
// gives the rows through `server_read_project_for_member` (only to this server, and only for a person who is in the project); here what belongs to the personal memory of the person who shared the
// project is taken out of the messages that are older than the sharing (the notes used, the changes made, the conversations looked into and their steps), as it is for the snapshot of a shared
// conversation (shares.js). What is written after the sharing only used the memory of the project, and stays.

import { textForShare } from './shares.js';

const MEMORY_KEYS = ['memoryUsed', 'memoryUpdated', 'memoryHistory'];
const PAGE = 50;

export class ProjectReadError extends Error {
  /** `code`: 'not_found' (no such project for this person), 'database'. */
  constructor(message, code) {
    super(message);
    this.name = 'ProjectReadError';
    this.code = code;
  }
}

/** A message as a member sees it: before the sharing without anything of the personal memory. */
export function messageForMember(message, { sharedAt }) {
  const old = Boolean(sharedAt) && new Date(message.created_at).getTime() < new Date(sharedAt).getTime();
  let metadata = message.metadata && typeof message.metadata === 'object' ? { ...message.metadata } : null;
  let parts = Array.isArray(message.parts) ? message.parts : [];
  if (old) {
    if (metadata) for (const key of MEMORY_KEYS) delete metadata[key];
    parts = parts.map((part) => (typeof part?.text === 'string' ? { ...part, text: textForShare(part.text, message.role) } : part));
  }
  if (metadata && !Object.keys(metadata).length) metadata = null;
  return { id: message.id, role: message.role, parts, ...(metadata ? { metadata } : {}), createdAt: message.created_at, sequence: message.sequence };
}

export function createProjectReader({ db, files = null, pageSize = PAGE } = {}) {
  /** A file of the project for a member, as base64: only when the project holds it (supabase/migrations/20261106040000_add_project_asset_access.sql). */
  async function asset({ userId, projectId, path, hash = '' }) {
    // A file named by its hash alone is in the folder of the owner of the project (the page may not know the owner yet: a project opened from what was kept on the device).
    if (!path && /^[0-9a-f]{64}$/.test(String(hash))) {
      let access = null;
      try { access = await db.rpc('server_project_memory_access', { p_user_id: userId, p_project_id: projectId }); } catch { throw new ProjectReadError('The project could not be read.', 'database'); }
      if (!access?.owner_id) throw new ProjectReadError('That file is not in this project.', 'not_found');
      path = `${access.owner_id}/${hash}`;
    }
    let allowed = false;
    try { allowed = (await db.rpc('server_project_asset_allowed', { p_user_id: userId, p_project_id: projectId, p_path: path })) === true; } catch { throw new ProjectReadError('The project could not be read.', 'database'); }
    if (!allowed || !files?.loadPath) throw new ProjectReadError('That file is not in this project.', 'not_found');
    try { return { data: Buffer.from(await files.loadPath(path)).toString('base64') }; } catch (error) {
      throw new ProjectReadError(error?.message || 'The file could not be read.', error?.code === 'too_large' ? 'too_large' : error?.status === 404 ? 'not_found' : 'database');
    }
  }

  /** Resolves the page of the project from `since` on: { role, sharedAt, project, owner, conversations: [{ ..., messages }], hasMore, next }. */
  async function read({ userId, projectId, since = null, conversationId = null }) {
    let result;
    try {
      result = await db.rpc('server_read_project_for_member', { p_user_id: userId, p_project_id: projectId, p_since: since, p_limit: pageSize, p_conversation_id: conversationId });
    } catch {
      throw new ProjectReadError('The project could not be read.', 'database');
    }
    if (!result) throw new ProjectReadError('That project is not there.', 'not_found');
    const byConversation = new Map();
    for (const message of result.messages || []) {
      const list = byConversation.get(message.conversation_id) || [];
      list.push(messageForMember(message, { sharedAt: result.shared_at }));
      byConversation.set(message.conversation_id, list);
    }
    const conversations = (result.conversations || []).map((chat) => {
      const metadata = chat.metadata && typeof chat.metadata === 'object' ? chat.metadata : {};
      return {
        id: chat.id, authorId: chat.author_id, authorName: chat.author_name, title: chat.title, model: chat.model, provider: chat.provider,
        createdAt: chat.created_at, updatedAt: chat.updated_at, deleted: Boolean(chat.deleted_at),
        ...(metadata.branchedFrom && typeof metadata.branchedFrom === 'object' ? { branchedFrom: metadata.branchedFrom } : {}),
        messages: chat.deleted_at ? [] : byConversation.get(chat.id) || []
      };
    });
    return {
      role: result.role, sharedAt: result.shared_at, project: result.project, owner: { id: result.owner_id, name: result.owner_name },
      conversations, hasMore: Boolean(result.has_more), next: conversations.length ? conversations.at(-1).updatedAt : since
    };
  }
  /**
   * An editor (or the owner) adds a file to a shared project: it is kept in the OWNER's folder of the cloud storage (the space it takes counts for the owner), and the answer is what the page puts in
   * the source: { hash, mimeType, size, asset }. A chat member may not. The page then writes the source into the project with `update_shared_project`.
   */
  async function upload({ userId, projectId, bytes, mimeType = 'application/octet-stream' }) {
    let access = null;
    try { access = await db.rpc('server_project_memory_access', { p_user_id: userId, p_project_id: projectId }); } catch { throw new ProjectReadError('The project could not be read.', 'database'); }
    if (!access) throw new ProjectReadError('That project is not there.', 'not_found');
    if (access.role === 'chat') throw new ProjectReadError('A chat member cannot add files.', 'forbidden');
    if (!files?.save) throw new ProjectReadError('Storage is not set up.', 'database');
    try {
      const marker = await files.save({ userId: access.owner_id, bytes, mimeType });
      const path = marker.__astraCloudAsset.path;
      return { hash: path.slice(path.indexOf('/') + 1), mimeType, size: bytes.byteLength, asset: marker };
    } catch (error) {
      throw new ProjectReadError(error?.message || 'The file could not be saved.', error?.code === 'quota' ? 'quota' : 'database');
    }
  }

  /**
   * A member leaves (the person asks) or is taken out (the owner asks) and the project keeps what they made in it: the conversations are copied to the OWNER, with the files they hold (the owner's
   * space pays; a file that does not fit, or is not there any more, is replaced by a line that says so, and the text of the message stays). The ids of the copies come from the ids of the originals,
   * so a second try makes no second copy. Resolves { conversations, files: { copied, skipped } }. It is called before the member is taken out; the database function that takes them out then gives
   * the originals back to their author.
   */
  async function keepConversations({ userId, projectId, memberId }) {
    let data;
    try { data = await db.rpc('server_collect_project_copy', { p_actor_id: userId, p_project_id: projectId, p_member_id: memberId }); } catch { throw new ProjectReadError('The project could not be read.', 'database'); }
    if (!data) throw new ProjectReadError('That is not allowed.', 'forbidden');
    const conversations = Array.isArray(data.conversations) ? data.conversations : [];
    if (!conversations.length) return { conversations: 0, files: { copied: 0, skipped: 0 } };
    if (!files?.copyFile) throw new ProjectReadError('Storage is not set up.', 'database');
    const owner = data.owner_id;
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const pattern = new RegExp(`${memberId}/([0-9a-f]{64})`, 'g');
    const hashes = new Set();
    for (const message of messages) for (const match of JSON.stringify(message.parts ?? []).matchAll(pattern)) hashes.add(match[1]);
    const state = new Map();
    let failed = false;
    for (const hash of hashes) {
      try {
        const done = await files.copyFile({ fromUserId: memberId, toUserId: owner, hash });
        state.set(hash, done.status === 'copied' || done.status === 'there');
      } catch { state.set(hash, false); failed = true; }
    }
    if (failed && [...state.values()].every((ok) => !ok)) throw new ProjectReadError('The files could not be copied.', 'database');
    const rewritten = messages.map((message) => {
      const parts = (Array.isArray(message.parts) ? message.parts : []).map((part) => {
        const text = JSON.stringify(part);
        const found = [...new Set([...text.matchAll(pattern)].map((match) => match[1]))];
        if (!found.length) return part;
        if (!found.every((hash) => state.get(hash))) {
          const name = typeof part?.name === 'string' ? part.name : typeof part?.fileName === 'string' ? part.fileName : typeof part?.inlineData?.name === 'string' ? part.inlineData.name : '';
          return { text: `[Attachment not kept${name ? `: ${name.slice(0, 120)}` : ''}]` };
        }
        let out = text;
        for (const hash of found) out = out.split(`${memberId}/${hash}`).join(`${owner}/${hash}`);
        return JSON.parse(out);
      });
      return { ...message, parts };
    });
    let stored;
    try { stored = await db.rpc('server_store_project_copy', { p_project_id: projectId, p_member_id: memberId, p_conversations: conversations, p_messages: rewritten }); } catch { throw new ProjectReadError('The conversations could not be kept.', 'database'); }
    const copied = [...state.values()].filter(Boolean).length;
    return { conversations: Number(stored) || 0, files: { copied, skipped: state.size - copied } };
  }

  return { read, asset, upload, keepConversations };
}
