// The addresses of the pages of the projects: noureon.com/projects (the list) and noureon.com/projects/<id> (one project) while they are open, noureon.com when closed.
// Kept apart from the page so the runtime can read an address without loading the page.

export const PROJECTS_PATH = '/projects';

/** The address of a project's page. */
export const projectPath = (id) => `${PROJECTS_PATH}/${encodeURIComponent(String(id))}`;

/** What an address opens: { list: true }, { id } (a project) or null when the address is not the projects'. A closing slash does not matter. */
export function projectsRouteFromPath(pathname = '') {
  const path = String(pathname).replace(/\/+$/, '') || '/';
  if (path === PROJECTS_PATH) return { list: true };
  const match = /^\/projects\/([^/]+)$/.exec(path);
  if (!match) return null;
  try { return { id: decodeURIComponent(match[1]) }; } catch { return null; }
}
