// What the page of the reports (and any page that is not for the person who opens it) shows to everyone else: the very page the platform gives an address that is not there, not a page of Noureon
// that says "not found" (which would show the address exists). The real one is asked for with an address that cannot exist and written in place, so the address bar keeps what the person typed.

/** Replaces the document with the platform's own 404 page (or a bare "404" when it cannot be read). Resolves true when the real one was written. */
export async function showPlatformNotFound({ window, document, fetchImpl } = {}) {
  const ask = fetchImpl || window?.fetch?.bind(window);
  try {
    const response = await ask(`/${Math.random().toString(36).slice(2, 14)}`, { credentials: 'omit', cache: 'no-store' });
    if (response.status === 404) {
      const html = await response.text();
      document.open();
      document.write(html);
      document.close();
      return true;
    }
  } catch { /* the bare page below */ }
  const title = document.createElement('title');
  title.textContent = '404: NOT_FOUND';
  document.head.replaceChildren(title);
  document.body.replaceChildren();
  document.body.textContent = '404: NOT_FOUND';
  return false;
}
