// A web address as a source of a project (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §11): it is kept as the address only, and the model reads the page when it needs it (the tool
// read_project_file fetches it with the person's own key of the reading service), so nothing is checked when it is added and nothing goes stale. Pure: no window, no document.

export const PROJECT_URL_MAX = 2000;

/** The address as it is kept (http or https, no user name or password), or '' when it is not one. */
export function normalizeSourceUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > PROJECT_URL_MAX || /\s/.test(raw)) return '';
  // A person pastes "example.com/page" without the scheme: https is assumed.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    if (!url.hostname.includes('.') && !/^\[.*\]$/.test(url.hostname) && url.hostname !== 'localhost') return '';
    return url.href.length <= PROJECT_URL_MAX ? url.href : '';
  } catch {
    return '';
  }
}

/** The name of the site: its host without a leading "www.". */
export const sourceUrlHost = (url) => {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return ''; }
};

/** The title a source of an address gets: the host and what follows it (a short path). */
export function sourceUrlTitle(url) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`;
    const title = `${sourceUrlHost(url)}${path}`;
    return title.length > 120 ? `${title.slice(0, 119)}…` : title;
  } catch {
    return String(url || '').slice(0, 120);
  }
}

/** Where the small picture of the site is (its own /favicon.ico, asked by the browser), or ''. */
export function sourceUrlIcon(url) {
  try { return `${new URL(url).origin}/favicon.ico`; } catch { return ''; }
}
