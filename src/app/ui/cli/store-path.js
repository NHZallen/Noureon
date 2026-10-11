// The addresses of the Extensions page (擴充): noureon.com/skill for the skills, noureon.com/cli for the CLI tools and noureon.com/connectors for the connectors while the page is open,
// noureon.com when it is closed. Kept apart from the page itself so the runtime can read an address without loading the page.

export const STORE_KINDS = Object.freeze(['skills', 'cli', 'connectors']);
export const DEFAULT_STORE_KIND = 'skills';
const PATHS = Object.freeze({ skills: '/skill', cli: '/cli', connectors: '/connectors' });

/** The address of one part of the page. */
export const storePath = (kind) => PATHS[kind] || PATHS[DEFAULT_STORE_KIND];

/** Which part an address opens: 'skills', 'cli' or 'connectors', or null when the address is not the page's. A closing slash does not matter. */
export function storeKindFromPath(pathname = '') {
  const path = String(pathname).replace(/\/+$/, '') || '/';
  return STORE_KINDS.find((kind) => PATHS[kind] === path) || null;
}
