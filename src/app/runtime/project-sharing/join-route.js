// The address of an invitation to a project: noureon.com/join/<code> (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §8). The same page of the site serves it (vercel.json); the
// start of the page keeps the code for the app (it asks once there is a signed-in cloud account) and takes it out of the address bar.

const ROUTE = /^\/join\/([^/]+)\/?$/;
const CODE = /^[A-Za-z0-9]{24,64}$/;

/** Where the code waits for the app. */
export const PENDING_JOIN_KEY = 'noureon:pending-join';
const PENDING_MAX_MS = 24 * 60 * 60 * 1000;

export const isJoinRoute = (pathname) => ROUTE.test(String(pathname || ''));

/** The code in the address, or '' when it cannot be one. */
export const joinCodeOf = (pathname) => {
  const code = ROUTE.exec(String(pathname || ''))?.[1] || '';
  return CODE.test(code) ? code : '';
};

/** Called at the start of the page: puts the code aside and shows the address of the app. */
export function rememberJoinCode(window, now = Date.now()) {
  const code = joinCodeOf(window.location.pathname);
  if (code) { try { window.localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ code, at: now })); } catch { /* the person opens the link again */ } }
  try { window.history.replaceState(null, '', '/'); } catch { /* the address stays */ }
  return code;
}

/** The code that waits, or '' (a code older than a day is forgotten). */
export function readPendingJoin(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(PENDING_JOIN_KEY) || 'null');
    if (value?.code && CODE.test(value.code) && now - Number(value.at || 0) < PENDING_MAX_MS) return value.code;
  } catch { /* nothing waits */ }
  return '';
}

export const clearPendingJoin = (storage) => { try { storage.removeItem(PENDING_JOIN_KEY); } catch { /* nothing */ } };

/** The address a person gives to someone to join. */
export const joinUrl = (origin, code) => `${String(origin).replace(/\/+$/, '')}/join/${code}`;

// The address of a conversation of a shared project, for the people of the project: noureon.com/c/<project>/<conversation>. It opens the conversation for a signed-in member; anyone else is told
// they are not a member. Kept for the app the same way an invitation is.

const CHAT_ROUTE = /^\/c\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/?$/i;
export const PENDING_CHAT_KEY = 'noureon:pending-chat-link';

export const isChatLinkRoute = (pathname) => CHAT_ROUTE.test(String(pathname || ''));
export const chatLinkOf = (pathname) => { const match = CHAT_ROUTE.exec(String(pathname || '')); return match ? { projectId: match[1].toLowerCase(), conversationId: match[2].toLowerCase() } : null; };
export const chatLinkUrl = (origin, projectId, conversationId) => `${String(origin).replace(/\/+$/, '')}/c/${projectId}/${conversationId}`;

export function rememberChatLink(window, now = Date.now()) {
  const link = chatLinkOf(window.location.pathname);
  if (link) { try { window.localStorage.setItem(PENDING_CHAT_KEY, JSON.stringify({ ...link, at: now })); } catch { /* the person opens the link again */ } }
  try { window.history.replaceState(null, '', '/'); } catch { /* the address stays */ }
  return link;
}

export function readPendingChatLink(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(PENDING_CHAT_KEY) || 'null');
    if (value?.projectId && value?.conversationId && now - Number(value.at || 0) < PENDING_MAX_MS) return { projectId: value.projectId, conversationId: value.conversationId };
  } catch { /* nothing waits */ }
  return null;
}

export const clearPendingChatLink = (storage) => { try { storage.removeItem(PENDING_CHAT_KEY); } catch { /* nothing */ } };
