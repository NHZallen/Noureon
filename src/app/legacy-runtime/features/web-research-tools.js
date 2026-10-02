// The two things the app does on the web for a model that has no search of its own: a search (Tavily or TinyFish, the one
// chosen in Settings) and the reading of whole pages (TinyFish's Fetch or Tavily's Extract). Used for the search packet that
// goes in front of a request, for the pages the user linked (provider-request-support.js) and for the model's own searching
// and page opening in a reply (web-research-reply.js).

import { getSearchProvider } from '../../runtime/kernel/search-provider.js';

const MAX_PAGES_AT_ONCE = 10;
// What was just looked up is not looked up again: a follow-up question, or the same page read twice, is answered from
// memory for a while. News goes stale sooner than the rest. Nothing is kept past the session.
const SEARCH_TTL_MS = 10 * 60_000;
const NEWS_TTL_MS = 2 * 60_000;
const PAGE_TTL_MS = 15 * 60_000;
const MAX_CACHED_SEARCHES = 40;
const MAX_CACHED_PAGES = 12;

export function createWebResearchTools({
  getConfig,
  getApiKeyForProvider,
  fetchImpl = fetch,
  getErrorMessage,
  readErrorBody,
  normalizeTinyfishSearch,
  normalizePageReads,
  now = () => Date.now()
}) {
  const postWithKey = async (url, { apiKey, body, signal, failure }) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });
    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      throw new Error(getErrorMessage(errorBody, `${failure} HTTP ${response.status}`));
    }
    return response.json();
  };

  const depth = () => (getConfig().tavilySearchDepth === 'advanced' ? 'advanced' : 'basic');

  /** Whether a search or a page reader can be used: the key of one of the two is set. */
  const hasKey = () => ['tinyfish', 'tavily'].some((name) => Boolean(getApiKeyForProvider(name)));

  const otherSource = (name) => (name === 'tinyfish' ? 'tavily' : 'tinyfish');

  /** One search at one source (Tavily or TinyFish). Throws when its key is not set. */
  const searchAt = async (source, { query, topic = 'general', maxResults = 6, searchDepth, signal }) => {
    const apiKey = getApiKeyForProvider(source);
    if (!apiKey) throw new Error(`No ${source} API key`);
    if (source === 'tinyfish') {
      return normalizeTinyfishSearch(await postWithKey('/api/tinyfish-search', {
        apiKey,
        signal,
        failure: 'TinyFish',
        body: { query, domain_type: topic === 'news' ? 'news' : 'web' }
      }), maxResults);
    }
    return postWithKey('/api/tavily-search', {
      apiKey,
      signal,
      failure: 'Tavily',
      body: {
        query,
        search_depth: searchDepth || depth(),
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: true,
        topic
      }
    });
  };

  // The chosen source is asked first. When it fails or finds nothing, the other is asked if its key is set; with only one
  // key set nothing else is tried or required, and its error is the error.
  const searchAcross = async (params) => {
    const chosen = getSearchProvider(getConfig());
    const order = [chosen, otherSource(chosen)].filter((name) => getApiKeyForProvider(name));
    if (order.length === 0) throw new Error(`No ${chosen} API key`);
    let empty = null;
    let failure = null;
    for (const source of order) {
      try {
        const data = await searchAt(source, params);
        if ((Array.isArray(data?.results) ? data.results : []).length > 0) return data;
        empty ??= data;
      } catch (error) {
        if (params.signal?.aborted || error?.name === 'AbortError') throw error;
        failure ??= error;
      }
    }
    if (empty) return empty;
    throw failure || new Error(`No ${chosen} API key`);
  };

  const remember = (cache, key, value, limit) => {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > limit) cache.delete(cache.keys().next().value);
  };
  const searches = new Map();
  const pagesRead = new Map();

  /** A web search from the chosen source: { results: [{ title, url, content }] }. Throws when no key is set. */
  const searchWeb = async (params) => {
    const { query, topic = 'general', maxResults = 6, searchDepth } = params;
    const key = [getSearchProvider(getConfig()), searchDepth || depth(), topic, maxResults, String(query || '').trim().toLowerCase()].join('|');
    const hit = searches.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.data;
    const data = await searchAcross(params);
    // An empty answer or an error is not kept: it is asked again.
    if ((Array.isArray(data?.results) ? data.results : []).length > 0) {
      remember(searches, key, { at: now(), ttl: topic === 'news' ? NEWS_TTL_MS : SEARCH_TTL_MS, data }, MAX_CACHED_SEARCHES);
    }
    return data;
  };

  // The one that is the search source is tried first, the other if it has no key or leaves pages unread, so having
  // either key is enough.
  const PAGE_READERS = {
    tinyfish: (urls, apiKey, signal) => postWithKey('/api/tinyfish-fetch', {
      apiKey,
      signal,
      failure: 'TinyFish',
      body: { urls, format: 'markdown' }
    }),
    tavily: (urls, apiKey, signal) => postWithKey('/api/tavily-extract', {
      apiKey,
      signal,
      failure: 'Tavily',
      body: { urls, extract_depth: 'advanced', format: 'markdown', include_images: false }
    })
  };

  /**
   * Reads whole pages (up to ten at a time). Returns { pages, failed, reader }, with `failed` as [{ url, reason }]
   * ('noReader' when there is no key at all, 'failed' when the pages could not be read). Only a stop by the person throws.
   */
  const fetchPageContents = async (urls, signal, options = {}) => {
    const requested = [...new Set((urls || []).map((url) => String(url || '').trim()).filter((url) => /^https?:\/\//i.test(url)))].slice(0, MAX_PAGES_AT_ONCE);
    if (requested.length === 0) return { pages: [], failed: [], reader: null };
    const maxChars = options.maxChars || 8000;
    // Pages read a moment ago come from memory; only the others are fetched.
    const fromMemory = [];
    const toFetch = [];
    for (const url of requested) {
      const hit = pagesRead.get(`${url}|${maxChars}`);
      if (hit && now() - hit.at < PAGE_TTL_MS) fromMemory.push(hit.page);
      else toFetch.push(url);
    }
    if (toFetch.length === 0) return { pages: fromMemory, failed: [], reader: null };
    const first = getSearchProvider(getConfig());
    const readers = [first, first === 'tinyfish' ? 'tavily' : 'tinyfish'].filter((reader) => getApiKeyForProvider(reader));
    if (readers.length === 0) {
      return { pages: fromMemory, failed: toFetch.map((url) => ({ url, reason: 'noReader' })), reader: null };
    }
    const pages = [];
    let unread = toFetch;
    let used = null;
    for (const reader of readers) {
      if (unread.length === 0) break;
      try {
        const data = await PAGE_READERS[reader](unread, getApiKeyForProvider(reader), signal);
        const read = normalizePageReads(data, { requested: unread, maxChars });
        if (read.pages.length > 0) used ??= reader;
        pages.push(...read.pages);
        unread = read.failed;
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;
      }
    }
    for (const page of pages) {
      for (const address of new Set([page.url, page.finalUrl])) {
        if (address) remember(pagesRead, `${address}|${maxChars}`, { at: now(), page }, MAX_CACHED_PAGES * 2);
      }
    }
    return { pages: [...fromMemory, ...pages], failed: unread.map((url) => ({ url, reason: 'failed' })), reader: used };
  };

  return { fetchPageContents, hasKey, searchWeb };
}
