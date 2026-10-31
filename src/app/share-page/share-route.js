// The address of a shared conversation: noureon.com/s/<code> (docs/superpowers/specs/2026-10-31-conversation-share-design.md). The same page of the site serves it (vercel.json), and the
// start of the page (src/main.js) shows the viewer instead of the app, as it does for the password recovery.

const ROUTE = /^\/s\/([^/]+)\/?$/;
const CODE = /^[A-Za-z0-9]{24,64}$/;

/** Where the person who chose "copy to my conversations" is waiting for the app to take the code: the app reads it once it has a signed-in cloud account. */
export const PENDING_SHARE_KEY = 'noureon:pending-share';

export const isShareRoute = (pathname) => ROUTE.test(String(pathname || ''));

/** The code in the address, or '' when it cannot be one (the page then says the share was not found). */
export const shareCodeOf = (pathname) => {
  const code = ROUTE.exec(String(pathname || ''))?.[1] || '';
  return CODE.test(code) ? code : '';
};

/** noureon.com/admin/shares: where the owner of the service reviews the reports. */
export const ADMIN_SHARES_ROUTE = '/admin/shares';
export const isAdminSharesRoute = (pathname) => String(pathname || '').replace(/\/+$/, '') === ADMIN_SHARES_ROUTE;

/** `?review=1` on the address of a share: the owner of the service reads it whatever its status. */
export const isReviewRequest = (search) => new URLSearchParams(String(search || '')).get('review') === '1';
