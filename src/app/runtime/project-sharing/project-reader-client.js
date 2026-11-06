// What the page asks of the server to read a shared project (server/project-reader.js). A reader is made for one project: `load()` reads all of it, `refresh()` reads only what changed since (the
// conversations whose words changed come again with all their messages), and `conversation(id)` reads one conversation as it is now (a branch is made from that, never from what was drawn
// a while ago). Every call resolves { ok: true, project, changed } or { ok: false, code: 'gone' | 'sign_in' | 'generic' }; `project` is { role, sharedAt, project, owner, conversations }.

import { serverRequest } from '../cli/cli-server-bridge.js';

const MAX_PAGES = 200;

export function createSharedProjectReader({ projectId, request = serverRequest }) {
  const byId = new Map();
  let head = null;
  let next = null;

  async function pages({ since = null, conversationId = null } = {}) {
    let cursor = since;
    let first = null;
    const got = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let result;
      try { result = await request('POST', `/v1/projects/${projectId}/read`, { body: JSON.stringify({ ...(cursor ? { since: cursor } : {}), ...(conversationId ? { conversationId } : {}) }) }); } catch { return { ok: false, code: 'generic' }; }
      if (!result?.ok) return { ok: false, code: result?.status === 401 ? 'sign_in' : result?.status === 404 ? 'gone' : 'generic' };
      const data = result.data || {};
      first = first || data;
      got.push(...(data.conversations || []));
      if (!data.hasMore || !data.next || data.next === cursor) { cursor = data.next || cursor; break; }
      cursor = data.next;
    }
    return first ? { ok: true, first, got, cursor } : { ok: false, code: 'generic' };
  }

  const snapshot = () => ({ role: head.role, sharedAt: head.sharedAt, project: head.project, owner: head.owner, conversations: [...byId.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) });

  function merge(result) {
    let changed = !head || JSON.stringify(head.project) !== JSON.stringify(result.first.project) || head.role !== result.first.role;
    head = { role: result.first.role, sharedAt: result.first.sharedAt, project: result.first.project, owner: result.first.owner };
    for (const chat of result.got) {
      if (chat.deleted) { if (byId.delete(chat.id)) changed = true; } else { byId.set(chat.id, chat); changed = true; }
    }
    if (result.cursor) next = result.cursor;
    return changed;
  }

  return {
    async load() {
      const result = await pages();
      if (!result.ok) return result;
      byId.clear();
      head = null;
      merge(result);
      return { ok: true, project: snapshot(), changed: true };
    },
    async refresh() {
      if (!head) return this.load();
      const result = await pages({ since: next });
      if (!result.ok) return result;
      const changed = merge(result);
      return { ok: true, project: snapshot(), changed };
    },
    /** Only the project (its instructions, sources and notes, no conversation): a conversation id that nothing has is asked for. */
    async info() {
      const result = await pages({ conversationId: '00000000-0000-0000-0000-000000000000' });
      return result.ok ? { ok: true, project: { role: result.first.role, project: result.first.project, owner: result.first.owner } } : result;
    },
    /** The conversation as it is now, put in the reader too ({ ok: true, chat } or { ok: false }). */
    async conversation(id) {
      const result = await pages({ conversationId: id });
      if (!result.ok) return result;
      const chat = result.got.find((entry) => entry.id === id && !entry.deleted) || null;
      if (chat) byId.set(chat.id, chat);
      return chat ? { ok: true, chat } : { ok: false, code: 'gone' };
    }
  };
}

/** All of a project at once (the reader used one time). */
export const readSharedProject = ({ projectId, request = serverRequest }) => createSharedProjectReader({ projectId, request }).load();
