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
  async function asset({ userId, projectId, path }) {
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

  return { read, asset, upload };
}
