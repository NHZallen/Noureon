// The addresses of the Extensions page (擴充): noureon.com/store/skills and noureon.com/store/cli while it is open, noureon.com when it is closed.
// /store alone means the first one (skills), and the old address /cli (the page was the CLI tools' store before it had two parts) still comes
// to the CLI part. Kept apart from the page itself so the runtime can read an address without loading the page.

export const STORE_PATH = '/store';
export const STORE_KINDS = Object.freeze(['skills', 'cli']);
export const DEFAULT_STORE_KIND = 'skills';

/** The address of one part of the page. */
export const storePath = (kind) => `${STORE_PATH}/${STORE_KINDS.includes(kind) ? kind : DEFAULT_STORE_KIND}`;

/** Which part an address opens: 'skills' or 'cli', or null when the address is not the page's. */
export function storeKindFromPath(pathname = '') {
  const path = String(pathname).replace(/\/+$/, '') || '/';
  if (path === '/cli') return 'cli';
  if (path === STORE_PATH) return DEFAULT_STORE_KIND;
  const match = /^\/store\/([a-z]+)$/.exec(path);
  return match && STORE_KINDS.includes(match[1]) ? match[1] : null;
}
