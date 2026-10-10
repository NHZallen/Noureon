// The addresses of the Extensions page (擴充): noureon.com/skill for the skills and noureon.com/cli for the CLI tools while the page is open,
// noureon.com when it is closed. Kept apart from the page itself so the runtime can read an address without loading the page.

export const STORE_KINDS = Object.freeze(['skills', 'cli']);
export const DEFAULT_STORE_KIND = 'skills';
const PATHS = Object.freeze({ skills: '/skill', cli: '/cli' });

/** The address of one part of the page. */
export const storePath = (kind) => PATHS[kind] || PATHS[DEFAULT_STORE_KIND];

/** Which part an address opens: 'skills' or 'cli', or null when the address is not the page's. A closing slash does not matter. */
export function storeKindFromPath(pathname = '') {
  const path = String(pathname).replace(/\/+$/, '') || '/';
  return STORE_KINDS.find((kind) => PATHS[kind] === path) || null;
}
