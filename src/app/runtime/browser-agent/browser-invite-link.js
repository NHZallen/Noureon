// The address of an invite code of the browser agent: noureon.com/#browser-invite=NRN-XXXX-XXXX (docs/superpowers/specs/2026-11-16-browser-agent-design.md, the note of 2026-11-20).
// It works like the invitation to a project (runtime/project-sharing/join-route.js): the start of the page keeps the code for the app and takes it out of the address bar; once a person is
// signed in, the settings open on the browser agent with the code already in the box. Nothing is used up until the person presses the button.

const HASH = /^#browser-invite=([A-Za-z0-9-]{8,24})$/;
const CODE = /^[A-Z0-9]{3,4}(-[A-Z0-9]{3,4}){1,3}$/;

/** Where the code waits for the app. */
export const PENDING_INVITE_KEY = 'noureon:pending-browser-invite';
const PENDING_MAX_MS = 24 * 60 * 60 * 1000;

/** The code of an address hash, or '' when the hash is not a code. */
export const inviteCodeOf = (hash) => {
  const code = String(HASH.exec(String(hash || ''))?.[1] || '').toUpperCase();
  return CODE.test(code) ? code : '';
};

/** The address a person gives to a friend. */
export const inviteUrl = (origin, code) => `${String(origin).replace(/\/+$/, '')}/#browser-invite=${String(code).toUpperCase()}`;

/** Called at the start of the page: puts the code aside and takes it out of the address. */
export function rememberInviteCode(window, now = Date.now()) {
  const code = inviteCodeOf(window.location.hash);
  if (!code) return '';
  try { window.localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code, at: now })); } catch { /* the person opens the link again */ }
  try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); } catch { /* the address stays */ }
  return code;
}

/** The code that waits, or '' (a code older than a day is forgotten). */
export function readPendingInvite(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(PENDING_INVITE_KEY) || 'null');
    const code = String(value?.code || '').toUpperCase();
    if (CODE.test(code) && now - Number(value?.at || 0) < PENDING_MAX_MS) return code;
  } catch { /* nothing waits */ }
  return '';
}

export const clearPendingInvite = (storage) => { try { storage.removeItem(PENDING_INVITE_KEY); } catch { /* nothing */ } };
