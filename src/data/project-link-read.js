// Reading the page of a web address that is a source of a project (src/data/project-source-url.js): `fetchPages(urls, signal, { maxChars })` is the reader of web pages the page or the server has
// (src/app/runtime/features/web-research-tools.js: Tavily or TinyFish, with the person's own key); this gives the loader its `readLink(entry)`. Pure: no window, no document.

/** The most characters of a page that are kept for a reply (the model reads them a part at a time). */
export const LINK_PAGE_CHARS = 100_000;

/** `getFetchPages()` gives the reader (or null when there is none). Returns `readLink(entry)`: resolves the text of the page; throws an error with `code` 'noReader' or 'failed'. */
export function createLinkReader({ getFetchPages, signal = null }) {
  return async (entry) => {
    const fetchPages = getFetchPages();
    if (typeof fetchPages !== 'function') throw Object.assign(new Error('There is no reader of web pages.'), { code: 'noReader' });
    const { pages = [], failed = [] } = await fetchPages([entry.url], signal || undefined, { maxChars: LINK_PAGE_CHARS });
    const text = String(pages[0]?.text || '');
    if (text.trim()) return text;
    const reason = failed[0]?.reason;
    throw Object.assign(new Error(reason || 'The page could not be read.'), { code: reason === 'noReader' ? 'noReader' : 'failed' });
  };
}
