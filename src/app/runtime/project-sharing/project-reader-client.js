// What the page asks of the server to read a shared project (server/project-reader.js): the pages are read one after another until the project is all there. Resolves { ok: true, project }
// with { role, sharedAt, project, owner, conversations: [{ id, authorId, authorName, title, ..., messages }] } or { ok: false, code: 'gone' | 'sign_in' | 'generic' }.

import { serverRequest } from '../cli/cli-server-bridge.js';

const MAX_PAGES = 200;

export async function readSharedProject({ projectId, request = serverRequest }) {
  let since = null;
  let first = null;
  const byId = new Map();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let result;
    try { result = await request('POST', `/v1/projects/${projectId}/read`, { body: JSON.stringify(since ? { since } : {}) }); } catch { return { ok: false, code: 'generic' }; }
    if (!result?.ok) return { ok: false, code: result?.status === 401 ? 'sign_in' : result?.status === 404 ? 'gone' : 'generic' };
    const data = result.data || {};
    first = first || data;
    for (const chat of data.conversations || []) { if (chat.deleted) byId.delete(chat.id); else byId.set(chat.id, chat); }
    if (!data.hasMore || !data.next || data.next === since) break;
    since = data.next;
  }
  if (!first) return { ok: false, code: 'generic' };
  const conversations = [...byId.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { ok: true, project: { role: first.role, sharedAt: first.sharedAt, project: first.project, owner: first.owner, conversations } };
}
