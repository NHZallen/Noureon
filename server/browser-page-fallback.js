// Reading a page with the real browser when the page readers (Tavily, TinyFish) cannot: a page drawn by JavaScript gives them no text, a site may refuse them, or no reader key is set.
// Only a reply that has the browser (the person may use it, `createBrowserLoader`) does this, with that reply's own browser, in a tab of its own that is closed again; a browser is never started
// only to read a page. There is no limit on how many pages a reply reads this way (the reply code already stops fetching a site that failed three times). The wrapper keeps the shape of `fetchPageContents` ({ pages, failed }), so the reply code that asks for pages does not change.
export function withBrowserReading(openPage, loader, { log = () => {} } = {}) {
  if (typeof openPage !== 'function' || typeof loader?.readPage !== 'function') return openPage;
  return async function openPageWithBrowser(urls, signal, options = {}) {
    const result = await openPage(urls, signal, options);
    const missing = (result?.failed || []).filter((item) => item?.url);
    if (!missing.length) return result;
    const pages = [...(result.pages || [])];
    const failed = [];
    for (const item of missing) {
      if (signal?.aborted) { failed.push(item); continue; }
      let page = null;
      try { page = await loader.readPage(item.url, { maxChars: options.maxChars }); } catch { page = null; }
      if (page?.text) { pages.push(page); log('browser_page_read', { reason: item.reason || '' }); } else failed.push(item);
    }
    return { ...result, pages, failed, ...(pages.length > (result.pages || []).length ? { reader: result.reader || 'browser' } : {}) };
  };
}
